'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../engine.js'),L=require('../lobby-model.js'),I=require('../fi.js');require('../lobby-fi.js');
function state(){return new M.Game({boardId:'lantern-harbor',language:'fi',startingCash:1800}).s;}
function configured(){const d=L.draft(state());d.players[1].type='codex';d.players[1].model='test-model';return d;}
const providers={codex:{available:true,models:[{id:'test-model'}]}};
test('setup draft and final payload do not share state with a running game',()=>{
 const s=state(),before=JSON.stringify(s),d=L.draft(s);d.players[0].name='New name';d.players[0].color='#8051a3';d.rules.doubleGo=true;d.boardId='lantern-harbor';const options=L.options(d);options.rules.doubleGo=false;options.players[0].name='Payload copy';assert.equal(d.rules.doubleGo,true);assert.equal(d.players[0].name,'New name');assert.equal(JSON.stringify(s),before);assert.equal(d.players.length,4);
});
test('setup rejects duplicate classic pieces, colours, missing names and unavailable model choices',()=>{
 const d=configured();assert.equal(L.validate(d,{host:true,providers}),'');d.players[1].piece=d.players[0].piece;assert.match(L.validate(d,{host:true,providers}),/different badge/);d.players[1].piece='acorn';d.players[1].color=d.players[0].color;assert.match(L.validate(d,{host:true,providers}),/different colour/);d.players[1].color=M.PLAYER_COLORS[1][0];d.players[1].name=' ';assert.match(L.validate(d,{host:true,providers}),/name/);d.players[1].name='Model';assert.match(L.validate(d),/AI launcher/);assert.match(L.validate(d,{host:true,providers:{codex:{available:false}}}),/unavailable/);d.players[1].model='missing';assert.match(L.validate(d,{host:true,providers}),/available model/);
});
test('spectator games require all bot seats and unique badges; cash is bounded',()=>{
 const d=L.draft(state());d.mode='watch';assert.match(L.validate(d),/human/);d.players[0].type='heuristic';d.players[0].piece='comet';d.players[1].piece='comet';assert.match(L.validate(d),/different badge/);d.players[1].piece='acorn';assert.equal(L.validate(d),'');d.startingCash=1.5;assert.match(L.validate(d),/whole amount/);d.startingCash=1000001;assert.match(L.validate(d),/whole amount/);d.startingCash=0;assert.equal(L.validate(d),'');
});

function ui(preview){
 const calls=[],s=state(),fields={'lobby-error':{textContent:''},'lobby-replace':{checked:false}},c=vm.createContext({RentReasonLobby:L,RentReasonI18n:I,I18n:I,RentReason:M,RentReasonLobbyPreview:preview?{}:null,game:{s},uiLanguage:'en',document:{addEventListener(){}},$:id=>fields[id],api:async(route,data)=>{calls.push({route,data});return{id:'new-table'};},modal:'lobby',firstRun:false,appearancePrefs:{},savePref(){},closeModal(){c.modal=null;},setRemote(){},toast(){},structuredClone,console,aiHost:{},providerInfo:{}});
 vm.runInContext(fs.readFileSync(require.resolve('../lobby-ui.js'),'utf8'),c);vm.runInContext('lobbyDraft=Lobby.draft(game.s);',c);return{c,calls,fields,s};
}
test('preview creation never sends a mutation, even after completing valid setup',async()=>{
 const {c,calls,fields,s}=ui(true),before=JSON.stringify(s);await vm.runInContext('lobbyCreate()',c);assert.equal(calls.length,0);assert.match(fields['lobby-error'].textContent,/has not changed/);assert.equal(JSON.stringify(s),before);
});
test('a live game requires replacement confirmation before the sole final create request',async()=>{
 const {c,calls,fields}=ui(false);await vm.runInContext('lobbyCreate()',c);assert.equal(calls.length,0);assert.match(fields['lobby-error'].textContent,/Confirm replacement/);fields['lobby-replace'].checked=true;await vm.runInContext('lobbyCreate()',c);assert.equal(calls.length,1);assert.equal(calls[0].route,'table');assert.equal(calls[0].data.boardId,'lantern-harbor');assert.equal(c.appearancePrefs['new-table'][0].piece,'comet');assert.equal(c.modal,null);
});
test('home and setup copy is available offline in Finnish',()=>{
 for(const [en,fi]of [['Home','Etusivu'],['Set the table.','Kata pelipöytä.'],['Choose players →','Valitse pelaajat →'],['Create game →','Luo peli →'],['Starting cash per player','Alkuraha pelaajaa kohti']])assert.equal(I.translate(en,'fi'),fi);
});
test('the jail rent rule cannot silently start on an older AI host',async()=>{
 const {c,calls,fields,s}=ui(false),before=JSON.stringify(s);fields['lobby-replace'].checked=true;
 vm.runInContext('lobbyDraft.rules.noRentInJail=true;',c);await vm.runInContext('lobbyCreate()',c);
 assert.equal(calls.length,0);assert.match(fields['lobby-error'].textContent,/updated AI host/);assert.equal(JSON.stringify(s),before);
 c.aiHost.features={noRentInJail:1};await vm.runInContext('lobbyCreate()',c);
 assert.equal(calls.length,1);assert.equal(calls[0].data.rules.noRentInJail,true);
});
test('unrecognized board IDs are rejected before replacing a live table',async()=>{
 const {c,calls,fields,s}=ui(false),before=JSON.stringify(s);fields['lobby-replace'].checked=true;
 vm.runInContext("lobbyDraft.boardId='unknown-board';",c);await vm.runInContext('lobbyCreate()',c);
 assert.equal(calls.length,0);assert.match(fields['lobby-error'].textContent,/valid board/);assert.equal(JSON.stringify(s),before);
});
