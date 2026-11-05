'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../engine.js');
const Lobby=require('../lobby-model.js');
const S=require('../ai/strategy.cjs');
const Social=require('../ai/social.cjs');
const {STATIC,STRATEGY101}=require('../ai/session.cjs');
const I=require('../fi.js');

function fixture(enabled=true,boardId='lantern-harbor'){
 const g=new Game({seed:42,boardId,rules:{noRentInJail:enabled},players:[{type:'human',name:'Visitor'},{type:'human',name:'Owner'}]});
 for(const id of [1,3,5,15,12,28,39])g.s.props[id].owner=1;
 g.s.props[39].level=5;g.s.landmarks--;
 g.s.players[1].inJail=true;g.s.players[1].pos=10;
 return g;
}

test('jailed owners collect no rent on any deed type or board, with no debt or utility reroll',()=>{
 for(const boardId of ['lantern-harbor','lantern-harbor'])for(const [id,modifier]of [[1,null],[39,null],[5,null],[5,'rail'],[12,null],[12,'utility']]){
  const g=fixture(true,boardId);g.player.cash=0;g.player.pos=id;
  const seed=g.s.seed,ownerCash=g.s.players[1].cash;
  assert.equal(g.rent(id,7,modifier),0);
  g.land(g.player,modifier);
  assert.equal(g.s.phase,'end');assert.equal(g.player.cash,0);assert.equal(g.s.players[1].cash,ownerCash);
  assert.equal(g.s.payments.length,0);assert.equal(g.s.seed,seed);
  assert.equal(g.events.some(e=>e.type==='money'||e.type==='debt'),false);
  assert.match(g.s.notice,/No rent on/);
 }
});

test('classic rules and Just visiting still charge street, landmark, ferry and utility rent',()=>{
 for(const enabled of [false,true])for(const id of [1,39,5,12]){
  const g=fixture(enabled);if(enabled)g.s.players[1].inJail=false;
  g.player.pos=id;g.player.cash=5000;const amount=g.rent(id,2);assert(amount>0);
  g.land(g.player);assert.equal(g.player.cash,5000-amount);assert.equal(g.s.players[1].cash,1500+amount);
 }
});

test('Tide & Turn ferry and utility visits obey the jail rent rule',()=>{
 for(const [card,start,target]of [[3,7,15],[5,7,12]]){
  const g=fixture();g.player.pos=start;g.s.decks.chance=[card,...g.s.decks.chance.filter(i=>i!==card)];
  g.land(g.player);assert.equal(g.player.pos,target);assert.equal(g.player.cash,1500);assert.equal(g.s.players[1].cash,1500);
  assert.equal(g.s.phase,'end');assert.equal(g.events.some(e=>e.type==='money'),false);
 }
});

test('rent resumes immediately after fee, card, doubles or mandatory jail release',()=>{
 for(const method of ['fee','card','doubles','mandatory']){
  const g=fixture();g.s.turn=1;
  if(method==='fee')assert(g.releaseJail());
  if(method==='card'){
   g.s.decks.chance=g.s.decks.chance.filter(i=>i!==7);g.player.cards.push({deck:'chance',index:7});assert(g.releaseJail(true));
  }
  if(method==='doubles')g.roll([1,1]);
  if(method==='mandatory'){g.player.jail=2;g.roll([1,2]);}
  assert.equal(g.s.players[1].inJail,false);assert.equal(g.rent(1),4);
  g.s.turn=0;g.s.phase='roll';g.player.pos=1;const before=g.s.players[1].cash;
  g.land(g.player);assert.equal(g.player.cash,1496);assert.equal(g.s.players[1].cash,before+4);
 }
});

test('jail rent suspension does not block card income or payments from other players',()=>{
 const g=fixture();g.s.turn=1;g.s.decks.chest=[1,...g.s.decks.chest.filter(i=>i!==1)];
 g.draw(g.player,'chest');assert.equal(g.player.cash,1700);
 g.queue(0,1,10,'Birthday');g.processPayments();assert.equal(g.player.cash,1710);assert.equal(g.s.players[0].cash,1490);
});

test('saved games retain the switch and older saves default it off without changing their rules',()=>{
 const g=fixture();assert.equal(Game.load(JSON.parse(JSON.stringify(g.s))).s.rules.noRentInJail,true);
 const old=structuredClone(g.s);delete old.rules.noRentInJail;old.rules.doubleGo=true;
 const before=JSON.stringify(old),loaded=Game.load(old);
 assert.equal(JSON.stringify(old),before);assert.equal(loaded.s.rules.noRentInJail,false);assert.equal(loaded.s.rules.doubleGo,true);
 assert.equal(loaded.rent(1),4);assert.deepEqual(loaded.s.players,old.players);
 for(const invalid of [null,1,'true']){const bad=structuredClone(g.s);bad.rules.noRentInJail=invalid;assert.throws(()=>Game.load(bad));assert.throws(()=>new Game({rules:{noRentInJail:invalid}}));}
});

test('new-game drafts keep this rule isolated from the ongoing game',()=>{
 const g=fixture(false),before=JSON.stringify(g.s),draft=Lobby.draft(g.s);draft.rules.noRentInJail=true;
 const next=new Game(Lobby.options(draft));assert.equal(next.s.rules.noRentInJail,true);
 assert.equal(JSON.stringify(g.s),before);assert.equal(g.s.rules.noRentInJail,false);
});

test('AI risk and grounded facts use suspended rent, and cached guidance explains both rules',()=>{
 const g=fixture();g.player.pos=37;
 const fact=()=>Social.grounding(g,0,{question:'Lantern Summit'}).properties.find(p=>p.id===39);
 assert.equal(S.risk(g,0).worstNextRollCost,200);assert.equal(fact().rentYouPayHere,0);
 g.s.players[1].inJail=false;
 assert.equal(S.risk(g,0).worstNextRollCost,2000);assert.equal(fact().rentYouPayHere,2000);
 assert.match(STATIC,/noRentInJail/);assert.match(STRATEGY101,/noRentInJail/);
});

test('the new rule and its explanation are available in Finnish',()=>{
 for(const text of ['No rent during permit review','Players in permit review cannot collect rent on streets, ferries or utilities. Rent resumes when they leave.','Players in Permit Review cannot collect rent until they leave.'])assert.notEqual(I.translate(text,'fi'),text);
});
