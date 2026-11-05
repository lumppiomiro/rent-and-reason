'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../engine.js'),F=require('../feedback.js'),T=require('../tabletop.js');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8'),performSource=source.slice(source.indexOf('async function perform('),source.indexOf('function button('));
function playback({hosted=false,bot=false,motion=true}={}){
 const game=new M.Game({boardId:'lantern-harbor',players:[{name:'Player',type:bot?'heuristic':'human'},{name:'Other',type:'heuristic'}]}),seen={errors:[],toasts:[],events:[],dice:0,renders:0,saves:[],cues:[]},classes=new Set();
 const classList={add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));}};
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',classList,setAttribute(){},removeAttribute(){},getBoundingClientRect:()=>({top:20,bottom:500}),scrollIntoView(){}});return nodes.get(id);};
 const buttons=[{dataset:{action:'roll'},disabled:false},{dataset:{action:'sound'},disabled:false},{dataset:{action:'ai-pause'},disabled:false}];
 const c=vm.createContext({game,remote:hosted?{}:null,classicClock:null,modal:null,busy:false,timer:null,animationEpoch:0,displayBalances:[],displayOut:[],displayPositions:[],visualTurn:null,unseenBankruptcies:[],motion,pendingDiceThrow:null,selected:39,innerWidth:1280,innerHeight:900,structuredClone,
 document:{hidden:false,body:{classList},querySelectorAll:()=>buttons},$:node,preMatchState:()=>null,clearTimeout(){},classicHistory:()=>null,Feedback:F,Tabletop:T,mySeat:()=>0,B:game.board,recordVisualChange(){},persist(){seen.saves.push(JSON.stringify(game.s));},players(){},animateDice:async()=>{seen.dice++;},animateRoute:async e=>seen.events.push(e.type),render(){seen.renders++;},celebrateMoments(){},syncSound(){},playCue(name){seen.cues.push(name);},esc:s=>s,toast:t=>seen.toasts.push(t),console:{error:e=>seen.errors.push(e.message)},delay:async()=>{}});
 vm.runInContext(performSource,c);return{c,game,seen,classes};
}
test('a completed human purchase plays its events after saving without a UI exception',async()=>{
 const {c,game,seen,classes}=playback();game.s.players[0].pos=1;game.s.phase='buy';game.s.purchase=1;const cash=game.player.cash;
 await vm.runInContext('perform(()=>game.buy())',c);
 assert.deepEqual(seen.errors,[]);assert.deepEqual(seen.toasts,[]);assert.equal(game.s.props[1].owner,0);assert.equal(game.player.cash,cash-60);assert.ok(seen.events.length>0);assert.equal(seen.saves.length,1);assert.equal(JSON.parse(seen.saves[0]).props[1].owner,0);assert.equal(seen.renders,1);assert.equal(c.busy,false);assert.ok(!classes.has('animating'));
});
test('hosted human and bot roll playback reaches the dice and movement animations exactly once',async()=>{
 for(const bot of [false,true]){
  const {c,game,seen}=playback({hosted:true,bot});
  await vm.runInContext('perform(()=>game.roll([2,3]),true)',c);
  assert.deepEqual(seen.errors,[]);assert.equal(seen.dice,1);assert.ok(seen.events.includes('move'));assert.equal(game.player.pos,5);assert.equal(seen.saves.length,1);assert.equal(seen.renders,1);
 }
});
test('animation-disabled playback still applies and displays a saved action without errors',async()=>{
 const {c,game,seen}=playback({hosted:true,motion:false});await vm.runInContext('perform(()=>game.roll([2,3]),true)',c);
 assert.deepEqual(seen.errors,[]);assert.equal(seen.dice,0);assert.equal(game.player.pos,5);assert.equal(seen.renders,1);assert.equal(c.busy,false);
});
