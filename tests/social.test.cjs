'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Game}=require('../engine.js'),S=require('../ai/strategy.cjs'),Social=require('../ai/social.cjs');
const {AgentSession}=require('../ai/session.cjs'),{Table}=require('../ai/table.cjs'),{OllamaProvider}=require('../ai/providers.cjs');
const {createHost}=require('../server.cjs');
const roster=()=>[{name:'Alex',type:'human'},{name:'ChatGPT',type:'codex',model:'test'},{name:'Ollama',type:'ollama',model:'test'},{name:'Claude',type:'claude',model:'test'}];
const act=(actionId,extra={})=>JSON.stringify({type:'act',actionId,tool:'',actionIds:[],proposal:null,memory:'Keep a reserve; pursue orange.',rationale:'Preserve cash.',say:'',...extra});
function provider(fn=()=>({say:'A fair offer is a fine place to start.'})){return{calls:[],forgotten:[],async complete(r){this.calls.push(r);return{text:JSON.stringify(await fn(r,this.calls.length)),usage:{requests:1,input:100,output:12,cached:70}};},forget(k){this.forgotten.push(k);}};}
function table(p=provider()){return new Table({players:roster()},{codex:p,ollama:p,claude:p},{delay:5});}
const clear=t=>clearTimeout(t.timer);
async function drain(t){clear(t);while(t.chatQueue.length){await t.respondNext();clear(t);}}
const request=(text='What about Canopy Gardens?')=>({from:0,text,round:1,revision:0,recentChat:[]});

test('canonical grounding disambiguates Pennsylvania street/rail, Baltic, and exact trade outcomes',()=>{
 const g=new Game({players:roster()});g.s.props[31].owner=1;g.s.props[32].owner=1;g.s.props[34].owner=2;
 const offer={from:1,to:2,give:[],take:[34],giveCash:350,takeCash:0};
 const x=Social.grounding(g,1,{offer,question:'North Ferry and Driftwood Row'});
 assert.equal(x.properties.find(b=>b.id===34).group,'green');assert.equal(x.properties.find(b=>b.id===25).type,'rail');assert.equal(x.properties.find(b=>b.id===3).group,'brown');
 assert.deepEqual(x.offer.outcome[1].colorCounts,[{group:'green',before:2,after:3,total:3}]);assert.deepEqual(x.offer.outcome[1].completedAfter,['green']);assert.equal(JSON.stringify(x).includes('decks'),false);
});
test('fact checks reject the reported colour mistake but allow intentions, hypothetical deals and correct colours',()=>{
 const g=new Game({players:roster()}),action={id:'custom:0',trade:{from:1,to:2,give:[],take:[34],giveCash:350,takeCash:0}};g.s.props[34].owner=2;
 assert.match(Social.factError('Canopy Gardens looks solid to finish the Pink set.',g,{action,seat:1}),/does not complete/);
 for(const text of ['Canopy Gardens (Pink) is tempting.','North Ferry belongs to the pink group.','Driftwood Row is part of the pink set.'])assert.ok(Social.factError(text,g));
 for(const text of ['Canopy Gardens (Green) is tempting.','Selling Canopy Gardens could fund my pink set.','I want to finish the pink set eventually.','Imagine Canopy Gardens was pink.'])assert.equal(Social.factError(text,g,{action,seat:1}),'',text);
 assert.match(Social.factError('I own Driftwood Row.',g,{seat:1}),/do not currently own/);
 g.s.props[31].owner=1;g.s.props[32].owner=1;assert.equal(Social.factError('This will finish my green set.',g,{action,seat:1}),'');
 assert.match(Social.factError('This will complete my brown set.',g,{action:{id:'buy'},seat:1}),/does not complete/);
});
test('contradictory private factual notes are removed, while useful strategy is retained',()=>{
 const g=new Game({players:roster()});const text=Social.cleanPlan('Driftwood Row (Pink) is mine. My cash is $900. Pursue orange and keep a reserve.',g,1);
 assert.equal(text,'Pursue orange and keep a reserve.');
});
test('exact human tags resolve names safely, support @all, and do not match name prefixes',()=>{
 const p=roster();p[1].name='Chat GPT';p[2].name='A+B';
 assert.deepEqual(Social.mentionTargets('Hello @Chat GPT, how about @A+B?',p),[1,2]);assert.deepEqual(Social.mentionTargets('@all hello',p),[1,2,3]);
 assert.deepEqual(Social.mentionTargets('@Chat GPTExtra @A+BC @Alex',p),[]);
});
test('plain chat costs no model call; tags queue only selected recipients; models cannot summon models',async()=>{
 const p=provider(),t=table(p);t.addChat(0,'Hello table');assert.equal(t.chatQueue.length,0);assert.equal(p.calls.length,0);
 t.addChat(0,'@Ollama what would you trade?');clear(t);assert.equal(t.chatQueue[0].to,2);await drain(t);assert.equal(p.calls.length,1);
 t.addChat(1,'@Claude your turn to speak');assert.equal(t.chatQueue.length,0);
 t.addChat(0,'Everyone?',{targets:[1,3]});await drain(t);assert.equal(p.calls.length,3);assert.equal(t.status().replyRequests.every(r=>r.state==='answered'),true);t.dispose();
});
test('eliminated humans keep their name and can chat and tag live models without game actions',async()=>{
 const p=provider(),t=table(p);
 try{
  t.game.bankrupt(0,1);t.game.end();t.running=true;
  const before=JSON.stringify(t.game.s),revision=t.revision;
  t.addChat(0,'Seuraan vielä peliä!');
  assert.equal(t.chat.at(-1).seat,0);assert.equal(t.chat.at(-1).name,'Alex');assert.equal(p.calls.length,0);
  t.addChat(0,'@Ollama miten peli etenee?');clear(t);
  assert.equal(t.chatQueue.length,1);assert.equal(t.chatQueue[0].from,0);assert.equal(t.chatQueue[0].to,2);
  await drain(t);
  assert.equal(t.chat.at(-1).kind,'reply');assert.equal(t.chat.at(-1).seat,2);assert.equal(p.calls.length,1);
  assert.equal(t.running,true);assert.equal(t.revision,revision);assert.equal(JSON.stringify(t.game.s),before);
  assert.deepEqual(t.choices(0),[]);assert.throws(()=>t.human({revision,action:'roll'}),/human seat/);
  assert.throws(()=>t.insights(),/no human seat/);assert.deepEqual(t.status().decisions,[]);
 }finally{t.dispose();}
});
test('allowing eliminated human chat preserves limits, model elimination rules and saved messages',()=>{
 const p=provider();let saved;const t=new Table({players:roster()},{codex:p,ollama:p,claude:p},{persist:s=>saved=structuredClone(s)});
 try{
  t.game.bankrupt(0,1);t.game.bankrupt(3,1);t.game.end();
  assert.throws(()=>t.addChat(0,'x'.repeat(241)),/240/);
  assert.throws(()=>t.addChat(0,'Hello',{targets:[3]}),/active model/);
  assert.throws(()=>t.addChat(3,'I am still playing.'),/active player/);
  assert.throws(()=>t.addChat(99,'Invalid seat'),/active player/);assert.equal(t.chat.length,0);
  t.addChat(0,'Hyvä peli jatkuu!');
  const restored=new Table(null,{codex:p,ollama:p,claude:p},{saved});
  try{assert.equal(restored.game.s.players[0].out,true);assert.equal(restored.chat.at(-1).name,'Alex');restored.addChat(0,'Olen yhä mukana keskustelussa.');assert.equal(restored.chat.at(-1).seat,0);}finally{restored.dispose();}
 }finally{t.dispose();}
});
test('tagged replies use a separate compact session, bounded output and public facts; token usage is counted',async()=>{
 const p=provider(),g=new Game({players:roster()}),session=new AgentSession(1,roster()[1],p,{memory:'Secret private strategy'}),before=JSON.stringify(g.s);
 const say=await session.reply(g,request());const r=p.calls[0],payload=JSON.parse(r.text);
 assert.notEqual(r.sessionKey,session.key);assert.equal(r.sessionKey,session.chatKey);assert.equal(r.effort,'low');assert.equal(r.outputLimit,600);assert.equal(r.recover,false);assert.equal(r.schema.properties.say.maxLength,240);assert.equal(payload.targetChars,150);assert.equal(payload.maxChars,240);
 assert.equal(r.system.includes('Stable board'),false);assert.ok(r.text.length<7000);for(const secret of ['Secret private strategy','bidCaps','decks','seed'])assert.equal(r.text.includes(secret),false);
 assert.equal(payload.groundedFacts.properties.find(b=>b.id===34).group,'green');assert.equal(say,'A fair offer is a fine place to start.');assert.equal(JSON.stringify(g.s),before);
 assert.equal(session.metrics.chatCalls,1);assert.equal(session.metrics.chatReplies,1);assert.equal(session.metrics.calls,1);assert.equal(session.metrics.decisions,0);assert.equal(session.metrics.input,100);
 await session.reply(g,request('Any railways for sale?'));assert.equal(p.calls[1].sessionKey,r.sessionKey);assert.equal(p.calls[1].reset,false);assert.equal(p.calls[1].messages[0].content,r.messages[0].content);
});
test('chat refreshes bounded history and discards factually wrong replies without retrying or moving',async()=>{
 const p=provider(),g=new Game({players:roster()}),s=new AgentSession(2,roster()[2],p);for(let i=0;i<5;i++)await s.reply(g,request());assert(p.calls.slice(1).some(r=>r.reset));assert(s.chatAge>=1&&s.chatAge<4);assert(s.chatHistory.reduce((n,m)=>n+m.content.length,0)<=9000);
 const bad=provider(()=>({say:'Canopy Gardens is pink.'})),s2=new AgentSession(2,roster()[2],bad),before=JSON.stringify(g.s);
 await assert.rejects(s2.reply(g,request()),/contradicted the board/);assert.equal(bad.calls.length,1);assert.equal(s2.metrics.calls,1);assert.equal(s2.metrics.chatReplies,0);assert.equal(s2.chatHistory.length,0);assert.equal(JSON.stringify(g.s),before);
});
test('Ollama chat does not expand an exhausted output budget or retry an empty answer',async()=>{
 for(const content of ['', '{"say":']){let calls=0,body;const p=new OllamaProvider({fetchImpl:async(u,o)=>{calls++;body=JSON.parse(o.body);return{ok:true,json:async()=>({done_reason:'length',message:{content},eval_count:600})};}});
  await assert.rejects(p.complete({model:'test',messages:[],schema:{type:'object',properties:{say:{type:'string',maxLength:80}}},outputLimit:600,recover:false,effort:'low'}),/limit/);assert.equal(calls,1);assert.equal(body.options.num_predict,600);assert.equal(body.format.properties.say.maxLength,80);
 }
});
test('decision facts get one existing repair opportunity; memory and routine chat do not create separate calls',async()=>{
 let n=0;const p={calls:[],async complete(r){this.calls.push(r);return{text:act('buy',{say:++n===1?'Canopy Gardens is pink.':'Canopy Gardens is green.'}),usage:{requests:1,input:100,output:20}};},forget(){}};
 const g=new Game({players:roster()});g.s.turn=1;g.s.phase='buy';g.s.purchase=34;const s=new AgentSession(1,roster()[1],p,{memory:'Driftwood Row (Pink). Keep a reserve.'});
 const result=await s.decide(g,S.legalActions(g,1),{revision:0});assert.equal(result.action.id,'buy');assert.equal(p.calls.length,2);assert.match(JSON.parse(p.calls[1].text).validationError,/Factual contradiction/);assert.equal(JSON.parse(p.calls[0].text).memory,'Keep a reserve.');
 const initial=JSON.parse(p.calls[0].text);assert.equal(initial.groundedFacts.sets,undefined);assert.ok(initial.setProgress);assert.ok(initial.speech);
});
test('human can keep playing during a reply; reply stays tied to captured context and cannot make a move',async()=>{
 let finish;const p=provider(()=>new Promise(r=>finish=r)),t=table(p);t.addChat(0,'Thoughts?',{targets:[1]});clear(t);const pending=t.respondNext();assert.equal(t.thinking.purpose,'chat');
 t.human({revision:0,action:'roll'});const after=JSON.stringify(t.game.s),revision=t.revision;assert.equal(revision,1);assert.equal(JSON.parse(p.calls[0].text).contextRevision,0);
 finish({say:'Let us see what the dice have in store.'});await pending;clear(t);assert.equal(JSON.stringify(t.game.s),after);assert.equal(t.revision,revision);assert.equal(t.chat.at(-1).contextRevision,0);assert.equal(t.chat.at(-1).kind,'reply');t.dispose();
});
test('failed chat is visible and does not pause or error the strategic table',async()=>{
 const p=provider(()=>{throw Error('Reply unavailable');}),t=table(p);t.addChat(0,'@ChatGPT hello');clear(t);t.running=true;await t.respondNext();clear(t);
 assert.equal(t.running,true);assert.equal(t.error,null);assert.match(t.replyRequests[0].error,/unavailable/);assert.equal(t.revision,0);t.dispose();
});
test('Pause cancels active and queued replies and discards a late answer',async()=>{
 let finish;const p=provider(()=>new Promise(r=>finish=r)),t=table(p);t.addChat(0,'@all hello');clear(t);const pending=t.respondNext();t.pause();finish({say:'A late answer.'});await pending;
 assert.equal(t.chatQueue.length,0);assert.equal(t.replyRequests.every(r=>r.state==='cancelled'),true);assert.equal(t.chat.some(c=>c.kind==='reply'),false);assert.equal(t.replyRequests.every(r=>r.contextState===undefined),true);t.dispose();
});
test('reply scheduling alternates with game decisions and never runs two models at once',async()=>{
 let finish;const p=provider(()=>new Promise(r=>finish=r)),t=table(p);t.game.s.turn=1;t.game.player.inJail=true;t.running=true;t.addChat(0,'@all hello');clear(t);
 const pending=t.respondNext();await t.step();assert.equal(p.calls.length,1);finish({say:'I will consider it.'});await pending;clear(t);assert.equal(t.chatLast,true);
 let next;t.step=async()=>{next='decision';t.running=false;};await new Promise(r=>{t.schedule(1);setTimeout(r,15);});assert.equal(next,'decision');assert.equal(t.chatQueue.length,2);t.dispose();
});
test('profiles apply after an in-flight call without pausing, changing revision or losing usage',async()=>{
 let finish;const p=provider(()=>new Promise(r=>finish=r)),t=table(p);t.addChat(0,'Hello',{targets:[1]});clear(t);const pending=t.respondNext(),session=t.sessions.get(1),old=session.config.voice;
 const profiles=t.status().socialProfiles;profiles[1]={personality:'trader',voice:'dramatic',chattiness:'lively',customVoice:'Railway puns and mock outrage.'};t.updateProfiles({version:0,profiles});
 assert.equal(session.config.voice,old);assert.deepEqual(t.status().pendingProfileSeats,[1]);assert.equal(t.revision,0);finish({say:'I have a proposition for later.'});await pending;clear(t);
 assert.equal(session.config.voice,'dramatic');assert.equal(t.game.s.controllers[1].personality,'trader');assert.equal(session.metrics.chatReplies,1);assert.match(session.system,/Railway puns/);assert.deepEqual(t.status().pendingProfileSeats,[]);assert.equal(t.revision,0);
 assert.throws(()=>t.updateProfiles({version:0,profiles}),/changed/);const bad=structuredClone(profiles);bad[2].voice='unknown';assert.throws(()=>t.updateProfiles({version:1,profiles:bad}),/valid/);assert.equal(t.profileVersion,1);t.dispose();
});
test('routine speech respects quiet and once-per-round limits; negotiation speech stays available',()=>{
 const t=table(),d={say:'An interesting turn.',action:{id:'roll'}};t.publishSpeech(1,d,'roll',null);t.publishSpeech(1,{...d,say:'Another ordinary move.'},'end',null);assert.equal(t.chat.length,1);
 t.publishSpeech(1,{...d,say:'I am still interested in that property.'},'auction',null);assert.equal(t.chat.length,2);t.options.players[1].chattiness='quiet';assert.equal(t.speechContext(1).allowed,false);
 t.publishSpeech(1,{...d,say:'Ordinary move.'},'end',null);assert.equal(t.chat.length,2);t.publishSpeech(1,{...d,say:'Could we meet at $200?'},'roll',{id:'offer'});assert.equal(t.chat.length,3);t.dispose();
});
test('auction chat upserts actual public bids and never reveals authorized caps',()=>{
 const t=table();t.game.startAuction(5,'end');t.human({revision:0,action:'bid',amount:50});clear(t);assert.match(t.chat[0].text,/Public bid \$50/);
 t.commit(1,{id:'cap:731',cap:731,label:'Bid'});assert.equal(t.chat.filter(c=>c.kind==='auction').length,1);assert.equal(t.status().snapshot.auction.bid,60);assert.equal(JSON.stringify(t.status()).includes('cap:731'),false);assert.doesNotMatch(t.status().note,/731|Authorize/);assert.equal(t.chat[0].active,true);
 t.game.s.players[2].cash=100;t.game.s.players[3].cash=100;t.commit(2,{id:'pass',label:'Pass'});t.commit(3,{id:'pass',label:'Pass'});t.commit(0,{id:'pass',label:'Pass'});assert.equal(t.chat[0].active,false);assert.match(t.chat[0].text,/Sold to ChatGPT for \$60/);t.dispose();
});
test('trade chat has canonical terms, offer review metadata, and a tagged question carries that negotiation',async()=>{
 const p=provider(),t=table(p);t.game.s.props[34].owner=1;const trade={from:0,to:1,give:[],take:[34],giveCash:400,takeCash:0};t.human({revision:0,action:'propose',trade});clear(t);
 const c=t.chat[0];assert.equal(c.kind,'trade');assert.match(c.text,/Canopy Gardens \(green\)/);assert.equal(c.offerId,t.offer.id);assert.deepEqual(c.askSeats,[1]);
 t.addChat(0,'Could you meet me at $390?',{targets:[1],topicId:c.id});await drain(t);assert.equal(JSON.parse(p.calls[0].text).groundedFacts.offer.giveCash,400);assert.equal(JSON.parse(p.calls[0].text).topic.kind,'trade');assert.equal(t.offer.giveCash,400);assert.equal(t.game.s.props[34].owner,1);
 t.commit(1,{id:'reject',label:'Decline'});t.addChat(0,'Why did you pass?',{targets:[1],topicId:c.id});await drain(t);const last=JSON.parse(p.calls.at(-1).text);assert.equal(last.groundedFacts.offer,null);assert.equal(last.topic.outcome,'Declined');t.dispose();
});
test('queued replies and profiles survive save/restore; interrupted replies do not auto-duplicate',()=>{
 let saved;const p=provider(),t=new Table({players:roster()},{codex:p,ollama:p,claude:p},{persist:s=>saved=structuredClone(s)});t.addChat(0,'@Claude hello');clear(t);const g=structuredClone(t.game.s),id=t.id;
 const restored=new Table(null,{codex:p,ollama:p,claude:p},{saved});assert.equal(restored.id,id);assert.deepEqual(restored.game.s,g);assert.equal(restored.chatQueue.length,1);assert.equal(restored.chatQueue[0],restored.replyRequests[0]);assert.equal(restored.running,false);assert.equal(JSON.stringify(restored.status()).includes('contextState'),false);
 saved.chatQueue=[];saved.replyRequests[0].state='answering';const interrupted=new Table(null,{codex:p,ollama:p,claude:p},{saved});assert.equal(interrupted.replyRequests[0].state,'failed');assert.equal(interrupted.replyRequests[0].contextState,undefined);t.dispose();restored.dispose();interrupted.dispose();
});
test('human reply queues are bounded and invalid targets do not leave partial chat entries',()=>{
 const t=table();assert.throws(()=>t.addChat(0,'hello',{targets:[99]}),/active model/);assert.equal(t.chat.length,0);
 t.addChat(0,'First',{targets:[1]});t.addChat(0,'Second',{targets:[1]});clear(t);assert.throws(()=>t.addChat(0,'Third',{targets:[1]}),/queued replies/);assert.equal(t.chatQueue.length,2);assert.equal(t.chat.length,2);t.dispose();
});
test('human tables receive public status only, with no private auction cap or decision explanations',()=>{
 const t=table();t.game.startAuction(5,'end');t.human({revision:0,action:'bid',amount:50});clear(t);
 t.commit(1,{id:'cap:731',cap:731,label:'Authorize bids up to $731; host bids only the next increment'},{rationale:'My private maximum is $731.',say:'My maximum is $731.'});
 const status=t.status();assert.equal(status.spectator,false);assert.equal(status.publicStatus,1);assert.deepEqual(status.decisions,[]);assert.doesNotMatch(JSON.stringify(status),/cap:731|My private maximum|Authorize bids up to/);assert.match(status.note,/places a bid/);assert.throws(()=>t.insights(),/no human seat/);assert.equal(t.decisions[0].rationale,'My private maximum is $731.');t.game.s.players[0].out=true;assert.throws(()=>t.insights(),/no human seat/);t.dispose();
});
test('all-AI observers can inspect concise decision explanations and plans without inference',()=>{
 const players=roster();players[0].type='heuristic';const p=provider(),t=new Table({players},{codex:p,ollama:p,claude:p});t.game.startAuction(5,'end');t.game.s.players[0].cash=100;t.commit(0,{id:'pass',label:'Pass'});t.commit(1,{id:'cap:264',cap:264,label:'Authorize bids up to $264'},{rationale:'This blocks a railway collection.',say:''});t.sessions.get(1).memory='Keep a cash reserve.';
 const info=t.insights();assert.equal(t.status().spectator,true);assert.equal(info.decisions.at(-1).action,'Authorize auction limit $264');assert.equal(info.decisions.at(-1).rationale,'This blocks a railway collection.');assert.equal(info.plans[0].plan,'Keep a cash reserve.');assert.equal(p.calls.length,0);t.dispose();
});
test('short chat lines end at a sentence or word boundary, within the profile cap',()=>{
 const text='Canopy Gardens is green. I would like to discuss a fair trade and a sensible cash balance before committing to an offer.';assert.equal(Social.shortLine(text,70),'Canopy Gardens is green.');assert.ok(Social.shortLine('A very long statement without any sentence break that keeps on going forever',40).length<=40);
});
test('new HTTP profile/tag routes require host auth and preserve the existing board',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rent-reason-social-host-')),p=provider();p.list=async()=>[{id:'test'}];p.close=()=>{};const host=createHost({dataDir:dir,providers:{codex:p,ollama:p,claude:p}});await new Promise(r=>host.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>{host.server.close(r);host.server.closeAllConnections();});fs.rmSync(dir,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+host.server.address().port,info=await(await fetch(url+'/api/info')).json(),headers={'Content-Type':'application/json','X-Rent-Reason-Token':info.token};assert.equal(info.socialVersion,1);
 const status=await(await fetch(url+'/api/table',{method:'POST',headers,body:JSON.stringify({players:roster()})})).json(),before=JSON.stringify(host.table.game.s);const profiles=status.socialProfiles;profiles[1].voice='friendly';
 assert.equal((await fetch(url+'/api/profiles',{method:'POST',body:'{}'})).status,403);const changed=await(await fetch(url+'/api/profiles',{method:'POST',headers,body:JSON.stringify({version:0,profiles})})).json();assert.equal(changed.profilesVersion,1);assert.equal(JSON.stringify(host.table.game.s),before);
 const hidden=await fetch(url+'/api/insights',{headers});assert.equal(hidden.status,400);assert.match((await hidden.json()).error,/no human seat/);
 assert.equal((await fetch(url+'/api/chat',{method:'POST',headers,body:JSON.stringify({text:'Hello',targets:[2]})})).status,200);assert.equal(host.table.chatQueue[0].to,2);clear(host.table);assert.equal(host.table.revision,0);
});

test('captured Finnish reply loses its unfinished tail even when it was cut exactly at the old 150-character cap',()=>{
 const text='Kyllä: sijoitin paljon taloihin, mutta sinulla oli lopussa 2 160 € käteistä, neljä asemaa ja vahvat oranssit. Hävisin 723 €:lla. Hotellit taisivat hoh';
 assert.equal(text.length,150);assert.equal(Social.shortLine(text,240,{complete:true}),text.slice(0,text.lastIndexOf('.')+1));
 assert.equal(Social.shortLine('Summa on 2.160 euroa. Lopuksi jäi ke',240,{complete:true}),'Summa on 2.160 euroa.');
 assert.equal(Social.shortLine('Hän sanoi: ”Hyvin pelattu!” Tämä jäi ke',240,{complete:true}),'Hän sanoi: ”Hyvin pelattu!”');
});
test('soft chat targets allow the last sentence to finish inside the unchanged hard safety cap, without paid retries',async()=>{
 const reply='Pidän käteispuskurin seuraavalle kierrokselle. Oranssien kehittäminen kiinnostaa, mutta haluan ensin varmistaa, että selviän vastustajien seuraavista vuokrista.';
 assert(reply.length>150&&reply.length<240);const p=provider(()=>({say:reply})),g=new Game({players:roster(),language:'fi'}),s=new AgentSession(1,roster()[1],p);
 assert.equal(await s.reply(g,request('Mikä on suunnitelmasi?')),reply);assert.equal(p.calls.length,1);assert.equal(p.calls[0].schema.properties.say.maxLength,240);const payload=JSON.parse(p.calls[0].text);assert.equal(payload.targetChars,150);assert.equal(payload.maxChars,240);assert.equal(s.metrics.chatReplies,1);
});
test('tagged replies and decision speech never expose a provider-truncated last sentence',async()=>{
 const text='Hyvin pelattu! Pidin liian vähän käteistä. Nyt vastaus jäi kes',p=provider(()=>({say:text})),g=new Game({players:roster(),language:'fi'}),s=new AgentSession(1,roster()[1],p);
 assert.equal(await s.reply(g,request()),'Hyvin pelattu! Pidin liian vähän käteistä.');assert.equal(p.calls.length,1);
 const parsed=require('../ai/session.cjs').parse(act('roll',{say:'My liquidity was too low. '+('This unfinished sentence keeps going '.repeat(15))}),[{id:'roll'}]);assert.equal(parsed.say,'My liquidity was too low.');
 const t=table();t.addChat(1,text,{kind:'reply'});assert.equal(t.chat[0].text,'Hyvin pelattu! Pidin liian vähän käteistä.');t.publishSpeech(2,{say:text,action:{id:'roll'}},'roll',null);assert.equal(t.chat.at(-1).text,'Hyvin pelattu! Pidin liian vähän käteistä.');t.dispose();
});
test('malformed oversized output cannot break the hard cap, split a word, or silently truncate a human message',()=>{
 const whole='Hyvin pelattu!';assert.equal(Social.shortLine(whole+' '+('Vielä keskeneräistä '.repeat(100)),240,{complete:true}),whole);
 const one='Yksi todella pitkä vastaus ilman lauseen lopetusmerkkejä '.repeat(10),short=Social.shortLine(one,40,{complete:true});assert(short.length<=40);assert(short.endsWith('…'));assert(one.startsWith(short.slice(0,-1)+' '));assert.equal(Social.shortLine('x'.repeat(1000),40,{complete:true}),'');assert.equal(Social.shortLine('♟'.repeat(1000),1,{complete:true}),'');
 const t=table();assert.throws(()=>t.addChat(0,'x'.repeat(241)),/240/);assert.equal(t.chat.length,0);t.addChat(0,'x'.repeat(240));assert.equal(t.chat[0].text.length,240);t.dispose();
});
