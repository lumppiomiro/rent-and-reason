'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8'),lobby=fs.readFileSync(require.resolve('../lobby-ui.js'),'utf8');
const open=app.slice(app.indexOf('function openModal('),app.indexOf('function closeModal('));
const render=lobby.slice(lobby.indexOf('function renderLobby('),lobby.indexOf('function lobbyRefreshHomeHistory('));
function ui(){
 let dialog={scrollTop:640,isConnected:true};const queue=[],focuses=[];
 const control={id:'lobby-model',closest:()=>null,focus(options){focuses.push({id:this.id,options});if(!options?.preventScroll)dialog.scrollTop=0;}},heading={setAttribute(){},focus(options){focuses.push({id:'heading',options});}};
 const root={set innerHTML(html){dialog.isConnected=false;dialog={scrollTop:0,isConnected:true,querySelector:()=>control};},querySelector:s=>s==='.modal'?dialog:s==='h1'?heading:null,querySelectorAll:()=>[]};
 const c=vm.createContext({document:{activeElement:control,body:{classList:{toggle(){}}}},$:id=>id==='modal-root'?root:control,modal:'lobby',timer:null,restoreSettings(){},pauseClassicClock(){},clearTimeout(){},setTimeout:f=>queue.push(f),lobbyView:'setup',lobbyPreview:false,lobbyHeader:()=>'',lobbySetupHTML:()=>'',localizer:{refresh(){dialog.scrollTop=0;}}});
 vm.runInContext(open+render,c);return{c,queue,focuses,get dialog(){return dialog;}};
}
test('changing a setup option preserves scroll and focus after dialog reconstruction',()=>{
 const u=ui();vm.runInContext('renderLobby()',u.c);u.queue.forEach(fn=>fn());
 assert.equal(u.dialog.scrollTop,640);assert.equal(u.focuses.length,1);assert.equal(u.focuses[0].id,'lobby-model');assert.equal(u.focuses[0].options.preventScroll,true);
});
test('stale focus callbacks cannot pull a newly navigated setup step back down',()=>{
 const u=ui();vm.runInContext('renderLobby(); renderLobby(true)',u.c);u.queue.forEach(fn=>fn());
 assert.equal(u.dialog.scrollTop,0);assert.deepEqual(u.focuses.map(f=>f.id),['heading']);
});
