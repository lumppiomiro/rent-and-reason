'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Game}=require('../engine.js'),T=require('../trophies.js'),{TrophyStore}=require('../ai/trophies.cjs'),{Table}=require('../ai/table.cjs'),{AgentSession}=require('../ai/session.cjs'),S=require('../ai/strategy.cjs'),{createHost}=require('../server.cjs');
const players=[{type:'human',name:'Alex'},{type:'codex',name:'ChatGPT',model:'gpt-6-luna'},{type:'openrouter',name:'Deepseek',model:'deepseek/deepseek-v4.1-flash'},{type:'claude',name:'Claude',model:'sonnet'}];
function finished(){const g=new Game({players});g.s.round=32;g.bankrupt(3,2);g.s.round=46;g.bankrupt(1,2);g.s.round=66;g.bankrupt(0,2);return g;}
function provider(){return {calls:[],forget(){},close(){},async list(){return [{id:'test'}];},async complete(r){this.calls.push(r);return {text:JSON.stringify(r.schema.properties.say&&!r.schema.properties.actionId?{say:'A good match. Well played, everyone.'}:{type:'act',actionId:'roll',tool:'',actionIds:[],proposal:null,memory:'Preserve cash.',rationale:'Roll.',say:'',facts:[]}),usage:{requests:1,input:50,output:10}};}};}
const cleanup=t=>{clearTimeout(t.timer);t.dispose();};

test('finish order is authoritative across save/load and differs from all-zero loser net worth',()=>{
 const g=finished(),r=T.standings(Game.load(g.s).s,players);assert.deepEqual(r.map(e=>[e.seat,e.place,e.eliminatedRound]),[[2,1,null],[0,2,66],[1,3,46],[3,4,32]]);
 const invalid=structuredClone(g.s);invalid.eliminations[0].place=2;assert.throws(()=>Game.load(invalid),/elimination/);
 const legacy=structuredClone(g.s);delete legacy.eliminations;const old=T.standings(Game.load(legacy).s,players);assert.equal(old.find(e=>e.seat===2).place,1);assert(old.filter(e=>e.out).every(e=>e.place===null));
});
test('round-limit survivors rank by net worth with shared places for ties',()=>{
 const g=new Game({players,roundLimit:1});g.s.players.forEach(p=>p.cash=100);g.s.players[2].cash=400;g.s.players[0].cash=200;g.finish(2);
 assert.deepEqual(T.standings(g.s,players).map(e=>[e.seat,e.place]),[[2,1],[0,2],[1,3],[3,3]]);
});
test('cabinet separates exact models, remembers human names across seats, and never duplicates a restored result',()=>{
 const g=finished(),record=T.match(g.s,players,'current',{at:'2026-10-30T12:00:00Z'});let cabinet=T.upsert(T.empty(),record);
 cabinet=T.upsert(cabinet,T.match(g.s,players,'current',{at:'2026-10-31T12:00:00Z'}));assert.equal(cabinet.matches.length,1);assert.equal(cabinet.matches[0].finishedAt,record.finishedAt);
 const sol={...players[1],model:'gpt-6-sol'};cabinet=T.upsert(cabinet,{id:'first',finishedAt:'2026-10-29T00:00:00Z',source:'user-confirmed',entries:[{...T.identity(sol),seat:1,place:1}]});
 const rows=T.careers(cabinet);assert.equal(rows.find(r=>r.model==='gpt-6-sol').gold,1);assert.equal(rows.find(r=>r.model==='gpt-6-luna').bronze,1);assert.equal(rows.find(r=>r.type==='human').silver,1);
 assert.equal(T.identity({type:'human',name:'alex'}).key,T.identity(players[0]).key);assert.equal(T.memory(cabinet,players).find(p=>p.seat===2).gold,1);
 const weaker=structuredClone(record);weaker.entries.forEach(e=>{if(e.out)e.place=null;});cabinet=T.upsert(cabinet,weaker);assert.equal(cabinet.matches.find(m=>m.id==='current').entries.find(e=>e.seat===0).place,2);
});
test('disk cabinet survives independent new games and preserves richer legacy placement records',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rent-reason-trophy-test-'));try{const store=new TrophyStore(dir),g=finished(),saved={id:'finished',game:g.s,options:{players}};
 store.record(saved);store.record(saved);assert.equal(new TrophyStore(dir).snapshot().matches.length,1);
 const old=structuredClone(saved);delete old.game.eliminations;store.record(old);assert.equal(store.snapshot().matches[0].entries.find(e=>e.seat===3).place,4);
 const next={id:'new',game:new Game({players}).s,options:{players}};store.record(next);assert.equal(store.snapshot().matches.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('post-match chat accepts a bankrupt human and eliminated models, leaves the board unchanged, and sends final standings',async()=>{
 const p=provider(),cabinet=T.upsert(T.empty(),T.match(finished().s,players,'fixture'));
 const t=new Table({players},{codex:p,openrouter:p,claude:p},{trophies:()=>cabinet});t.game=finished();const before=JSON.stringify(t.game.s),revision=t.revision;
 t.addChat(0,'Good game.');assert.equal(p.calls.length,0);t.addChat(0,'@all What a finish!');clearTimeout(t.timer);assert.equal(t.chatQueue.length,3);
 while(t.chatQueue.length){await t.respondNext();clearTimeout(t.timer);}
 assert.equal(p.calls.length,3);assert.equal(t.replyRequests.every(r=>r.state==='answered'),true);assert.equal(JSON.stringify(t.game.s),before);assert.equal(t.revision,revision);
 const payload=JSON.parse(p.calls[0].text);assert.equal(payload.match.phase,'over');assert.equal(payload.match.winner,2);assert.equal(payload.match.standings.find(e=>e.seat===0).place,2);assert.equal(payload.career.find(e=>e.seat===2).gold,1);assert.equal(payload.publicPlayers.length,4);assert(payload.publicPlayers.find(p=>p.seat===1).out);assert.equal(payload.risk,null);
 assert(!p.calls[0].text.includes('seed'));assert(!p.calls[0].text.includes('decks'));cleanup(t);
});
test('eliminated models remain unavailable during live play, while observers can tag them after an AI-only match',async()=>{
 const p=provider(),t=new Table({players},{codex:p,openrouter:p,claude:p});t.game.bankrupt(3,2);assert.throws(()=>t.addChat(0,'Hello',{targets:[3]}),/active model/);cleanup(t);
 const bots=players.map(p=>p.type==='human'?{type:'codex',name:'Sol',model:'test'}:p),a=new Table({players:bots},{codex:p,openrouter:p,claude:p});assert.throws(()=>a.addChat(null,'Hello'),/active player/);a.game.bankrupt(3,2);a.game.bankrupt(1,2);a.game.bankrupt(0,2);const before=JSON.stringify(a.game.s);a.addChat(null,'Congratulations',{targets:[1]});clearTimeout(a.timer);await a.respondNext();clearTimeout(a.timer);assert.equal(a.chat.at(-2).name,'You (observer)');assert.equal(a.chat.at(-1).kind,'reply');assert.equal(JSON.stringify(a.game.s),before);cleanup(a);
});
test('career memory is included once per strategic context and only when changed in the compact chat session',async()=>{
 const p=provider(),g=new Game({players}),s=new AgentSession(1,players[1],p),career=[{seat:1,gold:1}];g.s.turn=1;await s.decide(g,S.legalActions(g,1),{career});await s.decide(g,S.legalActions(g,1),{career});assert.deepEqual(JSON.parse(p.calls[0].text).career,career);assert.equal(JSON.parse(p.calls[1].text).career,undefined);
 const request={from:0,text:'Good game',round:1,revision:0,trophyMemory:career};await s.reply(g,request);await s.reply(g,request);assert.deepEqual(JSON.parse(p.calls[2].text).career,career);assert.equal(JSON.parse(p.calls[3].text).career,undefined);
 await s.reply(g,{...request,trophyMemory:[{seat:1,gold:2}]});assert.equal(JSON.parse(p.calls[4].text).career[0].gold,2);
});
test('host trophy endpoint is authenticated and completed records survive host restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rent-reason-trophy-host-')),p=provider();let host;
 const start=async()=>{host=createHost({dataDir:dir,providers:{codex:p,openrouter:p,claude:p,ollama:p}});await new Promise(r=>host.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+host.server.address().port,info=await(await fetch(base+'/api/info')).json();return {base,headers:{'X-Rent-Reason-Token':info.token}};};
 const stop=async()=>{await new Promise(r=>host.server.close(r));host.server.closeAllConnections();};
 try{const g=finished();fs.writeFileSync(path.join(dir,'table.json'),JSON.stringify({format:'rent-reason-ai-table',version:1,id:'persisted',options:{players},game:g.s,chat:[],agents:{}}));let c=await start();assert.equal((await fetch(c.base+'/api/trophies')).status,403);let data=await(await fetch(c.base+'/api/trophies',{headers:c.headers})).json();assert.equal(data.matches.length,1);await stop();c=await start();data=await(await fetch(c.base+'/api/trophies',{headers:c.headers})).json();assert.equal(data.matches.length,1);assert.equal(data.matches[0].entries.find(e=>e.seat===0).place,2);
 const status=await(await fetch(c.base+'/api/table',{headers:c.headers})).json();assert.equal(status.postMatchChatVersion,1);assert.equal(status.result.entries.find(e=>e.seat===1).place,3);
 const chat=await fetch(c.base+'/api/chat',{method:'POST',headers:{...c.headers,'Content-Type':'application/json'},body:JSON.stringify({text:'Well played'})});assert.equal(chat.status,200);
 }finally{if(host?.server.listening)await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
