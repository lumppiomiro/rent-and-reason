'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../engine.js'),L=require('../lobby-model.js'),T=require('../trophies.js'),I=require('../fi.js'),P=require('../personality-presets.js'),E=require('../experience.js');require('../lobby-fi.js');
function homeUI({first=false,reduced=false,motion='on'}={}){
 const game=new M.Game({boardId:'lantern-harbor',language:'en'}),prefs=new Map([['home-motion',motion]]),effects={api:0,animations:0,cancelled:0,sounds:0},listeners={};
 const animate=()=>{effects.animations++;return{finished:Promise.resolve(),cancel(){effects.cancelled++;}};};
 const cube={animate},nodes=[0,1].map(()=>({animate,querySelector:()=>cube}));
 const button={setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},querySelector:()=>null,classList:{add(){},remove(){}},style:{setProperty(){},removeProperty(){}},setPointerCapture(){},hasPointerCapture:()=>false},pair={innerHTML:'',isConnected:true,closest:()=>button,querySelectorAll:()=>nodes},result={textContent:''},home={dataset:{homeMotion:motion},style:{removeProperty(){}},querySelector:s=>s.includes('home-motion')?button:pair};
 const c=vm.createContext({RentReasonLobby:L,RentReason:M,game,firstRun:first,uiLanguage:'en',I18n:I,Boards:M.Boards,Trophies:T,Personality:P,Experience:E,remote:null,playCue(){effects.sounds++;},
 Art:{piece:()=>'<svg></svg>'},View:{scene:()=>'<svg></svg>',card:()=>'<div></div>'},trophyCup:()=>'<svg></svg>',playerLook:id=>game.s.players[id],
 esc:s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),
 pref:(k,f)=>prefs.get(k)??f,savePref:(k,v)=>prefs.set(k,v),api(){effects.api++;throw Error('Home must not call a game API');},
 matchMedia:()=>({matches:reduced}),document:{addEventListener(type,fn){(listeners[type]??=[]).push(fn);},querySelector:s=>s==='.home-dice-pair'?pair:s==='.home-experience'?home:null},$:id=>id==='home-dice-result'?result:null,console});
 vm.runInContext(fs.readFileSync(require.resolve('../lobby-ui.js'),'utf8'),c);
 return {c,game,prefs,effects,pair,result,home,button,listeners};
}
test('home chooses the correct entry action for new, active and completed games without mutating state',()=>{
 for(const [first,phase,action] of [[true,'roll','setup'],[false,'roll','resume'],[false,'over','setup']]){
  const {c,game,effects}=homeUI({first});game.s.phase=phase;const before=JSON.stringify(game.s),html=vm.runInContext('lobbyHome()',c);
  assert.match(html,new RegExp('class="primary" data-lobby="'+action+'"'));
  assert.equal(JSON.stringify(game.s),before);assert.equal(effects.api,0);
 }
});
test('tabletop dice are decorative and respect both motion preferences',async()=>{
 for(const [motion,reduced,animations] of [['on',false,4],['off',false,0],['on',true,0]]){
  const {c,game,effects,pair,result}=homeUI({motion,reduced}),before=JSON.stringify(game.s);
  await vm.runInContext("lobbyAction('home-roll')",c);
  assert.equal(JSON.stringify(game.s),before);assert.equal(effects.api,0);assert.equal(effects.animations,animations);
  assert.match(pair.innerHTML,/dice-cube/);assert.equal(effects.sounds,1);assert.match(result.textContent,/Tabletop dice: [1-6] \+ [1-6] = \d+/);
 }
});
test('motion toggle persists its setting without rebuilding the page or changing the game',async()=>{
 const {c,game,prefs,home,button,effects}=homeUI(),before=JSON.stringify(game.s);
 await vm.runInContext("lobbyAction('home-motion')",c);
 assert.equal(prefs.get('home-motion'),'off');assert.equal(home.dataset.homeMotion,'off');assert.equal(button['aria-pressed'],'false');
 await vm.runInContext("lobbyAction('home-motion')",c);
 assert.equal(prefs.get('home-motion'),'on');assert.equal(home.dataset.homeMotion,'on');assert.equal(button['aria-pressed'],'true');
 assert.equal(JSON.stringify(game.s),before);assert.equal(effects.api,0);
});
test('rivals and archived headlines escape user-authored names and use real recorded results',()=>{
 const {c,game}=homeUI();game.s.players[0].name='<img src=x onerror=alert(1)>';
 c.record={id:'one',boardId:'lantern-harbor',round:7,source:'user-confirmed',finishedAt:'unknown',entries:[{key:'human:test',name:game.s.players[0].name,type:'human',model:'',place:1}]};
 vm.runInContext('lobbyHistory=[record]',c);const html=vm.runInContext('lobbyHome()',c);
 assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;img src=x'));assert.ok(!html.includes('Invalid Date'));assert.ok(html.includes('data-lobby="archive:one"'));
});
test('new home copy and dice announcements are translated offline',()=>{
 for(const source of ['Pull up','a chair.','Continue game','Motion off','Tabletop dice','The Table Gazette','Big personalities.'])assert.notEqual(I.translate(source,'fi'),source);
 assert.equal(I.translate('4 players','fi'),'4 pelaajaa');
});

test('dragging the landing dice uses the game throw threshold without making a game request',()=>{
 const {c,listeners,button,game,effects}=homeUI(),before=JSON.stringify(game.s);
 const event=(x,y)=>({target:{closest:()=>button},button:0,isPrimary:true,pointerId:7,clientX:x,clientY:y,preventDefault(){}});
 listeners.pointerdown[0](event(20,40));listeners.pointermove[0](event(23,43));listeners.pointerup[0](event(23,43));
 assert.equal(effects.animations,0);
 listeners.pointerdown[0](event(20,40));listeners.pointermove[0](event(70,10));listeners.pointerup[0](event(70,10));
 assert.equal(effects.animations,4);assert.equal(effects.api,0);assert.equal(JSON.stringify(game.s),before);
 assert.equal(vm.runInContext('lobbyHomeDrag',c),null);
});
