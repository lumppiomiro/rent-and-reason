'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Game,PLAYER_COLORS,PIECES}=require('../engine.js'),E=require('../experience.js');
test('all playing pieces and palette colours survive classic save / resume',()=>{
 for(const piece of PIECES)for(const [color]of PLAYER_COLORS){const g=new Game({piece,color});assert.equal(g.player.piece,piece);assert.equal(g.player.color,color);assert.equal(Game.load(g.s).player.color,color);assert.equal(Game.load(g.s).player.piece,piece);}
});
test('visual overrides are isolated from authoritative state and reject CSS or unknown piece injection',()=>{
 const g=new Game({players:[{type:'human'},{type:'codex'},{type:'ollama'},{type:'claude'}]}),before=JSON.stringify(g.s);
 const normal=E.playerLooks(g.s);assert.deepEqual(normal.map(l=>l.piece),['comet','codex','ollama','claude']);
 const looks=E.playerLooks(g.s,{0:{piece:'beacon',color:'#8051a3'},1:{piece:'<script>',color:'url(bad)'}});assert.equal(looks[0].piece,'beacon');assert.equal(looks[1].piece,'codex');assert.equal(looks[0].color,'#8051a3');assert.equal(looks[1].color,PLAYER_COLORS[1][0]);assert.equal(JSON.stringify(g.s),before);
});
test('accepted trades emit a complete receipt including both gross cash directions and bank fees',()=>{
 const g=new Game();g.s.props[1].owner=0;g.s.props[3].owner=1;g.s.props[3].mortgaged=true;g.events=[];
 const r=g.executeTrade(0,1,[1],[3],100,20);assert.equal(r.ok,true);const receipt=g.events.find(e=>e.type==='trade');assert.deepEqual(receipt,{type:'trade',from:0,to:1,give:[1],take:[3],giveCash:100,takeCash:20,fees:{0:3,1:0},mortgages:{1:false,3:true}});assert.equal(g.player.cash,1417);assert.equal(g.s.players[1].cash,1580);
 assert.equal(E.withTradeReceipts({},g.s,g.events).filter(e=>e.type==='trade').length,1);
});
test('rejected offers do not emit completed-trade receipts',()=>{const g=new Game();g.events=[];assert.equal(g.executeTrade(0,1,[1],[],0,0).ok,false);assert.equal(g.events.some(e=>e.type==='trade'),false);});
test('a running older host can show property and net-cash receipts without changing its state',()=>{
 const g=new Game();g.s.props[1].owner=0;g.s.props[3].owner=1;const before=structuredClone(g.s);g.events=[];g.executeTrade(0,1,[1],[3],50,0);const oldEvents=g.events.filter(e=>e.type!=='trade'),copy=JSON.stringify(g.s),out=E.withTradeReceipts(before,g.s,oldEvents),r=out.at(-1);
 assert.equal(r.type,'trade');assert.equal(r.inferred,true);assert.deepEqual(r.give,[1]);assert.deepEqual(r.take,[3]);assert.deepEqual(r.cashChanges.map(c=>c.amount),[-50,50]);assert.equal(JSON.stringify(g.s),copy);assert.equal(oldEvents.some(e=>e.type==='trade'),false);
});
test('free property swaps and cash-only trades have receipts; purchases and bankruptcy do not',()=>{
 const g=new Game();g.s.props[1].owner=0;g.s.props[3].owner=1;let before=structuredClone(g.s);g.events=[];g.executeTrade(0,1,[1],[3]);assert.equal(E.withTradeReceipts(before,g.s,[]).at(-1).type,'trade');
 before=structuredClone(g.s);g.events=[];g.executeTrade(0,1,[],[],10,0);assert.equal(E.withTradeReceipts(before,g.s,g.events.filter(e=>e.type!=='trade')).at(-1).type,'trade');
 before=structuredClone(g.s);g.events=[];g.s.props[5].owner=0;assert.deepEqual(E.withTradeReceipts(before,g.s,[]),[]);
 before=structuredClone(g.s);g.events=[];g.bankrupt(0,1);const out=E.withTradeReceipts(before,g.s,g.events);assert.equal(out.some(e=>e.type==='trade'),false);
});
