'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../lobby-ui.js'),'utf8');
function setup(overrides={}){
 const context=vm.createContext({aiHost:{},lobbyProvidersLoading:false,modal:'none',lobbyView:'setup',providerInfo:null,lobbyDraft:{players:[{type:'codex',model:'saved-model'}]},providerModels:()=>[],renderLobby(){},toast(){},lobbyText:s=>s,esc:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),...overrides});
 for(const [start,end]of [['function lobbyProviderRecovery(', 'function lobbyPlayersStep('],['async function lobbyLoadProviders(', 'function lobbyShowError(']])vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end)),context);
 return context;
}
test('retry bypasses discovery cache, blocks duplicate checks, and preserves model during outage',async()=>{
 let finish,calls=[];
 const c=setup({api:route=>{calls.push(route);return new Promise(resolve=>finish=resolve);}});
 const pending=c.lobbyLoadProviders();await c.lobbyLoadProviders();
 assert.deepEqual(calls,['providers?refresh=1']);finish({codex:{available:false,models:[]}});await pending;
 assert.equal(c.lobbyProvidersLoading,false);assert.equal(c.lobbyDraft.players[0].model,'saved-model');
});
test('recovery escapes provider errors and opens the matching connection setup',()=>{
 const c=setup({providerInfo:{codex:{available:false,error:'<img src=x>'}}});
 const html=c.lobbyProviderRecovery('codex');assert.ok(html.includes('&lt;img src=x&gt;'));assert.ok(!html.includes('<img'));assert.ok(html.includes('codex login'));assert.ok(html.includes('data-lobby="connections:codex"'));
 c.providerInfo.codex.available=true;assert.equal(c.lobbyProviderRecovery('codex'),'');
});
