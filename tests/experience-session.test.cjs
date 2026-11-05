'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {GameClock,format}=require('../game-time.js'),{Table}=require('../ai/table.cjs'),{retryable}=require('../ai/retry.cjs'),Match=require('../match-data.js');
const players=()=>[{name:'Bot',type:'ollama',model:'test'},{name:'Rival',type:'heuristic'}];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await wait(10);}assert.fail('Timed out waiting for host');}
function table(extra={}){const t=new Table({players:players()}, {}, {retryDelays:[1,1],delay:60000,...extra});t.game.s.phase='buy';t.game.s.purchase=1;return t;}
test('play clock persists active time, freezes at finish and excludes pause and offline time',()=>{
 let now=1000;const c=new GameClock(null,{now:()=>now});now+=5000;assert.equal(c.save().playedMs,0);c.resume();now+=65000;c.pause();now+=90000;assert.equal(c.save().playedMs,65000);c.resume();now+=1000;const saved=c.save();now+=3600000;const restored=new GameClock(saved,{now:()=>now});assert.equal(restored.save().playedMs,66000);restored.resume();now+=2000;restored.finish();now+=10000;restored.resume();assert.equal(restored.sample().playedMs,68000);assert.equal(restored.sample().running,false);assert.equal(format(68000),'1:08');assert.equal(format(3661000),'1:01:01');assert.equal(new GameClock(null,{legacy:true}).save().coverage,'partial');assert.equal(new GameClock(null,{legacy:true,finished:true}).save().coverage,'unrecorded');
});
test('transient failures retry but auth, quota, missing model and cancellation do not',()=>{
 for(const s of ['fetch failed','HTTP 503','Ollama 429: busy','Ollama exhausted its expanded 12,000-token output budget without completing a decision.','Decision is not a legal action.','Invalid decision structure.','Unexpected token in JSON','Factual contradiction: wrong owner','The model returned an incomplete chat reply.'])assert.ok(retryable(Error(s)),s);
 for(const s of ['API-key account not allowed','Ollama 401: unauthorized','Model not found','Unavailable model','insufficient credits','quota exceeded','Decision cancelled.','native tool forbidden'])assert.ok(!retryable(Error(s)),s);
});
test('a failed manual model decision automatically retries once, commits once and remains paused',async()=>{
 const t=table(),seen=[];t.sessions.get(0).decide=async(g,as,ctx)=>{seen.push(ctx.retryEffort);if(seen.length===1)throw Error('Ollama reached its output limit');return{action:as.find(a=>a.id==='buy')};};try{await t.step();assert.equal(t.revision,0);assert.equal(t.status().retry.attempt,1);await until(()=>t.revision===1);assert.deepEqual(seen,[undefined,'low']);assert.equal(t.game.s.props[1].owner,0);assert.equal(t.running,false);assert.equal(t.retryState,null);assert.equal(t.clock.sample().running,false);}finally{t.dispose();}
});
test('a decision stops after two retries, while a permanent failure never retries',async()=>{
 for(const transient of [true,false]){const t=table();let calls=0;t.sessions.get(0).decide=async()=>{calls++;throw Error(transient?'fetch failed':'Unavailable model');};try{await t.step();await until(()=>!!t.error);assert.equal(calls,transient?3:1);assert.equal(t.revision,0);assert.equal(t.running,false);assert.equal(t.retryState,null);}finally{t.dispose();}}
});
test('Pause cancels a scheduled retry and restore never auto-runs a saved retry',async()=>{
 let saved;const t=table({retryDelays:[100,100],persist:s=>saved=structuredClone(s)});let calls=0;t.sessions.get(0).decide=async()=>{calls++;throw Error('fetch failed');};await t.step();const waiting=structuredClone(saved);t.pause();await wait(140);assert.equal(calls,1);assert.equal(t.retryState,null);t.dispose();const restored=new Table(null,{}, {saved:waiting});try{assert.equal(restored.retryState.suspended,true);await wait(20);assert.equal(restored.revision,0);assert.equal(restored.timer,null);}finally{restored.dispose();}
});
test('an audit failure after successful payment never retries or replays the action',async()=>{
 const t=table();let calls=0;t.sessions.get(0).decide=async(g,as)=>{calls++;return{action:as.find(a=>a.id==='buy')};};t.auditFn=r=>{if(r.type==='actionComplete')throw Error('temporary disk failure');};try{await t.step();assert.equal(calls,1);assert.equal(t.revision,1);assert.equal(t.game.player.cash,1440);assert.match(t.note,/completed action was saved/);assert.equal(t.retryState,null);}finally{t.dispose();}
});
test('one post-match opener per model includes eliminated players and never recursively wakes rivals',async()=>{
 const opts={players:[{name:'Human',type:'human'},...['First','Second'].map(name=>({name,type:'ollama',model:'test'}))]};let saved;const t=new Table(opts,{}, {persist:s=>saved=structuredClone(s)});t.game.s.phase='over';t.game.s.winner=0;t.game.s.players[2].out=true;for(const [id,s]of t.sessions)s.reply=async(g,request)=>{assert.equal(g.s.phase,'over');assert.equal(request.automatic,true);return id===1?'Good game, everyone!':'Congratulations on your win.';};try{t.finishGame();t.finishGame();assert.equal(t.chatQueue.length,2);await t.respondNext();await t.respondNext();assert.equal(t.chat.filter(m=>m.kind==='post-match').length,2);assert.equal(t.chatQueue.length,0);assert.equal(t.replyRequests.every(q=>q.state==='answered'),true);assert.equal(t.chat.every(m=>m.seat!==null),true);const restored=new Table(null,{}, {saved});try{restored.finishGame();assert.equal(restored.chatQueue.length,0);}finally{restored.dispose();}}finally{t.dispose();}
});
test('chat failures retry finitely without stopping a table or duplicating the message',async()=>{
 const t=new Table({players:[{type:'human',name:'Human'},{type:'ollama',model:'test',name:'Bot'}]}, {}, {retryDelays:[1,1]});let calls=0;t.sessions.get(1).reply=async()=>{if(++calls<3)throw Error('fetch failed');return'Good game!';};try{t.addChat(0,'Hello @Bot');await until(()=>t.replyRequests[0]?.state==='answered');assert.equal(calls,3);assert.equal(t.chat.filter(m=>m.kind==='reply').length,1);assert.equal(t.error,null);assert.equal(t.revision,0);}finally{t.dispose();}
});
test('manual tags supersede an unstarted automatic opener, without losing another model opener',()=>{
 const t=new Table({players:[{type:'human',name:'Human'},{type:'ollama',model:'test',name:'Bot'},{type:'codex',model:'test',name:'Other'}]},{});try{t.game.s.phase='over';t.game.s.winner=0;t.finishGame();t.addChat(0,'@Bot what was your best move?');assert.equal(t.chatQueue.length,2);assert.equal(t.chatQueue[0].to,1);assert.equal(t.chatQueue[0].automatic,undefined);assert.equal(t.chatQueue[1].to,2);assert.equal(t.replyRequests.find(q=>q.automatic&&q.to===1).state,'cancelled');}finally{t.dispose();}
});
test('host clock is saved outside authoritative game state and is available in match archives',()=>{
 let now=1000,saved;const t=table({now:()=>now,persist:s=>saved=structuredClone(s)});try{t.clock.resume();now+=70000;t.clock.finish();t.game.s.phase='over';t.game.s.winner=0;t.save();assert.equal(t.game.s.timing,undefined);assert.equal(saved.timing.playedMs,70000);assert.equal(t.status().timing.running,false);const a=Match.archive(saved,require('../trophies.js').match(t.game.s,t.options.players,t.id));assert.equal(a.timing.playedMs,70000);}finally{t.dispose();}
});

test('a final real bankruptcy queues openers once and freezes the game clock',()=>{
 let n=1000;const t=new Table({players:[{type:'human',name:'Human'},{type:'ollama',model:'test',name:'Bot'}]}, {}, {now:()=>n});try{t.clock.resume();n+=5000;t.game.player.cash=0;t.game.queue(0,1,100,'rent');t.game.processPayments();assert.equal(t.game.s.phase,'debt');t.human({revision:t.revision,action:'surrender'});assert.equal(t.game.s.phase,'over');assert.equal(t.postMatchStarted,true);assert.equal(t.chatQueue.length,1);assert.equal(t.clock.save().playedMs,5000);assert.equal(t.status().timing.running,false);assert.ok(t.clock.save().finishedAt);}finally{t.dispose();}
});
test('automatic retries include failed provider usage in the same model totals',async()=>{
 const {AgentSession}=require('../ai/session.cjs');const t=table();let calls=0;const p={forget(){},async complete(r){calls++;if(calls===1){const e=Error('fetch failed');e.usage={requests:1,input:90,output:12};throw e;}return{text:JSON.stringify({type:'act',actionId:'buy',memory:'',rationale:'',say:'',tool:'',actionIds:[],facts:[],proposal:null}),usage:{requests:1,input:100,output:20}};}};t.sessions.set(0,new AgentSession(0,t.options.players[0],p));try{await t.step();await until(()=>t.revision===1);const m=t.sessions.get(0).metrics;assert.equal(m.calls,2);assert.equal(m.input,190);assert.equal(m.output,32);assert.equal(t.status().retry,null);}finally{t.dispose();}
});
