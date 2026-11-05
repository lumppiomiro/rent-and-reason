'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../engine.js'),E=require('../economy.js'),S=require('../ai/strategy.cjs'),{Table}=require('../ai/table.cjs');
const players=()=>[{name:'Model',type:'ollama',model:'test'},{name:'Human',type:'human'}];
function fresh(){return new Game({seed:42,bots:1});}
function own(g,ids,level=0,owner=0){for(const id of ids)Object.assign(g.s.props[id],{owner,level});g.s.workshops=32-g.s.props.reduce((n,p)=>n+(p.level<5?p.level:0),0);g.s.landmarks=12-g.s.props.filter(p=>p.level===5).length;}
test('debt quote is pure and mortgages a spare deed before touching profitable landmarks',()=>{
 const g=fresh();own(g,[16,18,19],5);own(g,[5]);g.player.cash=0;const before=JSON.stringify(g.s),q=E.liquidation(g,0,90);assert.equal(JSON.stringify(g.s),before);assert.deepEqual(q.steps,[{kind:'mortgage',property:5}]);assert.equal(q.cashAfter,100);g.raiseCash(0,90);assert.equal(g.player.cash,q.cashAfter);assert.equal(g.s.props[16].level,5);Game.validate(g.s);
});
test('funding is coordinated within the weaker group, preserving high rent per refund',()=>{
 const g=fresh();own(g,[16,18,19],3);own(g,[31,32,34],3);g.player.cash=0;const q=E.liquidation(g,0,250);assert.deepEqual(q.groups,['green']);assert.ok(q.steps.every(s=>g.board[s.property].group==='green'));assert.ok(q.steps.filter(s=>s.kind==='sell').length>=3);g.raiseCash(0,250);assert.ok(g.player.cash>=250);assert.deepEqual([16,18,19].map(n=>g.s.props[n].level),[3,3,3]);Game.validate(g.s);
});
test('a large debt empties the weaker group and mortgages it before touching the next',()=>{
 const g=fresh();own(g,[16,18,19],3);own(g,[31,32,34],1);g.player.cash=0;const q=E.liquidation(g,0,600);assert.equal(q.shortfall,0);assert.deepEqual(q.groups,['green']);assert.ok(q.steps.some(s=>s.kind==='mortgage'));g.raiseCash(0,600);assert.equal(g.player.cash,q.cashAfter);assert.deepEqual([16,18,19].map(n=>g.s.props[n].level),[3,3,3]);Game.validate(g.s);
});
test('landmark shortages use legal whole-group sales and preserve bank inventory',()=>{
 const g=fresh();own(g,[1,3],5);own(g,[6,8,9,11,13,14,16,18],4,1);g.player.cash=0;assert.equal(g.s.workshops,0);const q=E.liquidation(g,0,25);assert.equal(q.steps[0].kind,'sellset');g.raiseCash(0,25);assert.equal(g.s.props[1].level,0);assert.equal(g.s.props[3].level,0);Game.validate(g.s);
});
test('insufficient assets yield an honest shortfall without over-selling or changing RNG',()=>{
 const g=fresh();own(g,[1,3],1);g.player.cash=0;const seed=g.s.rng,q=E.liquidation(g,0,1000);assert.equal(q.cashAfter,110);assert.equal(q.shortfall,890);assert.equal(g.s.rng,seed);g.raiseCash(0,1000);assert.equal(g.player.cash,110);Game.validate(g.s);
});
function auctionTable(cash=1500){const t=new Table({players:[{name:'Model',type:'ollama',model:'test'},{name:'Rival',type:'heuristic'}]},{});t.game.s.phase='buy';t.game.s.purchase=39;t.game.decline();t.game.s.players[0].cash=cash;return t;}
test('auction ceilings value incremental bidding and protect affordable mortgage bargains',()=>{
 const t=auctionTable(),g=t.game;try{const q=S.auctionAdvice(g,0),as=t.choices(0);assert.equal(q.mortgageValue,200);assert.equal(q.bargainFloor,200);assert.ok(!as.some(a=>a.id==='pass'||a.cap<200));const best=as.toSorted((a,b)=>b.score-a.score)[0];assert.equal(best.cap,q.recommendedCeiling);assert.ok(best.cap>200);t.options.players[0].type='human';assert.ok(t.choices(0).some(a=>a.id==='pass'));}finally{t.dispose();}
});
test('cash-stressed bots can still pass and never commit a reserve they cannot spare',()=>{
 const t=auctionTable(30);try{assert.equal(S.auctionAdvice(t.game,0).bargainFloor,0);assert.ok(t.choices(0).some(a=>a.id==='pass'));}finally{t.dispose();}
});
test('AI manual sales cannot tear down a landmark while mortgageable spare deeds exist',()=>{
 const t=auctionTable();try{const g=t.game;g.s.auction=null;g.s.phase='debt';g.s.debt={from:0,to:1,amount:200};g.player.cash=0;own(g,[16,18,19],5);own(g,[5]);assert.ok(t.choices(0).some(a=>a.id==='raise'));assert.ok(!t.choices(0).some(a=>a.id.startsWith('sell:')||a.id==='surrender'));}finally{t.dispose();}
});
