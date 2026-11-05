'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const M=require('../engine.js'),League=require('../tournament.js'),Lobby=require('../lobby-model.js'),{Table}=require('../ai/table.cjs'),{createHost}=require('../server.cjs');
const roster=(n=8)=>Array.from({length:n},(_,i)=>({name:'Player '+i,type:'heuristic',piece:M.PIECES[i],color:M.PLAYER_COLORS[i][0]}));
const league=(n=8,rounds=3)=>League.create({players:roster(n),leagueRounds:rounds,roundLimit:1,boardId:'lantern-harbor',startingCash:1500});
function finish(game){game.s.players.forEach((p,i)=>p.cash=2000-i*100);game.finish(0);}
test('all supported roster sizes have exactly one appearance per entrant per round and no one-player tables',()=>{
 for(let n=4;n<=16;n++){
  const t=league(n,5);assert.equal(t.fixtures.length,Math.ceil(n/4)*5);
  for(let round=1;round<=5;round++){const fixtures=t.fixtures.filter(f=>f.round===round);assert(fixtures.every(f=>f.entrants.length>=2&&f.entrants.length<=4));assert.deepEqual(fixtures.flatMap(f=>f.entrants).sort((a,b)=>a-b),Array.from({length:n},(_,i)=>i));}
  assert.deepEqual(League.validate(t),t);
 }
 const t=league();assert.notDeepEqual(t.fixtures.slice(0,2).map(f=>f.entrants.slice().sort()),t.fixtures.slice(2,4).map(f=>f.entrants.slice().sort()));
});
test('human seats lead their table, while entrant identities survive seat rotation',()=>{
 const players=roster();players[5].type='human';const t=League.create({players,leagueRounds:5});for(const f of t.fixtures.filter(f=>f.entrants.includes(5)))assert.equal(f.entrants[0],5);
 League.bind(t,League.options(t).players.map((p,i)=>({...p,characterId:'character-'+i})));assert.equal(t.roster[t.fixtures[0].entrants[0]].characterId,'character-0');assert.deepEqual(League.validate(t),t);
});
test('points are recorded exactly once, advance is gated, and save data is copied',()=>{
 const t=league(),game=new M.Game(League.options(t));assert.throws(()=>League.next(t),/Finish/);assert.equal(League.record(t,game.s,'match-1'),false);finish(game);assert.equal(League.record(t,game.s,'match-1'),true);assert.equal(League.record(t,game.s,'match-1'),false);
 assert.deepEqual(t.fixtures[0].result.entries.map(e=>e.points),[4,2,1,0]);assert.equal(League.standings(t).reduce((n,p)=>n+p.games,0),4);const next=League.next(t);assert.equal(next.current,1);assert.equal(t.current,0);next.roster[0].name='Changed';assert.equal(t.roster[0].name,'Player 0');
});
test('equal net worth at a round cap shares occupied placement points, including first place',()=>{
 const t=league(4,1),game=new M.Game(League.options(t));game.s.players.forEach((p,i)=>p.cash=i<2?2000:1000-i);game.finish(0);League.record(t,game.s,'tie');assert.deepEqual(t.fixtures[0].result.entries.map(e=>[e.place,e.points]),[[1,3],[1,3],[3,1],[4,0]]);assert.equal(League.view(t).complete,true);assert.equal(League.standings(t).filter(p=>p.rank===1).length,2);assert.throws(()=>League.next(t),/complete/);assert.deepEqual(League.validate(t),t);
});
test('all league games complete with equal appearances and final totals, without duplicate recording after restore',()=>{
 let t=league(9,3);for(let i=0;i<t.fixtures.length;i++){const game=new M.Game(League.options(t));finish(game);League.record(t,game.s,'match-'+i);t=League.validate(t);if(i<t.fixtures.length-1)t=League.next(t);}
 assert(League.view(t).complete);assert(League.standings(t).every(p=>p.games===3));assert.equal(League.standings(t).reduce((n,p)=>n+p.points,0),63);
});
test('malformed or forged tournament saves are rejected',()=>{
 for(const mutate of [t=>t.current=20,t=>t.fixtures[0].entrants=[0,0,0,0],t=>t.fixtures[0].round=99,t=>t.rounds=0,t=>t.roster[0].characterId=t.roster[1].characterId='same']){const t=league();mutate(t);assert.throws(()=>League.validate(t));}
 const t=league();const game=new M.Game(League.options(t));finish(game);League.record(t,game.s,'match');t.fixtures[0].result.entries[0].points=100;assert.throws(()=>League.validate(t),/points/);
});
test('classic league game exports restore schedule and progress and reject a mismatched roster',()=>{
 const t=league(),game=new M.Game(League.options(t));game.s.tournament=t;const restored=M.Game.load(JSON.parse(JSON.stringify(game.s)));assert.deepEqual(restored.s.tournament,t);restored.s.tournament.roster[t.fixtures[0].entrants[0]].name='Wrong';assert.throws(()=>M.Game.load(restored.s),/roster/);
});
test('hosted leagues persist in table exports, keep public views free of configuration, and restore paused',()=>{
 const t=league(),table=new Table(League.options(t),{},{tournament:t});table.preMatch.state='started';finish(table.game);let saved;table.persistFn=d=>saved=d;table.save();const restored=new Table(null,{},{saved});assert.equal(restored.running,false);assert.deepEqual(restored.tournament,table.tournament);assert.equal(restored.status().tournament.standings.reduce((n,p)=>n+p.games,0),4);assert.equal(restored.status().tournament.roster,undefined);assert.equal(restored.status().tournament.settings,undefined);restored.save();assert.equal(restored.tournament.fixtures.filter(f=>f.result).length,1);table.dispose();restored.dispose();
});
test('league setup validates the whole roster and round settings without changing normal games',()=>{
 const d=Lobby.draft();d.tournament=true;d.leagueRounds=3;d.count=8;d.mode='watch';d.players=roster();assert.equal(Lobby.validate(d),'');assert.equal(Lobby.options(d).leagueRounds,3);d.players[7].color=d.players[0].color;assert.match(Lobby.validate(d),/different colour/);d.players=roster();d.leagueRounds=11;assert.match(Lobby.validate(d),/league rounds/);d.tournament=false;assert.match(Lobby.validate(d),/2–4/);
});
test('preview and stale create/advance requests never replace the current game',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rent-reason-league-')),provider={list:async()=>[]},host=createHost({dataDir:dir,providers:{ollama:provider,codex:provider,claude:provider,openrouter:provider}});
 await new Promise(r=>host.server.listen(0,'127.0.0.1',r));t.after(async()=>{host.table?.dispose();await new Promise(r=>{host.server.close(r);host.server.closeAllConnections();});fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+host.server.address().port,info=await(await fetch(base+'/api/info')).json();assert.equal(info.features.tournament,1);
 const api=(route,data,auth=true)=>fetch(base+'/api/'+route,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(auth?{'X-Rent-Reason-Token':info.token}:{})},body:data===undefined?undefined:JSON.stringify(data)});
 const options={players:roster(),leagueRounds:2};assert.equal((await api('tournament',{action:'create',options},false)).status,403);assert.equal(host.table,null);
 const created=await(await api('tournament',{action:'create',options})).json();assert(created.id);assert.equal(created.preMatch.state,'waiting');
 assert.equal((await api('tournament',{action:'next',id:created.id,revision:created.revision})).status,400);assert.equal(host.table.id,created.id);
 finish(host.table.game);host.table.save();const result=host.table.status();assert.equal((await api('tournament',{action:'next',id:'wrong',revision:result.revision})).status,400);
 const advanced=await(await api('tournament',{action:'next',id:result.id,revision:result.revision})).json();assert.notEqual(advanced.id,result.id);assert.equal(advanced.tournament.current,1);assert.equal(advanced.preMatch.state,'waiting');
 assert.equal((await api('tournament',{action:'next',id:result.id,revision:result.revision})).status,400);
 const exported=await(await api('export')).json();assert.equal(exported.tournament.current,1);assert.equal((await api('import',exported)).status,200);assert.equal(host.table.tournament.current,1);
 const before=host.table.id;assert.equal((await api('tournament',{action:'create',options})).status,400);assert.equal(host.table.id,before);
});

test('actual offline bots finish each rotating table and preserve the league through Game.load',()=>{
 let t=league(5,2);for(let i=0;i<t.fixtures.length;i++){let game=new M.Game(League.options(t));game.s.tournament=t;let steps=0;while(game.s.phase!=='over'&&steps++<2000)game.botStep();assert.equal(game.s.phase,'over');League.record(t,game.s,'bot-'+i);game=M.Game.load(game.s);t=game.s.tournament;if(i<t.fixtures.length-1)t=League.next(t);}
 assert(League.view(t).complete);assert(League.standings(t).every(p=>p.games===2));
});
test('read-only previews cannot create or advance tournaments, even through direct UI actions',async()=>{
 const d=Lobby.draft();Object.assign(d,{tournament:true,leagueRounds:3,count:8,mode:'watch',players:roster()});const calls=[],c=vm.createContext({lobbyDraft:d,Lobby,lobbyPreview:true,tournamentPending:false,aiHost:null,providerInfo:{},lobbyShowError:message=>calls.push(message),isGuest:()=>false,api:()=>{throw Error('Unexpected mutation');}});vm.runInContext(fs.readFileSync(require.resolve('../tournament-ui.js'),'utf8'),c);await vm.runInContext('tournamentCreate()',c);await vm.runInContext('tournamentAction("next")',c);assert.equal(calls.length,2);assert(calls.every(m=>m.includes('read-only preview')));
});
test('tournament labels and league-round patterns translate to Finnish',()=>{
 const I=require('../fi.js');require('../lobby-fi.js');assert.equal(I.translate('The tournament','fi'),'Turnaus');assert.equal(I.translate('8 entrants','fi'),'8 osallistujaa');assert.equal(I.translate('League round 1 / 3 · 2 / 6 games complete','fi'),'Sarjakierros 1 / 3 · 2 / 6 peliä päättynyt');
});
