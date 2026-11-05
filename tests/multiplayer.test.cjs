'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {Table}=require('../ai/table.cjs'),{createHost}=require('../server.cjs'),{InternetHosting}=require('../ai/hosting.cjs'),Lobby=require('../lobby-model.js');
const players=()=>[{type:'human',name:'Host'},{type:'human',name:'Friend'},{type:'human',name:'Third friend'},{type:'heuristic',name:'Bot'}];
function child(){const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.kill=()=>{queueMicrotask(()=>c.emit('exit',0));return true;};return c;}
async function fixture(t,{preMatch=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rent-reason-multiplayer-'));let spawned,spawnArgs;
 const p={list:async()=>[],close(){}};let now=Date.now();
 const host=createHost({dataDir:dir,providers:{ollama:p,codex:p,claude:p,openrouter:p},hostingOptions:{now:()=>now,spawnImpl:(bin,args)=>{spawnArgs=args;return spawned=child();}}});
 await new Promise(r=>host.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await host.sharing.stop(false);await new Promise(r=>{host.server.close(r);host.server.closeAllConnections();});fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+host.server.address().port,info=await(await fetch(base+'/api/info')).json();
 const adminHeaders={'X-Rent-Reason-Token':info.token,'Content-Type':'application/json'};
 const admin=(route,data)=>fetch(base+'/api/'+route,{method:data===undefined?'GET':'POST',headers:adminHeaders,body:data===undefined?undefined:JSON.stringify(data)});
 assert.equal((await admin('table',{players:players(),preMatch})).status,200);
 await host.sharing.start();spawned.stderr.write('Visit https://rent-reason-test.trycloudflare.com to connect\n');
 const gateway='http://127.0.0.1:'+host.sharing.gateway.address().port,origin=host.sharing.url;
 const guest=(route,{data,headers={},method=data===undefined?'GET':'POST'}={})=>fetch(gateway+'/api/'+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)});
 async function join(seat){const invitation=await(await admin('hosting',{action:'invite',seat})).json();const invite=new URL(invitation.url).hash.slice(6);const result=await guest('join',{data:{invite}});assert.equal(result.status,200);const cookie=result.headers.get('set-cookie').split(';')[0];assert.match(result.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);const auth=await(await guest('info',{headers:{Cookie:cookie}})).json();return{invite,headers:{Cookie:cookie,'X-Rent-Reason-Token':auth.token},info:auth};}
 return{host,admin,guest,join,info,get spawnArgs(){return spawnArgs;},advance:ms=>now+=ms};
}
test('multiple humans survive setup, saves and authenticated moves at nonzero seats',()=>{
 const d=Lobby.draft();d.players[1].type='human';assert.equal(Lobby.validate(d,{host:true}),'');assert.match(Lobby.validate(d),/launcher/);const draft=Lobby.draft({},d.players);assert.equal(draft.players[1].type,'human');
 const table=new Table({players:players()},{});table.game.s.turn=1;
 assert.throws(()=>table.human({revision:0,action:'roll'}),/own seat/);table.human({revision:0,action:'roll'},1);assert.equal(table.revision,1);let saved;table.persistFn=d=>saved=d;table.save();const restored=new Table(null,{}, {saved});assert.equal(restored.options.players[1].type,'human');table.dispose();restored.dispose();
});
test('human trades and counteroffers require the intended recipient’s authenticated seat',()=>{
 const table=new Table({players:players()},{});table.game.s.props[1].owner=0;table.game.s.props[3].owner=1;
 table.human({revision:0,action:'propose',trade:{from:0,to:1,give:[1],take:[3],giveCash:0,takeCash:0}},0);
 assert.throws(()=>table.human({revision:table.revision,action:'accept'},2),/own seat/);
 table.human({revision:table.revision,action:'counter-propose',offerId:table.offer.id,trade:{from:1,to:0,give:[3],take:[1],giveCash:10,takeCash:0}},1);
 table.human({revision:table.revision,action:'accept',offerId:table.offer.id},0);assert.equal(table.game.s.props[1].owner,1);assert.equal(table.game.s.props[3].owner,0);table.dispose();
});
test('nonzero human seats can bid, manage buildings, resolve debt',()=>{
 const t=new Table({players:players()},{});t.game.s.turn=1;t.game.startAuction(5,'end');t.game.s.auction.cursor=1;t.human({revision:0,action:'bid',amount:50},1);assert.equal(t.game.s.auction.high,1);
 t.game.s.auction=null;t.game.s.phase='end';t.game.s.props[1].owner=1;t.game.s.props[3].owner=1;t.human({revision:t.revision,action:'build:1'},1);assert.equal(t.game.s.props[1].level,1);
 t.game.s.players[1].cash=0;t.game.queue(1,null,100,'test debt');t.game.processPayments();assert.equal(t.game.s.phase,'debt');t.human({revision:t.revision,action:'raise'},1);assert.notEqual(t.game.s.phase,'debt');t.dispose();
});
test('the public gateway never grants anonymous info or host administration, including with the host token',async t=>{
 const f=await fixture(t),g=await f.join(1);assert.equal(g.info.viewer.seat,1);assert.notEqual(g.info.token,f.info.token);
 const landing=await fetch('http://127.0.0.1:'+f.host.sharing.gateway.address().port+'/',{headers:{'Sec-Fetch-Site':'cross-site'}});assert.equal(landing.status,200);assert.match(landing.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal((await f.guest('info')).status,401);assert.equal((await f.guest('table')).status,401);
 for(const route of ['export','audit','characters','match','providers','insights','trophies','hosting','tournament'])assert.equal((await f.guest(route,{headers:g.headers})).status,403,route);
 for(const route of ['table','import','control','start','characters','profiles','effort','language','hosting','tournament'])assert.equal((await f.guest(route,{headers:g.headers,data:{action:'run',role:'host',seat:0}})).status,403,route);
 assert.equal((await f.guest('table',{headers:{'X-Rent-Reason-Token':f.info.token}})).status,401);
 const status=await(await f.guest('table',{headers:g.headers})).json();assert.equal(status.snapshot.seed,undefined);assert.equal(status.snapshot.decks,undefined);assert.deepEqual(status.decisions,[]);assert.equal(status.viewer.seat,1);
 assert.equal(f.spawnArgs.includes('http://127.0.0.1:'+f.host.sharing.gateway.address().port),true);assert.equal(f.spawnArgs.includes('http://127.0.0.1:'+f.host.server.address().port),false);
});
test('seat ownership is enforced for moves and chat; refreshing retains the guest identity',async t=>{
 const f=await fixture(t),g=await f.join(1);let revision=f.host.table.revision;
 assert.equal((await f.guest('action',{headers:g.headers,data:{revision,action:'roll',seat:0}})).status,400);assert.equal(f.host.table.revision,revision);
 f.host.table.game.s.turn=1;assert.equal((await f.guest('action',{headers:g.headers,data:{revision,action:'roll',seat:2}})).status,200);
 assert.equal((await f.guest('action',{headers:g.headers,data:{revision,action:'end'}})).status,400);
 assert.equal((await f.guest('chat',{headers:g.headers,data:{text:'Hello from my seat',seat:0,from:0}})).status,200);assert.equal(f.host.table.chat.at(-1).seat,1);
 const refreshed=await(await f.guest('info',{headers:{Cookie:g.headers.Cookie}})).json();assert.equal(refreshed.viewer.seat,1);assert.equal(refreshed.token,g.info.token);
});
test('gateway rejects wrong host, cross-origin and missing CSRF tokens and oversized bodies',async t=>{
 const f=await fixture(t),g=await f.join(1);
 assert.equal(await new Promise((resolve,reject)=>{const r=require('node:http').get({host:'127.0.0.1',port:f.host.sharing.gateway.address().port,path:'/api/table',headers:{...g.headers,Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});r.on('error',reject);}),403);
 assert.equal((await f.guest('table',{headers:{...g.headers,Origin:'https://evil.example'}})).status,403);
 assert.equal((await f.guest('table',{headers:{...g.headers,'Sec-Fetch-Site':'cross-site'}})).status,403);
 assert.equal((await f.guest('table',{headers:{Cookie:g.headers.Cookie}})).status,403);
 assert.equal((await f.guest('chat',{data:{text:'x'},headers:{...g.headers,Origin:''}})).status,403);
 assert.equal((await f.guest('chat',{data:{text:'x'},headers:{...g.headers,'Content-Type':'text/plain'}})).status,403);
 assert.equal((await f.guest('chat',{data:{text:'x'.repeat(9000)},headers:g.headers})).status,413);
});
test('invitations are single-use, time limited, revocable and isolated across games and seats',async t=>{
 const f=await fixture(t),g=await f.join(1),g2=await f.join(2);
 assert.equal((await f.guest('join',{data:{invite:g.invite}})).status,401);
 await f.admin('hosting',{action:'revoke',seat:1});assert.equal((await f.guest('info',{headers:g.headers})).status,401);assert.equal((await f.guest('info',{headers:g2.headers})).status,200);
 const newer=await f.join(1);f.advance(86400001);assert.equal((await f.guest('info',{headers:newer.headers})).status,401);
 const invite=await(await f.admin('hosting',{action:'invite',seat:1})).json();f.advance(3600001);assert.equal((await f.guest('join',{data:{invite:new URL(invite.url).hash.slice(6)}})).status,401);
 const last=await f.join(1);await f.admin('table',{players:players()});assert.equal((await f.guest('info',{headers:last.headers})).status,401);
});
test('start waits for invited humans; stopping the tunnel pauses the table and clears all sessions',async t=>{
 const f=await fixture(t,{preMatch:true});assert.equal((await f.admin('start',{id:f.host.table.id,revision:0})).status,400);await f.join(1);await f.join(2);
 assert.equal((await f.admin('start',{id:f.host.table.id,revision:0})).status,200);assert.equal(f.host.table.running,true);await f.admin('hosting',{action:'stop'});assert.equal(f.host.table.running,false);assert.equal(f.host.sharing.sessions.size,0);assert.equal(f.host.sharing.state,'off');assert.equal(f.host.sharing.gateway,null);
});
test('failed tunnel startup fails closed without changing the game',async t=>{
 const f=await fixture(t);const before=JSON.stringify(f.host.table.game.s);f.host.sharing.child.emit('error',Error('private diagnostic'));await new Promise(r=>setTimeout(r,10));assert.equal(f.host.sharing.state,'error');assert.equal(f.host.sharing.gateway,null);assert.equal(f.host.sharing.sessions.size,0);assert.equal(JSON.stringify(f.host.table.game.s),before);assert.ok(!f.host.sharing.error.includes('private diagnostic'));
});

test('invalid joins and repeated guest moves are rate limited without changing the game',async t=>{
 const f=await fixture(t),g=await f.join(1),before=JSON.stringify(f.host.table.game.s);
 for(let i=0;i<29;i++)assert.equal((await f.guest('join',{data:{invite:'0'.repeat(64)}})).status,401);
 assert.equal((await f.guest('join',{data:{invite:'0'.repeat(64)}})).status,429);
 for(let i=0;i<60;i++)assert.equal((await f.guest('action',{headers:g.headers,data:{revision:0,action:'roll'}})).status,400);
 assert.equal((await f.guest('action',{headers:g.headers,data:{revision:0,action:'roll'}})).status,429);assert.equal(JSON.stringify(f.host.table.game.s),before);
});
test('importing even the same game revokes visitor sessions; invites never enter exports',async t=>{
 const f=await fixture(t),g=await f.join(1),save=await(await f.admin('export')).json();assert.ok(!JSON.stringify(save).includes(g.invite));assert.ok(!JSON.stringify(save).includes(g.info.token));
 assert.equal((await f.admin('import',save)).status,200);assert.equal((await f.guest('info',{headers:g.headers})).status,401);
});
test('stopping during startup cannot leave a public gateway running',async t=>{
 const f=await fixture(t);await f.host.sharing.stop(false);const starting=f.host.sharing.start();await f.host.sharing.stop(false);await starting;assert.equal(f.host.sharing.state,'off');assert.equal(f.host.sharing.gateway,null);assert.equal(f.host.sharing.child,null);
});

test('a guest can read and edit only their own saved human character, without changing a live match',async t=>{
 const f=await fixture(t),g=await f.join(1),other=await f.join(2),id=f.host.table.options.players[1].characterId;
 const others=Object.fromEntries(Object.entries(f.host.memories.data.characters).filter(([key])=>key!==id).map(([key,c])=>[key,structuredClone(c)])),board=JSON.stringify(f.host.table.game.s),roster=JSON.stringify(f.host.table.options.players);
 assert.equal(g.info.features.ownCharacter,true);
 const initial=await(await f.guest('character',{headers:g.headers})).json();assert.equal(initial.character.id,id);assert.deepEqual(Object.keys(initial.character).sort(),['id','name','profile']);assert.deepEqual(Object.keys(initial.character.profile).sort(),['color','piece']);assert.ok(!('characters' in initial));assert.ok(!('lessons' in initial.character));
 const edited=await f.guest('character',{headers:g.headers,data:{characterId:id,revision:initial.revision,profile:{name:'Friend for next time',piece:'sail',color:'#8051a3'}}});assert.equal(edited.status,200);const result=await edited.json();assert.equal(result.character.name,'Friend for next time');assert.equal(result.character.profile.piece,'sail');assert.equal(result.character.profile.color,'#8051a3');
 assert.equal(JSON.stringify(f.host.table.game.s),board);assert.equal(JSON.stringify(f.host.table.options.players),roster);assert.equal(f.host.memories.data.characters[id].kind,'human');assert.equal(f.host.memories.data.characters[id].enabled,false);assert.equal(f.host.memories.data.characters[id].stats.games,0);
 for(const [key,c]of Object.entries(others))assert.deepEqual(f.host.memories.data.characters[key],c);
 const stored=JSON.parse(fs.readFileSync(f.host.memories.file));assert.equal(stored.characters[id].name,'Friend for next time');
 assert.equal((await(await f.guest('character?id='+id,{headers:other.headers})).json()).character.id,f.host.table.options.players[2].characterId);
 const current=f.host.memories.data.revision;
 assert.equal((await f.guest('character',{headers:other.headers,data:{characterId:id,revision:current,profile:{name:'Stolen'}}})).status,403);
 assert.equal((await f.guest('character',{headers:g.headers,data:{characterId:f.host.table.options.players[0].characterId,revision:current,profile:{name:'Stolen host'}}})).status,403);
 assert.equal((await f.guest('character',{headers:g.headers,data:{characterId:f.host.table.options.players[3].characterId,revision:current,profile:{name:'Stolen bot'}}})).status,403);
});
test('guest character updates reject privilege changes, stale edits and invalid appearance settings',async t=>{
 const f=await fixture(t),g=await f.join(1),initial=await(await f.guest('character',{headers:g.headers})).json(),revision=initial.revision,characterId=initial.character.id;
 const before=JSON.stringify(f.host.memories.data);
 for(const profile of [{type:'codex'},{learningEnabled:true},{stats:{gold:100}},{characterId:f.host.table.options.players[0].characterId},{name:'x',model:'private-model'},{piece:'<script>'},{color:'url(evil)'},{name:' '},{name:'x'.repeat(25)}])assert.notEqual((await f.guest('character',{headers:g.headers,data:{characterId,revision,profile}})).status,200);
 for(const extra of [{seat:0},{action:'create'},{role:'host'}])assert.equal((await f.guest('character',{headers:g.headers,data:{...extra,revision,profile:{name:'Attacker'}}})).status,403);
 assert.equal((await f.guest('character',{headers:g.headers,data:{profile:{name:'No revision'}}})).status,400);assert.equal(JSON.stringify(f.host.memories.data),before);
 await f.admin('characters',{action:'profile',characterId,profile:{name:'Host edit'}});
 const res=await f.guest('character',{headers:g.headers,data:{characterId,revision,profile:{name:'Outdated edit'}}});assert.equal(res.status,400);assert.match((await res.json()).error,/changed/);assert.equal(f.host.memories.data.characters[characterId].name,'Host edit');
});
test('own-character editing requires a valid guest session, CSRF and same-origin request',async t=>{
 const f=await fixture(t),g=await f.join(1),payload={revision:f.host.memories.data.revision,profile:{name:'Secure friend'}};
 assert.equal((await f.guest('character')).status,401);assert.equal((await f.guest('character',{headers:{Cookie:g.headers.Cookie}})).status,403);
 assert.equal((await f.guest('character',{headers:{...g.headers,Origin:'https://evil.example'},data:payload})).status,403);
 const before=JSON.stringify(f.host.memories.data);await f.admin('hosting',{action:'revoke',seat:1});assert.equal((await f.guest('character',{headers:g.headers,data:payload})).status,401);assert.equal(JSON.stringify(f.host.memories.data),before);
});
