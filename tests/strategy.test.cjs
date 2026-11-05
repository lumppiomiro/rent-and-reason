'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../engine.js');
const S=require('../ai/strategy.cjs');
const {StrategyPolicy,MAX_FINANCE_ACTIONS}=require('../ai/policy.cjs');
const {Table}=require('../ai/table.cjs');
const {AgentSession,STATIC,STRATEGY101}=require('../ai/session.cjs');
const roster=()=>[{type:'heuristic',name:'Ollama'},{type:'heuristic',name:'ChatGPT'},{type:'heuristic',name:'Alex'}];
const pick=(t,id,key)=>{const a=t.choices(id).find(a=>a.id===key);assert.ok(a,'Expected action '+key);return a;};
const trade=(extra={})=>({from:1,to:0,give:[],take:[1],giveCash:90,takeCash:0,...extra});
function brown(){const g=new Game({players:roster()});g.s.props[1].owner=0;g.s.props[3].owner=1;return g;}
test('a compact Strategy 101 lives in the stable cached instructions',()=>{
 assert.ok(STATIC.includes(STRATEGY101));assert.ok(STRATEGY101.split(/\s+/).length<300);assert.match(STRATEGY101,/Unmortgaging SPENDS/);assert.match(STRATEGY101,/three workshops/);assert.match(STRATEGY101,/opponent/);
});
test('AI mortgage actions expose exact signed cash changes and interest losses',()=>{
 const g=new Game({players:roster()});g.s.props[5].owner=0;const m=S.legalActions(g,0).find(a=>a.id==='mortgage:5');assert.equal(m.cashDelta,100);assert.equal(m.cashAfter,1600);assert.equal(m.interestLostIfReversed,10);
 g.mortgage(5);const u=S.legalActions(g,0).find(a=>a.id==='unmortgage:5');assert.equal(u.cashDelta,-110);assert.equal(u.cashAfter,1490);assert.equal(u.interestCost,10);
});
test('a solvent AI cannot mortgage its portfolio without a funding need',()=>{
 const t=new Table({players:roster()},{});for(const i of [5,12,14,28])t.game.s.props[i].owner=0;
 assert.equal(t.choices(0).some(a=>a.id.startsWith('mortgage:')),false);assert.throws(()=>t.commit(0,{id:'mortgage:5',property:5}),/No financing need/);assert.equal(t.game.s.props[5].mortgaged,false);t.dispose();
});
test('same-turn mortgage reversals are blocked at enumeration and execution and survive saves',()=>{
 let saved;const t=new Table({players:roster()},{},{persist:s=>saved=structuredClone(s)});t.game.s.players[0].cash=100;t.game.s.props[5].owner=0;
 t.commit(0,pick(t,0,'mortgage:5'));t.game.money([{player:0,amount:1000}],'Test income');t.save();
 const restored=new Table(null,{},{saved});const before=JSON.stringify(restored.game.s);
 assert.equal(restored.choices(0).some(a=>a.id==='unmortgage:5'),false);assert.throws(()=>restored.commit(0,{id:'unmortgage:5',property:5}),/reverse a mortgage/);assert.equal(JSON.stringify(restored.game.s),before);
 restored.game.s.phase='end';restored.commit(0,pick(restored,0,'end'));restored.game.s.phase='end';restored.commit(1,pick(restored,1,'end'));restored.game.s.phase='end';restored.commit(2,pick(restored,2,'end'));
 assert.ok(restored.choices(0).some(a=>a.id==='unmortgage:5'));t.dispose();restored.dispose();
});
test('new rent debt can justify mortgaging a deed just released and affordable debt is paid next',()=>{
 const t=new Table({players:roster()},{});t.game.s.props[5].owner=0;t.game.s.props[5].mortgaged=true;t.game.s.players[0].cash=500;
 t.commit(0,pick(t,0,'unmortgage:5'));t.game.s.controllers[0].type='ollama';t.game.queue(0,1,400,'Unexpected rent');t.game.processPayments();assert.equal(t.game.s.phase,'debt');
 t.commit(0,pick(t,0,'mortgage:5'));assert.deepEqual(t.choices(0).map(a=>a.id),['settle']);t.commit(0,pick(t,0,'settle'));assert.notEqual(t.game.s.phase,'debt');t.dispose();
});
test('AI finance has a small per-turn action budget across different properties',()=>{
 const t=new Table({players:roster()},{});for(const i of [5,12,14,28,35]){t.game.s.props[i].owner=0;t.game.s.props[i].mortgaged=true;}
 for(const i of [5,12,14,28])t.commit(0,pick(t,0,'unmortgage:'+i));assert.equal(t.policy.context(t.game,0).financeThisTurn.length,MAX_FINANCE_ACTIONS);assert.equal(t.choices(0).some(a=>a.id==='unmortgage:35'),false);assert.ok(t.choices(0).some(a=>a.id==='roll'));t.dispose();
});
test('the $90 Pebble Lane sale prices the opponent complete district and is refused by AI safeguards',()=>{
 const g=brown(),t=trade(),r=S.tradeReport(g,t),policy=new StrategyPolicy();assert.equal(r.estimatedGain[0],30);assert.ok(r.strategicGain[0]<0);assert.equal(r.newCompleteSets[0].name,'ChatGPT');assert.equal(r.newCompleteSets[0].canStartBuilding,true);assert.equal(r.newCompleteSets[0].threeHousesEachCost,300);assert.equal(r.newCompleteSets[0].combinedThreeHouseRent,270);
 assert.match(policy.tradeReason(g,t,0),/without enough compensation/);const view=S.tradePerspective(g,t,0);assert.equal(view.you.name,'Ollama');assert.equal(view.you.give[0].name,'Pebble Lane');assert.deepEqual(view.you.newCompleteSets,[]);assert.equal(view.opponent.newCompleteSets[0].name,'ChatGPT');
 const actions=policy.filter(g,0,S.legalActions(g,0,{offer:t}),{offer:t});assert.equal(actions.some(a=>a.id==='accept'),false);assert.ok(actions.some(a=>a.id==='reject'));assert.ok(actions.some(a=>a.id==='counter'));
});
test('adequate compensation and reciprocal complete districts can still make sense',()=>{
 const g=brown(),policy=new StrategyPolicy();assert.equal(policy.tradeReason(g,trade({giveCash:260}),0),'');
 g.s.props[6].owner=0;g.s.props[8].owner=0;g.s.props[9].owner=1;
 const mutual=trade({give:[9],giveCash:0}),r=S.tradeReport(g,mutual);assert.deepEqual(r.newCompleteSets.map(m=>m.group).sort(),['brown','sky']);assert.equal(policy.tradeReason(g,mutual,0),'');
});
test('a genuine unpayable debt permits a last-chance complete district concession',()=>{
 const g=brown(),policy=new StrategyPolicy();g.s.players[0].cash=0;g.s.controllers[0].type='ollama';g.queue(0,2,90,'Rent');g.processPayments();assert.equal(g.s.phase,'debt');assert.equal(policy.tradeReason(g,trade(),0),'');
 const raw=S.legalActions(g,0,{offer:trade()}),choices=policy.filter(g,0,raw,{offer:trade()});assert.ok(choices.some(a=>a.id==='accept'));
});
test('a cheap district trade cannot bypass safeguards through a custom offer or direct commit',()=>{
 const g=brown(),session=new AgentSession(0,{type:'ollama',model:'test'},{forget(){}}),policy=new StrategyPolicy(),custom={from:0,to:1,give:[1],take:[],giveCash:0,takeCash:90};
 const actions=S.legalActions(g,0),result=session.analysis(g,{tool:'trade',proposal:custom},actions,{validateTrade:t=>policy.tradeReason(g,t,0,{initial:true})});assert.match(result.error,/district/);assert.equal(actions.some(a=>a.id.startsWith('custom:')),false);
 const t=new Table({players:roster()},{});t.game=g;t.offer=trade();assert.throws(()=>t.commit(0,{id:'accept',trade:t.offer}),/district/);assert.equal(g.s.props[1].owner,0);assert.equal(g.s.players[0].cash,1500);t.dispose();
});
test('manual human decisions retain the full rules-legal trade choices',()=>{
 const players=roster();players[0].type='human';const t=new Table({players},{});t.game.s.props[1].owner=0;t.game.s.props[3].owner=1;t.offer=trade();assert.ok(t.choices(0).some(a=>a.id==='accept'));
 t.human({revision:0,action:'accept'});assert.equal(t.game.s.props[1].owner,1);assert.equal(t.game.s.players[0].cash,1590);t.dispose();
});
test('pair negotiation frequency and rejection cooldown persist and expire by round',()=>{
 const g=brown(),p=new StrategyPolicy();assert.equal(p.canInitiate(g,0,1),true);
 p.state.proposers[0]=1;p.state.pairs['0:1']={round:1,outcome:'rejected'};assert.equal(p.canInitiate(g,0,2),false);assert.equal(p.canInitiate(g,1,0),false);
 const restored=new StrategyPolicy(p.save());g.s.round=2;assert.equal(restored.canInitiate(g,1,0),false);assert.equal(restored.canInitiate(g,0,2),true);g.s.round=3;assert.equal(restored.canInitiate(g,1,0),true);
});
test('each bot gets one counteroffer, including custom proposals',()=>{
 const g=brown(),offer={...trade({giveCash:260}),depth:2,counterSeats:[0,1]};assert.equal(S.legalActions(g,0,{offer}).some(a=>a.id==='counter'),false);
 const session=new AgentSession(0,{type:'ollama',model:'test'},{forget(){}});const result=session.analysis(g,{tool:'trade',proposal:{to:1,give:[1],take:[],giveCash:0,takeCash:300}},[],{offer});assert.ok(result.error);
});
test('routine random swaps are omitted; generated district quotes consider both players',()=>{
 const g=new Game({players:roster()});g.s.props[1].owner=0;g.s.props[11].owner=1;assert.equal(S.legalActions(g,0).filter(a=>a.trade).length,0);
 const close=brown();close.s.turn=1;const offers=S.legalActions(close,1).filter(a=>a.trade?.take.includes(1)).map(a=>({...a.trade,report:S.tradeReport(close,a.trade)}));assert.ok(offers.length);assert.ok(offers.every(t=>t.giveCash>90));assert.ok(offers.every(t=>t.report.strategicGain[0]>=-25));assert.ok(offers.every(t=>t.report.newCompleteSets.some(m=>m.seat===1)));
});
test('AI receives named identity, own-perspective offer evaluation and cached strategy advice',async()=>{
 const g=brown();let input;const provider={async complete(r){input=JSON.parse(r.text);return{text:JSON.stringify({type:'act',actionId:'reject',tool:'',actionIds:[],proposal:null,memory:'Keep the brown blocker.',rationale:'The rival gains a rent-reason.',say:'I need a higher price.'})};},forget(){}};
 const policy=new StrategyPolicy(),offer=trade(),actions=policy.filter(g,0,S.legalActions(g,0,{offer}),{offer});await new AgentSession(0,{type:'ollama',model:'test'},provider).decide(g,actions,{offer,strategy:policy.context(g,0)});
 assert.equal(input.you.name,'Ollama');assert.equal(input.offerPerspective.opponent.name,'ChatGPT');assert.deepEqual(input.offerPerspective.you.newCompleteSets,[]);assert.ok(input.strategy.funding);
});
test('last-chance debt rescue offers remain available in generated candidates',()=>{
 const g=brown();g.s.controllers[0].type='ollama';g.s.players[0].cash=0;g.queue(0,2,90,'Rent');g.processPayments();
 const actions=new StrategyPolicy().filter(g,0,S.legalActions(g,0));assert.ok(actions.some(a=>a.trade&&a.trade.takeCash>=90));
});
test('same-color swaps do not receive a phantom set-completion bonus',()=>{
 const g=brown(),offer=trade({give:[3],giveCash:0}),r=S.tradeReport(g,offer);assert.deepEqual(r.newCompleteSets,[]);assert.equal(r.estimatedGain[0],0);assert.equal(r.estimatedGain[1],0);assert.equal(r.meaningfulFor[0],false);assert.equal(r.meaningfulFor[1],false);
});
test('building and selling the same set cannot become a substitute management loop',()=>{
 const t=new Table({players:roster()},{});t.game.s.props[1].owner=0;t.game.s.props[3].owner=0;
 t.commit(0,pick(t,0,'build:1'));assert.equal(t.choices(0).some(a=>a.id==='sell:1'),false);assert.throws(()=>t.commit(0,{id:'sell:1',property:1}),/lose half/);
 t.game.s.controllers[0].type='ollama';t.game.queue(0,1,t.game.s.players[0].cash+10,'New debt');t.game.processPayments();assert.ok(t.choices(0).some(a=>a.id==='sell:1'));t.dispose();
});
test('a model that always prefers mortgage churn receives no such actions when cash is healthy',async()=>{
 let calls=0;const provider={async complete(r){calls++;const input=JSON.parse(r.text),a=input.actions.find(a=>a.id.startsWith('mortgage:')||a.id.startsWith('unmortgage:'))||input.actions.find(a=>a.id==='roll');return{text:JSON.stringify({type:'act',actionId:a.id,tool:'',actionIds:[],proposal:null,memory:'',rationale:'',say:''})};},forget(){}};
 const players=roster();players[0]={type:'ollama',model:'test',name:'Ollama'};const t=new Table({players,seed:78},{ollama:provider});t.game.s.props[5].owner=0;t.game.s.props[12].owner=0;
 await t.step();assert.equal(calls,0);assert.equal(t.game.s.props[5].mortgaged,false);assert.equal(t.game.s.props[12].mortgaged,false);assert.equal(t.revision,1);t.dispose();
});
