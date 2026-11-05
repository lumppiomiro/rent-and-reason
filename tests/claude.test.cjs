'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ClaudeProvider,cumulativeUsage}=require('../ai/claude.cjs');
const {AgentSession}=require('../ai/session.cjs');
const {Table}=require('../ai/table.cjs');
const {Game}=require('../engine.js'),S=require('../ai/strategy.cjs'),Usage=require('../usage.js');
const {createHost}=require('../server.cjs');
const decision={type:'act',actionId:'roll',tool:'',actionIds:[],proposal:null,memory:'Keep cash for three workshops.',rationale:'Roll while preserving reserve.',say:''};
const request={model:'sonnet',sessionKey:'seat-a',system:'Stable board and strategy',text:'snapshot',schema:{type:'object'},effort:'medium'};
function fixture({auth='claude.ai',version='2.1.300 (Claude Code)',help='--safe-mode --tools --strict-mcp-config --json-schema --effort --setting-sources',run}={}){
 const calls=[],commands=[],children=[];
 const provider=new ClaudeProvider({execFileImpl:(bin,args,opts,cb)=>{commands.push({args,opts});queueMicrotask(()=>cb(null,args[0]==='--version'?version:args[0]==='--help'?help:JSON.stringify({loggedIn:auth!=='none',authMethod:auth,subscriptionType:'max',email:'private@example.test'})));},spawnImpl:(bin,args,opts)=>{
  const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.send=m=>c.stdout.write(JSON.stringify(m)+'\n');c.end=code=>{c.stdout.end();c.stderr.end();setImmediate(()=>c.emit('close',code??0));};c.kill=signal=>{c.killed=signal;queueMicrotask(()=>c.end(143));};
  let input='';c.stdin=new Writable({write(b,enc,done){input+=b;done();},final(done){calls.push({args,opts,input,c});done();queueMicrotask(()=>{
   if(run){run(c,calls.length);return;}
   c.send({type:'system',subtype:'init',tools:[],mcp_servers:[]});
   c.send({type:'result',subtype:'success',structured_output:decision,modelUsage:{'claude-sonnet':{inputTokens:calls.length*100,outputTokens:calls.length*30,cacheReadInputTokens:calls.length*70,cacheCreationInputTokens:calls.length*20}}});c.end();
  });}});children.push(c);return c;
 }});return{provider,calls,commands,children};
}
test('Claude uses subscription auth, separate resumable seat sessions, constrained output and no native tools',async t=>{
 const {provider:p,calls,commands}=fixture();t.after(()=>p.close());
 assert.deepEqual((await p.list()).map(m=>m.id),['sonnet','opus','haiku']);
 const first=await p.complete(request),next=await p.complete({...request,text:'patch'});await p.complete({...request,sessionKey:'seat-b'});
 const at=(call,flag)=>call.args[call.args.indexOf(flag)+1];
 assert.equal(at(calls[0],'--tools'),'');assert.equal(at(calls[0],'--permission-mode'),'dontAsk');assert.ok(calls[0].args.includes('--safe-mode'));assert.ok(!calls[0].args.includes('--bare'));assert.ok(!calls[0].args.includes('--dangerously-skip-permissions'));assert.equal(at(calls[0],'--strict-mcp-config'),'--mcp-config');assert.deepEqual(JSON.parse(at(calls[0],'--mcp-config')),{mcpServers:{}});
 assert.equal(at(calls[1],'--resume'),at(calls[0],'--session-id'));assert.notEqual(at(calls[2],'--session-id'),at(calls[0],'--session-id'));assert.equal(calls[0].input,'snapshot');assert.equal(calls[1].input,'patch');assert.equal(calls[0].opts.cwd,calls[1].opts.cwd);assert.notEqual(calls[0].opts.cwd,calls[2].opts.cwd);
 assert.deepEqual(JSON.parse(first.text),decision);assert.equal(first.usage.input,190);assert.equal(first.usage.output,30);assert.equal(next.usage.input,190);assert.equal(next.usage.cached,70);assert.equal(next.usage.cacheWrite,20);assert.ok(commands.filter(c=>c.args[0]==='auth').length>=4);assert.deepEqual(p.account,{type:'claude.ai',plan:'max'});
});
test('Claude strips API credentials, remote backends and inherited agent configuration',async t=>{
 const keys=['ANTHROPIC_API_KEY','ANTHROPIC_BASE_URL','ANTHROPIC_AUTH_TOKEN','CLAUDE_CODE_OAUTH_TOKEN','CLAUDE_CODE_USE_BEDROCK','CLAUDE_CONFIG_DIR','CLAUDECODE'];const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));for(const k of keys)process.env[k]='never-forward';
 const {provider:p,calls,commands}=fixture();t.after(()=>{p.close();for(const [k,v]of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 await p.complete(request);for(const {opts}of [...calls,...commands])for(const k of keys)assert.equal(opts.env[k],undefined);assert.equal(JSON.parse(calls[0].args[calls[0].args.indexOf('--settings')+1]).disableAllHooks,true);
});
test('Claude rejects API-key, token, third-party and signed-out accounts before inference',async()=>{
 for(const auth of ['api_key','api_key_helper','oauth_token','third_party','none']){const {provider:p,calls}=fixture({auth});try{await assert.rejects(p.complete(request),/subscription sign-in/);assert.equal(calls.length,0);}finally{p.close();}}
});
test('Claude checks safe CLI features and cumulative-usage-compatible versions',async()=>{
 for(const config of [{version:'2.1.100 (Claude Code)'},{help:'--tools --json-schema'}]){const {provider:p,calls}=fixture(config);try{await assert.rejects(p.list(),/Update Claude Code/);assert.equal(calls.length,0);}finally{p.close();}}
 const p=new ClaudeProvider({execFileImpl:(bin,args,opts,cb)=>cb(Object.assign(Error('missing'),{code:'ENOENT'}))});await assert.rejects(p.list(),/not installed/);p.close();
});
test('Claude forget / compact resets create fresh sessions instead of resuming stale deltas',async t=>{
 const {provider:p,calls}=fixture();t.after(()=>p.close());await p.complete(request);const dir=calls[0].opts.cwd;p.forget('seat-a');assert.equal(fs.existsSync(dir),false);await p.complete({...request,text:'new snapshot'});assert.ok(!calls[1].args.includes('--resume'));assert.notEqual(calls[1].opts.cwd,dir);
});
test('Claude native-tool exposure or invocation fails closed before any game action',async()=>{
 for(const message of [{type:'system',subtype:'init',tools:['Bash'],mcp_servers:[]},{type:'assistant',message:{content:[{type:'tool_use',name:'Read'}]}}]){
  const {provider:p,children}=fixture({run:c=>c.send(message)});try{await assert.rejects(p.complete(request),/native tool/);assert.equal(children[0].killed,'SIGTERM');assert.equal(p.sessions.size,0);}finally{p.close();}
 }
});
test('Claude cancellation reports known input once and never turns partial output into a move',async t=>{
 const abort=new AbortController();let emitted;const ready=new Promise(r=>emitted=r);const {provider:p}=fixture({run:c=>{const message={type:'assistant',message:{id:'same',usage:{input_tokens:10,output_tokens:1,cache_read_input_tokens:30,cache_creation_input_tokens:5}}};c.send(message);c.send(message);setImmediate(emitted);}});t.after(()=>p.close());
 const pending=p.complete({...request,signal:abort.signal});await ready;abort.abort();await assert.rejects(pending,e=>{assert.match(e.message,/cancelled/);assert.equal(e.usage.input,45);assert.equal(e.usage.output,0);assert.equal(e.usage.requests,1);assert.equal(e.usage.incomplete,1);return true;});assert.equal(p.sessions.size,0);
});
test('Claude failures retain usage, drop sessions and pause rather than substitute another player',async t=>{
 const {provider:p}=fixture({run:c=>{c.send({type:'result',subtype:'error_max_turns',is_error:true,errors:['Turn limit reached'],modelUsage:{model:{inputTokens:90,outputTokens:40,cacheReadInputTokens:10,cacheCreationInputTokens:5}}});c.end(1);}});t.after(()=>p.close());
 await assert.rejects(p.complete(request),e=>{assert.equal(e.usage.input,105);assert.equal(e.usage.output,40);return /Turn limit/.test(e.message);});assert.equal(p.sessions.size,0);
 const players=[{type:'claude',model:'sonnet',name:'Claude'},{type:'heuristic',name:'Bot'}],table=new Table({players},{claude:p});t.after(()=>table.dispose());table.game.player.inJail=true;await table.step();assert.match(table.error,/Turn limit/);assert.equal(table.revision,0);assert.equal(table.running,false);assert.equal(table.status().modelUsage[0].input,105);
});
test('Claude timeout kills only its own CLI and removes the invalid session',async t=>{
 const {provider:p,children}=fixture({run:()=>{}});p.timeout=10;t.after(()=>p.close());await assert.rejects(p.complete(request),/timed out/);assert.equal(children[0].killed,'SIGTERM');assert.equal(p.sessions.size,0);
});
test('Claude strategy context and analysis tools persist through state deltas and host saves',async t=>{
 const calls=[],p={forget(){},async complete(r){calls.push(r);return{text:JSON.stringify(calls.length===1?{...decision,type:'analyze',tool:'risk',actionId:''}:decision),usage:{input:100,output:20,cached:60,cacheWrite:10}};}};
 const config={type:'claude',model:'sonnet'},game=new Game({players:[config,{type:'heuristic'}]}),s=new AgentSession(0,config,p);
 await s.decide(game,S.legalActions(game,0));game.s.players[0].cash-=10;await s.decide(game,S.legalActions(game,0));assert.ok(calls[0].system.includes('RentReason Strategy 101'));assert.ok(JSON.parse(calls[0].text).snapshot);assert.ok(JSON.parse(calls[1].text).result.recommendedReserve);assert.ok(JSON.parse(calls[2].text).patch);assert.equal(s.metrics.cacheWrite,30);
 let save;const table=new Table({players:[config,{type:'heuristic'}]},{claude:p},{persist:d=>save=structuredClone(d)});t.after(()=>table.dispose());table.sessions.get(0).metrics=s.metrics;table.sessions.get(0).memory=s.memory;table.save();const resumed=new Table(null,{claude:p},{saved:save});t.after(()=>resumed.dispose());assert.equal(resumed.sessions.get(0).memory,'Keep cash for three workshops.');assert.equal(resumed.status().modelUsage[0].cacheWrite,30);assert.equal(resumed.game.s.controllers[0].type,'claude');
});
test('Claude cached input is included once in totals and eligible for explicit reference discounts',()=>{
 assert.deepEqual(cumulativeUsage({m:{inputTokens:150,outputTokens:60,cacheReadInputTokens:80,cacheCreationInputTokens:30}},{m:{inputTokens:100,outputTokens:40,cacheReadInputTokens:50,cacheCreationInputTokens:20}}),{input:90,output:20,cached:30,cacheWrite:10});
 const rows=Usage.aggregate([{id:0,type:'claude',model:'sonnet',input:1000,output:100,cached:600,cacheWrite:200}]);assert.equal(rows[0].total,1100);assert.equal(rows[0].cacheWrite,200);const estimate=Usage.estimate(rows[0],{input:3,cached:.3,output:15},1);assert.equal(estimate.cachedDiscountApplied,600);assert.ok(Math.abs(estimate.usd-.00288)<1e-10);assert.equal(Usage.rateFor('sonnet'),null);
});
test('HTTP model discovery includes Claude; mixed rosters export and restore without changing old providers',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rent-reason-claude-host-test-')),claude={list:async()=>[{id:'sonnet',name:'Claude Sonnet'}],account:{type:'claude.ai',plan:'max'},forget(){},close(){}},empty={list:async()=>[],close(){}};
 const host=createHost({dataDir:dir,providers:{ollama:empty,codex:empty,claude}});await new Promise(r=>host.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>{host.server.close(r);host.server.closeAllConnections();});fs.rmSync(dir,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+host.server.address().port,info=await(await fetch(url+'/api/info')).json(),headers={'X-Rent-Reason-Token':info.token,'Content-Type':'application/json'};assert.ok(info.providers.includes('claude'));
 const models=await(await fetch(url+'/api/providers',{headers})).json();assert.equal(models.claude.available,true);assert.equal(models.claude.account.type,'claude.ai');
 const created=await(await fetch(url+'/api/table',{method:'POST',headers,body:JSON.stringify({players:[{type:'human',name:'You'},{type:'claude',model:'sonnet',name:'Claude'}]})})).json();assert.equal(created.snapshot.controllers[1].type,'claude');
 const save=await(await fetch(url+'/api/export',{headers})).json(),loaded=await(await fetch(url+'/api/import',{method:'POST',headers,body:JSON.stringify(save)})).json();assert.equal(loaded.id,created.id);assert.equal(loaded.running,false);
});
