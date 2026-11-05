'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../engine.js'),T=require('../tabletop.js');
const fixture=()=>new Game({players:[{type:'human',name:'Alex'},{type:'heuristic',name:'Ada'},{type:'heuristic',name:'Cleo'}],seed:42});
test('the auction presentation contains public bids, bidder states and canonical set ownership only',()=>{
 const g=fixture();g.s.props[18].owner=0;g.s.props[19].owner=1;g.startAuction(16,'end');const before=JSON.stringify(g.s),a=T.auction(g.s);
 assert.equal(a.bidder,0);assert.equal(a.minimum,1);assert.deepEqual(a.players.map(p=>p.cash),g.s.players.map(p=>p.cash));assert.deepEqual(a.set.map(b=>b.owner),[null,0,1]);assert.deepEqual(a.set.map(b=>b.id),[16,18,19]);assert.equal(a.groupName,'Orange');assert.equal(a.players[0].status,'bidding');
 for(const secret of ['seed','decks','bidCaps','memory','rationale'])assert.equal(Object.hasOwn(a,secret),false);assert.equal(JSON.stringify(g.s),before);
 g.bid(100);g.pass();const b=T.auction(g.s);assert.equal(b.leader,0);assert.equal(b.players[1].status,'passed');assert.equal(b.players[2].status,'bidding');assert.equal(b.minimum,101);
});
test('the rack shows every missing deed and its actual owner without granting ownership or build rights',()=>{
 const g=fixture();g.s.props[1].owner=0;g.s.props[3].owner=1;g.s.props[5].owner=0;const before=JSON.stringify(g.s),groups=T.rack(g.s,0),brown=groups.find(g=>g.group==='brown');
 assert.equal(brown.owned,1);assert.equal(brown.total,2);assert.equal(brown.complete,false);assert.equal(brown.streets[1].owned,false);assert.equal(brown.streets[1].owner,1);assert.equal(groups.find(g=>g.group==='rail').total,4);assert.equal(JSON.stringify(g.s),before);
 g.s.props[3].owner=0;g.s.props[3].mortgaged=true;const full=T.rack(g.s,0).find(g=>g.group==='brown');assert.equal(full.complete,true);assert.equal(full.streets[1].mortgaged,true);
});
test('counteroffer comparisons retain the human perspective as the proposer changes sides',()=>{
 const a={from:0,to:1,give:[5],take:[1],giveCash:90,takeCash:20},b={from:1,to:0,give:[1,3],take:[],giveCash:0,takeCash:240},before=JSON.stringify([a,b]),d=T.tradeDiff(a,b,0);
 assert.deepEqual(d.paid,{before:90,after:240});assert.deepEqual(d.received,{before:20,after:0});assert.deepEqual(d.giveRemoved,[5]);assert.deepEqual(d.takeAdded,[3]);assert.equal(d.changed,true);assert.equal(JSON.stringify([a,b]),before);
 assert.equal(T.tradeDiff(null,b,0),null);assert.equal(T.tradeDiff(a,b,2),null);assert.equal(T.tradeDiff(a,{...a,give:[5]},0).changed,false);
});
test('sold stamps use the actual closing payment rather than the previous visible bid',()=>{
 const g=fixture();g.startAuction(5,'end');g.bid(10);const before=structuredClone(g.s);g.bid(20);while(g.s.auction)g.pass();const result=T.moments(before,g.s,g.events).find(m=>m.type==='auction');assert.equal(result.price,20);assert.equal(result.winner,1);assert.equal(result.property,5);
 const noSale=fixture();noSale.startAuction(5,'end');const old=structuredClone(noSale.s);while(noSale.s.auction)noSale.pass();assert.equal(T.moments(old,noSale.s,noSale.events)[0].winner,null);
});
test('set and building celebrations appear only for actual new milestones',()=>{
 const g=fixture();g.s.props[1].owner=0;let before=structuredClone(g.s);g.s.props[3].owner=0;assert.equal(T.moments(before,g.s).filter(m=>m.type==='set').length,1);assert.equal(T.moments(g.s,g.s).length,0);assert.equal(T.moments(before,g.s,[{type:'bankrupt',player:1}]).filter(m=>m.type==='set').length,0);
 before=structuredClone(g.s);g.s.props[1].level=1;assert.equal(T.moments(before,g.s).length,0);before=structuredClone(g.s);g.s.props[1].level=3;assert.deepEqual(T.moments(before,g.s).at(-1),{type:'build',property:1,level:3,rent:90});before=structuredClone(g.s);g.s.props[1].level=5;assert.equal(T.moments(before,g.s).at(-1).rent,250);
});
test('recorded highlights distinguish rent from trades and preserve all input state',()=>{
 const g=fixture(),old=structuredClone(g.s),stats=T.freshStats(g.s);g.money([{player:0,amount:-100},{player:1,amount:100}],'rent on Lantern Summit');g.money([{player:1,amount:-400},{player:2,amount:400}],'Property trade','trade');const before=JSON.stringify([stats,old,g.s,g.events]),record=T.recordStats(stats,old,g.s,g.events);
 assert.equal(record.rent.amount,100);assert.equal(record.rent.to,1);assert.equal(record.seats[1].rentReceived,100);assert.equal(record.seats[2].rentReceived,0);assert.equal(record.seats[2].peakCash,1900);assert.equal(JSON.stringify([stats,old,g.s,g.events]),before);
 const next=structuredClone(g.s);next.players[0].out=true;next.round=6;assert.equal(T.recordStats(record,g.s,next,[]).seats[0].bankruptRound,6);
});
test('cash highlights include an observed intra-action peak before later spending',()=>{
 const g=fixture(),before=structuredClone(g.s),stats=T.freshStats(g.s);g.money([{player:0,amount:1000}],'Receipt');g.money([{player:0,amount:-800}],'Building costs','build');const record=T.recordStats(stats,before,g.s,g.events);assert.equal(g.player.cash,1700);assert.equal(record.seats[0].peakCash,2500);assert.equal(record.rent,null);
});
