'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../engine.js'),S=require('../ai/strategy.cjs'),N=require('../ai/negotiation.cjs'),{Table}=require('../ai/table.cjs'),{AgentSession}=require('../ai/session.cjs');
const roster=(type='ollama')=>[{name:'Alex',type:'human'},{name:'Bot',type,model:'test'}];
const answer=(actionId,extra={})=>JSON.stringify({type:'act',actionId,tool:'',actionIds:[],memory:'Keep a cash reserve.',rationale:'Seek fair compensation.',say:'',facts:[],proposal:null,...extra});
const provider=choose=>({calls:[],async complete(r){this.calls.push(r);return{text:choose(r,this.calls.length),usage:{input:100,output:20,requests:1}};},forget(){}});
function fixture(p,extra={}){const t=new Table({players:roster(p?'ollama':'heuristic')},p?{ollama:p}:{},extra);t.game.s.props[1].owner=1;t.game.s.props[3].owner=0;return t;}
const propose=t=>t.human({revision:t.revision,action:'propose',trade:{from:0,to:1,give:[],take:[1],giveCash:90,takeCash:0}});
const stop=t=>clearTimeout(t.timer);

test('a model receives useful counter candidates and can counter in one ordinary decision',async()=>{
 const p=provider(r=>{const input=JSON.parse(r.text);assert.equal(input.negotiation.canCounter,true);assert.equal(input.negotiation.countersRemaining,1);assert.ok(input.actions.some(a=>a.counter));return answer('counter',{say:'I can sell Pebble Lane for $240.'});}),t=fixture(p);propose(t);stop(t);const before=JSON.stringify(t.game.s.props),cash=t.game.s.players.map(p=>p.cash);await t.step();stop(t);
 assert.equal(t.error,null);assert.equal(p.calls.length,1);assert.equal(t.offer.from,1);assert.equal(t.offer.to,0);assert.equal(t.offer.takeCash,240);assert.deepEqual(t.offer.counterSeats,[1]);assert.equal(t.offer.depth,1);assert.equal(JSON.stringify(t.game.s.props),before);assert.deepEqual(t.game.s.players.map(p=>p.cash),cash);
 assert.equal(t.chat.find(c=>c.counter)?.offerId,t.offer.id);assert.match(t.chat.find(c=>c.counter).text,/counteroffers/);assert.match(t.note,/counteroffer/);assert.equal(t.chat.find(c=>c.kind==='trade'&&!c.counter).outcome,'Countered');
 t.human({revision:t.revision,action:'accept',offerId:t.offer.id});assert.equal(t.offer,null);assert.equal(t.game.s.props[1].owner,0);assert.equal(t.game.s.players[0].cash,1260);assert.equal(t.game.s.players[1].cash,1740);t.dispose();
});
test('a programmatic bot can reprice an underpaid complete district concession instead of simply rejecting',async()=>{
 const t=fixture();propose(t);stop(t);await t.step();stop(t);assert.equal(t.offer?.from,1);assert.ok(t.offer.takeCash>90);assert.equal(t.game.s.props[1].owner,1);t.dispose();
});
test('both bots may counter once, but a bot cannot counter twice in the same negotiation',()=>{
 const t=new Table({players:[{type:'heuristic',name:'A'},{type:'heuristic',name:'B'}]},{});t.game.s.props[1].owner=0;t.game.s.props[3].owner=1;
 t.offer={id:'restored-offer',from:0,to:1,give:[1],take:[3],giveCash:0,takeCash:0,depth:0,counterSeats:[]};
 const first={from:1,to:0,give:[3],take:[1],giveCash:0,takeCash:30};t.commit(1,{id:'custom:0',counter:true,trade:first,label:'Counter'});assert.equal(N.canCounter(t.offer,0),true);assert.equal(N.canCounter(t.offer,1),false);
 // Reciprocal brown swaps change no set count, so use a profitable cash counter
 // to the current seller; a human proposer is not needed for the budget check.
 const second={from:0,to:1,give:[1],take:[3],giveCash:0,takeCash:30};t.commit(0,{id:'custom:1',counter:true,trade:second,label:'Counter'});assert.deepEqual(t.offer.counterSeats,[1,0]);assert.equal(t.offer.depth,2);assert.equal(t.choices(1).some(a=>a.counter),false);
 const before=JSON.stringify(t.offer);assert.throws(()=>t.commit(1,{id:'counter',counter:true,trade:first}),/already made/);assert.equal(JSON.stringify(t.offer),before);t.dispose();
});
test('a human counter does not consume a bot counter; their next human edit does not replenish it',async()=>{
 const t=fixture();t.game.s.props[11].owner=1;t.game.s.props[13].owner=1; // Original bot proposal.
 t.commit(1,{id:'trade:initial',trade:{from:1,to:0,give:[1],take:[],giveCash:0,takeCash:300},label:'Offer'});
 t.human({revision:t.revision,action:'counter-propose',offerId:t.offer.id,trade:{from:0,to:1,give:[],take:[1],giveCash:90,takeCash:0}});stop(t);assert.deepEqual(t.offer.counterSeats,[0]);assert.equal(N.canCounter(t.offer,1),true);await t.step();stop(t);assert.equal(t.offer.from,1);assert.deepEqual(t.offer.counterSeats,[0,1]);
 t.human({revision:t.revision,action:'counter-propose',offerId:t.offer.id,trade:{from:0,to:1,give:[],take:[1],giveCash:100,takeCash:0}});stop(t);assert.equal(N.canCounter(t.offer,1),false);assert.equal(t.choices(1).some(a=>a.counter),false);t.dispose();
});
test('custom property counteroffers are legal, targeted, and bounded by the same per-player limit',async()=>{
 const g=new Game({players:roster()});g.s.props[1].owner=1;g.s.props[3].owner=0;g.s.props[5].owner=0;
 const offer={from:0,to:1,give:[],take:[1],giveCash:90,takeCash:0,depth:1,counterSeats:[0]},p=provider((r,n)=>n===1?answer('',{type:'analyze',tool:'trade',proposal:{to:0,give:[1],take:[5],giveCash:100,takeCash:0}}):answer('custom:0'));
 const s=new AgentSession(1,roster()[1],p),decision=await s.decide(g,S.legalActions(g,1,{offer}),{offer});assert.equal(decision.action.counter,true);assert.deepEqual(decision.action.trade.take,[5]);assert.equal(p.calls.length,2);assert.equal(g.s.props[1].owner,1);
 const actions=[];assert.match(s.analysis(g,{tool:'trade',proposal:{to:0,give:[1],take:[],giveCash:0,takeCash:90}},actions,{offer}).error,/same terms/);
 assert.ok(s.analysis(g,{tool:'trade',proposal:{to:0,give:[1],take:[],giveCash:0,takeCash:300}},actions,{offer:{...offer,counterSeats:[0,1]}}).error);
});
test('generated counters can change deeds when a cash-only correction is unavailable',()=>{
 const g=new Game({players:roster()});g.s.props[1].owner=1;g.s.props[3].owner=0;g.s.props[11].owner=1;g.s.props[13].owner=1;g.s.props[14].owner=0;g.s.players[0].cash=0;
 const offer={from:0,to:1,give:[],take:[1],giveCash:0,takeCash:0,depth:0};const counters=S.counterOffers(g,1,offer);assert.ok(counters.length);assert.ok(counters.some(t=>t.take.length||t.give.length<1));assert.ok(counters.every(t=>!g.validateTrade(t.from,t.to,t.give,t.take,t.giveCash,t.takeCash)));assert.ok(counters.length<=3);
});
test('unchanged, misdirected and invalid counters leave the live offer and board untouched',()=>{
 const t=fixture();propose(t);stop(t);const before=JSON.stringify(t.game.s),live=JSON.stringify(t.offer);
 for(const trade of [N.reversed(t.offer),{from:1,to:1,give:[1],take:[],giveCash:0,takeCash:230},{from:1,to:0,give:[39],take:[],giveCash:0,takeCash:230}]){assert.throws(()=>t.commit(1,{id:'counter',counter:true,trade}));assert.equal(JSON.stringify(t.offer),live);assert.equal(JSON.stringify(t.game.s),before);}t.dispose();
});
test('counter budgets and pending terms survive save/restore; legacy depth is interpreted conservatively',async()=>{
 let saved;const t=fixture(null,{persist:s=>saved=structuredClone(s)});propose(t);stop(t);await t.step();stop(t);t.save();const restored=new Table(null,{},{saved});assert.deepEqual(restored.offer,t.offer);assert.equal(N.canCounter(restored.offer,0),true);assert.deepEqual(restored.offer.counterSeats,[1]);
 assert.deepEqual(N.counterSeats({from:1,to:0,depth:1}),[1]);assert.deepEqual(N.counterSeats({from:0,to:1,depth:2}),[0,1]);assert.equal(N.validMetadata({...t.offer,counterSeats:[99]}),false);t.dispose();restored.dispose();
});
