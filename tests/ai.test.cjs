'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
const {Game}=require('../engine.js');
const S=require('../ai/strategy.cjs');
const {AgentSession,diff}=require('../ai/session.cjs');
const {Table}=require('../ai/table.cjs');
const {CodexProvider,OllamaProvider}=require('../ai/providers.cjs');
const {createHost}=require('../server.cjs');
const roster=(type='heuristic')=>[0,1].map(i=>({type,model:type==='ollama'?'test':'',name:'Seat '+i}));
const response=(actionId,extra={})=>JSON.stringify({type:'act',actionId,tool:'',actionIds:[],proposal:null,memory:'Keep $200 in reserve.',rationale:'Protect cash while collecting sets.',say:'Good luck at the table.',...extra});
function fakeProvider(choose){const p={calls:[],async complete(r){p.calls.push(JSON.parse(JSON.stringify({...r,signal:undefined})));return{text:choose?choose(r,p.calls.length):response('roll'),usage:{input:100,output:20,cached:40,durationMs:3}};},forget(){}};return p;}
test('hosted roster and controller saves preserve human / model seats; model debt waits for a decision',()=>{
 const g=new Game({players:roster('ollama'),startingCash:10});g.queue(1,0,100,'rent');g.processPayments();assert.equal(g.s.phase,'debt');assert.equal(g.s.debt.from,1);assert.equal(g.s.players[1].out,false);assert.equal(Game.load(g.s).s.players[0].bot,true);Game.validate(g.s);
});
test('public observations exclude PRNG state and hidden deck order',()=>{const g=new Game({players:roster()});const s=S.publicState(g);assert.equal(s.seed,undefined);assert.equal(s.decks,undefined);assert.equal(s.props.length,40);assert.equal(s.rules.doubleGo,false);});
test('state deltas reconstruct every changed public field',()=>{
 const g=new Game({players:roster()});const old=S.publicState(g);g.roll([1,2]);const now=S.publicState(g);const patched=structuredClone(old);
 for(const p of diff(old,now)){let t=patched;for(const key of p.path.slice(0,-1))t=t[key];if(p.remove)delete t[p.path.at(-1)];else t[p.path.at(-1)]=p.value;}assert.deepEqual(patched,now);
});
test('agent sessions send snapshots once, then deltas; bound history and preserve private memory',async()=>{
 const p=fakeProvider(),g=new Game({players:roster('ollama')}),s=new AgentSession(0,{type:'ollama',model:'test'},p);const a=S.legalActions(g,0);
 await s.decide(g,a,{revision:0});g.s.players[0].cash-=10;await s.decide(g,a,{revision:1});
 const first=JSON.parse(p.calls[0].text),second=JSON.parse(p.calls[1].text);assert.ok(first.snapshot);assert.ok(!second.snapshot&&second.patch);assert.equal(first.snapshot.seed,undefined);assert.equal(second.memory,'Keep $200 in reserve.');assert.equal(p.calls[1].messages[0].content,p.calls[0].messages[0].content);assert.equal(s.metrics.decisions,2);
 s.age=24;await s.decide(g,a,{revision:2});assert.ok(JSON.parse(p.calls[2].text).snapshot);assert.equal(s.metrics.compactions,1);assert.equal(p.calls[2].messages.length,2);assert.equal(s.save().memory,'Keep $200 in reserve.');
});
test('bounded host analysis tools run between model decisions; malformed actions get one repair',async()=>{
 const p=fakeProvider((r,n)=>n===1?response('',{type:'analyze',tool:'risk'}):n===2?'{}':response('roll'));const g=new Game({players:roster('ollama')}),s=new AgentSession(0,{type:'ollama',model:'test'},p);
 const d=await s.decide(g,S.legalActions(g,0),{});assert.equal(d.action.id,'roll');assert.equal(p.calls.length,3);assert.ok(JSON.parse(p.calls[1].text).result.recommendedReserve);assert.ok(JSON.parse(p.calls[2].text).validationError);
});
test('rollouts do not consume or reveal the actual game RNG or deck order',()=>{
 const g=new Game({players:roster()}),before=JSON.stringify(g.s),a=S.legalActions(g,0);const r=S.analyze(g,0,'simulate',['roll'],a);assert.equal(r[0].samples,24);assert.equal(JSON.stringify(g.s),before);
});
test('LLM auction caps are private and reused without repeated calls for each bid',async()=>{
 const p=fakeProvider(r=>{const d=JSON.parse(r.text);return response(d.actions.find(a=>a.cap===200)?.id||d.actions.filter(a=>a.cap).at(-1)?.id||'pass');});
 const t=new Table({players:roster('ollama')},{ollama:p});t.game.startAuction(5,'end');
 for(let i=0;i<8;i++)await t.step();assert.equal(p.calls.length,2);assert.ok(t.game.s.auction.bid>=60);assert.equal(JSON.stringify(t.status()).includes('bidCaps'),false);assert.equal(t.error,null);t.dispose();
});
test('trades require the recipient decision and execute cash / property atomically',async()=>{
 const players=roster('ollama');players[0].type='human';const p=fakeProvider(()=>response('accept'));
 const t=new Table({players},{ollama:p});t.game.s.props[1].owner=0;t.game.s.props[3].owner=1;
 t.human({revision:0,action:'propose',trade:{from:0,to:1,give:[1],take:[3],giveCash:100,takeCash:0}});
 assert.equal(t.game.s.props[1].owner,0);assert.equal(t.offer.to,1);await t.step();assert.equal(t.offer,null);assert.equal(t.game.s.props[1].owner,1);assert.equal(t.game.s.props[3].owner,0);assert.equal(t.game.s.players[0].cash,1400);assert.equal(t.game.s.players[1].cash,1600);Game.validate(t.game.s);t.dispose();
});
test('invalid trades leave ownership and balances untouched',()=>{const g=new Game({players:roster()});g.s.props[1].owner=0;const before=JSON.stringify(g.s);assert.equal(g.executeTrade(0,1,[1],[3],0,0).ok,false);assert.equal(JSON.stringify(g.s),before);assert.equal(g.executeTrade(0,1,[1],[1],0,0).ok,false);});
test('stale revisions and impersonation cannot apply human actions',()=>{
 const players=roster();players[0].type='human';const t=new Table({players},{});assert.throws(()=>t.human({revision:9,action:'roll'}),/changed/);assert.throws(()=>t.human({revision:0,action:'propose',trade:{from:1}}),/proposer/);assert.equal(t.revision,0);t.dispose();
});
test('model failures pause without a silent programmatic fallback',async()=>{const t=new Table({players:roster('ollama')},{ollama:{async complete(){throw Error('Unavailable model');},forget(){}}});t.game.player.inJail=true;t.running=true;await t.step();assert.equal(t.running,false);assert.match(t.error,/Unavailable model/);assert.equal(t.revision,0);t.dispose();});
test('pause cancels an in-flight decision and prevents late state changes',async()=>{
 let finish;const p={complete:()=>new Promise(r=>finish=r),forget(){}};const t=new Table({players:roster('ollama')},{ollama:p});t.game.player.inJail=true;const pending=t.step();t.pause();finish({text:response('roll')});await pending;assert.equal(t.revision,0);assert.equal(t.thinking,null);t.dispose();
});
test('save / resume rebuilds model context from public state plus isolated private memory',async()=>{
 let saved;const p=fakeProvider(),t=new Table({players:roster('ollama')},{ollama:p},{persist:d=>saved=structuredClone(d)});t.game.player.inJail=true;await t.step();const resumed=new Table(null,{ollama:p},{saved});assert.equal(resumed.running,false);assert.equal(resumed.sessions.get(0).memory,'Keep $200 in reserve.');assert.equal(resumed.sessions.get(1).memory,'');assert.equal(resumed.sessions.get(0).last,null);assert.deepEqual(resumed.game.s,t.game.s);t.dispose();resumed.dispose();
});
test('all-AI tables complete across seeds and workshop-rule combinations',async()=>{
 for(let seed=1;seed<=12;seed++){
  const t=new Table({seed,players:[...roster(),{type:'heuristic',name:'Third'}],roundLimit:30,rules:{bankruptToBank:!!(seed&1),taxesToParking:!!(seed&2),doubleGo:!!(seed&4)}},{});let actions=0;
  while(t.game.s.phase!=='over'&&actions++<8000){await t.step();assert.equal(t.error,null);Game.validate(t.game.s);}assert.equal(t.game.s.phase,'over');t.dispose();
 }
});
function fakeChild(auth='chatgpt'){
 const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.requests=[];c.kill=()=>queueMicrotask(()=>c.emit('exit',0));
 c.stdin=new Writable({write(b,enc,done){const m=JSON.parse(b);c.requests.push(m);done();if(m.id===undefined)return;let result={};
  if(m.method==='account/read')result={account:{type:auth,planType:'plus'}};
  if(m.method==='model/list')result={data:[{id:'model',model:'model',displayName:'Test model'}]};
  if(m.method==='thread/start')result={thread:{id:'thread'}};
  if(m.method==='turn/start')result={turn:{id:'turn'}};
  queueMicrotask(()=>{c.stdout.write(JSON.stringify({id:m.id,result})+'\n');if(m.method==='turn/start'){
   for(const [method,params]of [['thread/tokenUsage/updated',{threadId:'thread',tokenUsage:{last:{inputTokens:100,outputTokens:30,cachedInputTokens:80}}}],['item/completed',{threadId:'thread',item:{type:'agentMessage',text:response('roll')}}],['turn/completed',{threadId:'thread',turn:{status:'completed'}}]])c.stdout.write(JSON.stringify({method,params})+'\n');
  }});
 }});return c;
}
test('Codex uses subscription auth, native threads, constrained output and no parent tools / API keys',async()=>{
 const c=fakeChild();let spawned;const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-key-never-pass';
 const p=new CodexProvider({discoverMcp:false,spawnImpl:(bin,args,opts)=>{spawned={args,opts};return c;}});
 try{await p.list();await p.complete({model:'model',sessionKey:'a',system:'Game rules',text:'snapshot',schema:{type:'object'}});await p.complete({model:'model',sessionKey:'a',system:'Game rules',text:'patch',schema:{type:'object'}});
  assert.equal(spawned.opts.env.OPENAI_API_KEY,undefined);assert.ok(spawned.args.includes('shell_tool'));assert.equal(c.requests.filter(r=>r.method==='thread/start').length,1);assert.equal(c.requests.find(r=>r.method==='thread/start').params.sandbox,'read-only');assert.equal(c.requests.find(r=>r.method==='turn/start').params.sandboxPolicy.networkAccess,false);assert.equal(p.account.type,'chatgpt');
 }finally{p.close();if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('Codex rejects API-key accounts before starting any model turn',async()=>{const c=fakeChild('apiKey');const p=new CodexProvider({discoverMcp:false,spawnImpl:()=>c});await assert.rejects(p.list(),/subscription/);assert.equal(c.requests.some(r=>r.method==='turn/start'),false);p.close();});
test('Ollama keeps a stable message prefix, uses JSON schema and exposes honest token counts',async()=>{
 let sent;const p=new OllamaProvider({fetchImpl:async(u,opts)=>{sent=JSON.parse(opts.body);return{ok:true,json:async()=>({message:{content:response('roll')},prompt_eval_count:200,eval_count:25,total_duration:1e6})};}});
 const messages=[{role:'system',content:'rules'},{role:'user',content:'snapshot'}];const r=await p.complete({model:'gpt-oss:20b',messages,schema:{type:'object'},effort:'low'});assert.deepEqual(sent.messages,messages);assert.equal(sent.stream,true);assert.equal(sent.think,'low');assert.equal(r.usage.input,200);assert.equal(r.usage.cached,null);assert.throws(()=>new OllamaProvider({url:'https://external.example'}),/loopback/);
});
test('HTTP host rejects cross-origin and unauthenticated mutations; exports and restores a table',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'rent-reason-host-test-'));const provider={list:async()=>[],close(){}};
 const host=createHost({dataDir,providers:{ollama:provider,codex:provider}});await new Promise(r=>host.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>{host.server.close(r);host.server.closeAllConnections();});fs.rmSync(dataDir,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+host.server.address().port,info=await(await fetch(url+'/api/info')).json();
 assert.equal((await fetch(url+'/api/table',{method:'POST',body:'{}'})).status,403);
 const headers={'X-Rent-Reason-Token':info.token,'Content-Type':'application/json'};
 assert.equal((await fetch(url+'/api/table',{method:'POST',headers:{...headers,Origin:'https://other.example'},body:'{}'})).status,403);
 const created=await(await fetch(url+'/api/table',{method:'POST',headers,body:JSON.stringify({players:roster()})})).json();assert.equal(created.snapshot.players.length,2);assert.equal(created.snapshot.seed,undefined);
 const exported=await(await fetch(url+'/api/export',{headers})).json();assert.equal(exported.format,'rent-reason-ai-table');assert.equal(exported.game.decks.chance.length,16);
 const imported=await(await fetch(url+'/api/import',{method:'POST',headers,body:JSON.stringify(exported)})).json();assert.equal(imported.running,false);assert.equal(imported.id,created.id);
});
test('models can compose custom trades and evaluate them before proposing',async()=>{
 const g=new Game({players:roster('ollama')});g.s.props[1].owner=1;
 const p=fakeProvider((r,n)=>n===1?response('',{type:'analyze',tool:'trade',proposal:{to:1,give:[],take:[1],giveCash:95,takeCash:0}}):response('custom:0'));
 const session=new AgentSession(0,{type:'ollama',model:'test'},p),d=await session.decide(g,S.legalActions(g,0),{allowTrade:true});
 assert.equal(d.action.trade.giveCash,95);assert.equal(g.s.props[1].owner,1);assert.equal(JSON.parse(p.calls[1].text).result.actionId,'custom:0');
});
test('forced moves bypass model calls while strategic choices still reach the agent',async()=>{
 const p=fakeProvider(()=>response('buy')),t=new Table({players:roster('ollama'),seed:78},{ollama:p});
 await t.step();assert.equal(p.calls.length,0);assert.equal(t.game.s.phase,'buy');await t.step();assert.equal(p.calls.length,1);assert.equal(t.game.s.props[5].owner,0);t.dispose();
});
test('bankrupt human seats advance automatically so spectator play continues',async()=>{
 const players=roster();players[0].type='human';players.push({type:'heuristic',name:'Third'});const t=new Table({players},{});t.game.bankrupt(0,1);await t.step();assert.equal(t.game.s.turn,1);assert.equal(t.game.s.phase,'roll');t.dispose();
});
test('a model can compose a counteroffer, requiring the original proposer to accept',async()=>{
 const players=roster('ollama');players[0].type='human';const p=fakeProvider((r,n)=>n===1?response('',{type:'analyze',tool:'trade',proposal:{to:0,give:[1],take:[],giveCash:0,takeCash:110}}):response('custom:0'));
 const t=new Table({players},{ollama:p});t.game.s.props[1].owner=1;
 t.human({revision:0,action:'propose',trade:{from:0,to:1,give:[],take:[1],giveCash:70,takeCash:0}});await t.step();assert.equal(t.offer.from,1);assert.equal(t.offer.to,0);assert.equal(t.offer.takeCash,110);assert.equal(t.game.s.props[1].owner,1);t.human({revision:t.revision,action:'accept'});assert.equal(t.game.s.props[1].owner,0);assert.equal(t.game.s.players[0].cash,1390);t.dispose();
});
test('trade analysis reports exact color-set outcomes, including swaps that complete nothing',()=>{
 const g=new Game({players:roster()});g.s.props[16].owner=0;g.s.props[18].owner=1;
 const r=S.tradeReport(g,{from:0,to:1,give:[16],take:[18],giveCash:0,takeCash:0});
 assert.deepEqual(r.sets[0].completedAfter,[]);assert.deepEqual(r.sets[0].colorCounts,[{group:'orange',before:1,after:1,total:3}]);
 g.s.props[19].owner=0;const r2=S.tradeReport(g,{from:0,to:1,give:[],take:[18],giveCash:200,takeCash:0});assert.deepEqual(r2.sets[0].completedAfter,['orange']);
});
test('an immediate retry waits for a cancelled agent call to unwind',async()=>{
 const pending=[];let live=0,maxLive=0;
 const p={complete:()=>new Promise(resolve=>{live++;maxLive=Math.max(maxLive,live);pending.push(value=>{live--;resolve(value);});}),forget(){}};
 const t=new Table({players:roster('ollama')},{ollama:p});t.game.player.inJail=true;
 const first=t.step();t.pause();await t.step();assert.equal(pending.length,1);pending[0]({text:response('roll')});await first;await new Promise(r=>setImmediate(r));assert.equal(pending.length,2);assert.equal(maxLive,1);t.pause();pending[1]({text:response('roll')});await new Promise(r=>setImmediate(r));assert.equal(t.revision,0);t.dispose();
});
test('Ollama empty-response retry accounts for both requests and their actual cached tokens',async()=>{
 let calls=0;const p=new OllamaProvider({fetchImpl:async()=>({ok:true,json:async()=>++calls===1?{message:{content:''},done_reason:'stop',prompt_eval_count:100,prompt_eval_cached_count:80,eval_count:10}:{message:{content:response('roll')},prompt_eval_count:100,prompt_eval_cached_count:99,eval_count:20}})});
 const r=await p.complete({model:'test',messages:[],schema:{type:'object'}});assert.equal(r.usage.requests,2);assert.equal(r.usage.input,200);assert.equal(r.usage.output,30);assert.equal(r.usage.cached,179);
});
test('Ollama expands a truncated reasoning budget without changing effort, context or legal choices',async()=>{
 const sent=[],messages=[{role:'system',content:'Stable rules'},{role:'user',content:'Current legal choices'}];
 const p=new OllamaProvider({fetchImpl:async(u,opts)=>{sent.push(JSON.parse(opts.body));return{ok:true,json:async()=>sent.length===1?{done_reason:'length',message:{content:'{"type":"act",',thinking:'private unfinished reasoning'},prompt_eval_count:100,prompt_eval_cached_count:50,eval_count:8000}:{done_reason:'stop',message:{content:response('roll')},prompt_eval_count:130,prompt_eval_cached_count:100,eval_count:150}};}});
 const r=await p.complete({model:'gpt-oss:20b',messages,schema:{type:'object'},effort:'medium'});
 assert.equal(sent.length,2);assert.equal(sent[0].options.num_predict,8000);assert.equal(sent[1].options.num_predict,16000);assert.equal(sent[0].options.num_ctx,32768);assert.equal(sent[1].options.num_ctx,32768);assert.equal(sent[1].think,'medium');
 assert.deepEqual(sent[1].messages.slice(0,messages.length),messages);assert.equal(messages.length,2);assert.equal(JSON.stringify(sent[1]).includes('private unfinished reasoning'),false);assert.equal(JSON.stringify(sent[1]).includes('{"type":"act",'),false);
 assert.equal(r.usage.requests,2);assert.equal(r.usage.input,230);assert.equal(r.usage.output,8150);assert.equal(r.usage.cached,150);
 await p.complete({model:'gpt-oss:20b',messages,schema:{type:'object'},effort:'medium'});assert.equal(sent[2].options.num_predict,16000);
 await p.complete({model:'gpt-oss:20b',messages,schema:{type:'object'},effort:'low'});assert.equal(sent[3].options.num_predict,4000);
});
test('Ollama accepts a complete final JSON at the output boundary and still checks the legal decision',async()=>{
 const p=new OllamaProvider({fetchImpl:async()=>({ok:true,json:async()=>({done_reason:'length',message:{content:response('not-legal')},eval_count:8000})})});
 const r=await p.complete({model:'test',messages:[],schema:{type:'object'},effort:'medium'});assert.equal(r.usage.requests,1);
 const {parse}=require('../ai/session.cjs');assert.throws(()=>parse(r.text,[{id:'roll'}]),/legal action/);
});
test('Ollama bounds repeated truncation, reports consumed tokens and does not change the game',async()=>{
 let calls=0;const p=new OllamaProvider({fetchImpl:async()=>({ok:true,json:async()=>{calls++;return{done_reason:'length',message:{content:'{"type":',thinking:'private'},prompt_eval_count:100,eval_count:10};}})});
 const g=new Game({players:roster('ollama')}),before=JSON.stringify(g.s),session=new AgentSession(0,{type:'ollama',model:'gpt-oss:20b',effort:'high'},p);
 await assert.rejects(session.decide(g,S.legalActions(g,0),{}),/16,384-token/);assert.equal(calls,2);assert.equal(JSON.stringify(g.s),before);assert.equal(session.metrics.calls,2);assert.equal(session.metrics.input,200);assert.equal(session.metrics.output,20);assert.equal(session.metrics.decisions,0);
});
test('Ollama output recovery can follow an empty response, and bounds generated memory fields',async()=>{
 const sent=[];const {schema}=require('../ai/session.cjs'),format=schema([{id:'roll'}]);
 const p=new OllamaProvider({fetchImpl:async(u,opts)=>{sent.push(JSON.parse(opts.body));return{ok:true,json:async()=>sent.length===1?{message:{content:''}}:sent.length===2?{done_reason:'length',message:{content:'{"'}}:{message:{content:response('roll')}}};}});
 const r=await p.complete({model:'test',messages:[],schema:format,effort:'medium'});assert.equal(r.usage.requests,3);assert.equal(sent[2].options.num_predict,16000);assert.equal(sent[0].format.properties.memory.maxLength,1200);assert.equal(sent[0].format.properties.rationale.maxLength,300);assert.equal(sent[0].format.properties.say.maxLength,240);assert.equal(format.properties.memory.maxLength,undefined);
});
test('Pause cancels Ollama recovery before another generation can start',async()=>{
 let calls=0;const abort=new AbortController();const p=new OllamaProvider({fetchImpl:async()=>({ok:true,json:async()=>{calls++;abort.abort();return{done_reason:'length',message:{content:''},eval_count:30};}})});
 await assert.rejects(p.complete({model:'test',messages:[],schema:{type:'object'},signal:abort.signal}),e=>e.name==='AbortError'&&e.usage.requests===1&&e.usage.output===30);assert.equal(calls,1);
});
test('humans can edit a received counteroffer and pending negotiations survive a restart',()=>{
 const players=roster();players[0].type='human';let saved;const t=new Table({players},{},{persist:d=>saved=structuredClone(d)});t.game.s.props[1].owner=1;
 t.offer={id:'incoming',from:1,to:0,give:[1],take:[],giveCash:0,takeCash:150,depth:1};t.human({revision:0,action:'counter-propose',offerId:'incoming',trade:{from:0,to:1,give:[],take:[1],giveCash:110,takeCash:0}});
 assert.equal(t.offer.from,0);assert.equal(t.offer.to,1);assert.equal(t.offer.giveCash,110);assert.equal(t.offer.depth,2);assert.equal(t.game.s.props[1].owner,1);
 const restored=new Table(null,{},{saved});assert.deepEqual(restored.offer,t.offer);assert.equal(restored.running,false);assert.equal(restored.choices(1).some(a=>a.id==='counter'),false);t.dispose();restored.dispose();
});
test('a stale offer ID cannot be used to accept or counter different terms',()=>{
 const players=roster();players[0].type='human';const t=new Table({players},{});t.game.s.props[1].owner=1;t.offer={id:'current',from:1,to:0,give:[1],take:[],giveCash:0,takeCash:150,depth:0};
 assert.throws(()=>t.human({revision:0,action:'accept',offerId:'old'}),/changed/);assert.equal(t.game.s.props[1].owner,1);t.dispose();
});
test('per-model usage totals survive game export and resume across multiple seats',()=>{
 const players=roster('ollama');const p={forget(){}};let saved;const t=new Table({players},{ollama:p},{persist:d=>saved=structuredClone(d)});
 t.sessions.get(0).recordUsage({requests:1,input:100,output:20,cached:90});t.sessions.get(1).recordUsage({requests:2,input:200,output:30,cached:100});t.save();const restored=new Table(null,{ollama:p},{saved});assert.equal(restored.status().modelUsage.length,1);assert.equal(restored.status().modelUsage[0].total,350);assert.equal(restored.status().modelUsage[0].calls,3);t.dispose();restored.dispose();
});
