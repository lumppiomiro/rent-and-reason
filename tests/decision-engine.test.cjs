'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Game}=require('../engine.js'),S=require('../ai/strategy.cjs'),Social=require('../ai/social.cjs'),Plans=require('../ai/plans.cjs');
const {Table}=require('../ai/table.cjs'),{AgentSession,schema,parse,contextBudget}=require('../ai/session.cjs'),{AuditJournal}=require('../ai/audit.cjs');
const {createHost}=require('../server.cjs');
const players=()=>[{type:'ollama',model:'test',name:'Ollama'},{type:'heuristic',name:'Rival'}];
const answer=(actionId,extra={})=>JSON.stringify({type:'act',actionId,tool:'',actionIds:[],proposal:null,memory:'Preserve liquidity; develop complete sets.',rationale:'Follow the verified plan.',say:'',facts:[],...extra});
const game=()=>new Game({players:players()});
const own=(g,ids,id=0,mortgaged=false)=>ids.forEach(n=>Object.assign(g.s.props[n],{owner:id,mortgaged}));
test('the reported own-rent, landing-before-building, and States/orange mistakes are rejected',()=>{
 const g=game();own(g,[37,39]);
 for(const claim of ['Un-mortgaging the Blue set leaves me dangerously exposed if I land on Moonwake Point or Lantern Summit.','Fern Terrace connects to Orange set owned by ChatGPT.','I need to land on Moonwake Point or Lantern Summit before I can build.'])assert.ok(Social.factError(claim,g,{seat:0}),claim);
 for(const claim of ['I never pay rent on Moonwake Point.','My rival risks landing on Moonwake Point.','I want to develop blue after collecting my Harbor Gate salary.'])assert.equal(Social.factError(claim,g,{seat:0}),'',claim);
 const facts=Social.grounding(g,0,{question:'Moonwake Point and Fern Terrace'}).properties;
 assert.equal(facts.find(p=>p.id===37).rentYouPayHere,0);assert.equal(facts.find(p=>p.id===13).group,'pink');assert.equal(facts.find(p=>p.id===37).buildingRequiresLanding,false);
 const correct={property:37,owner:0,group:'blue',mortgaged:false,rentYouPayHere:0,buildingRequiresLanding:false};
 assert.equal(Social.validateFacts([correct],g,0),'');assert.match(Social.validateFacts([{...correct,rentYouPayHere:35}],g,0),/rentYouPayHere/);
 assert.ok(!Social.cleanPlan('Wait to land on Moonwake Point before I can build. Preserve liquidity.',g,0).includes('Wait'));
});
test('a stable output schema retains strict host validation and repairs false structured claims',async()=>{
 assert.deepEqual(schema([{id:'roll'}]),schema([{id:'buy'},{id:'mortgage:5'}]));
 assert.throws(()=>parse(answer('invented'),[{id:'roll'}]),/not a legal action/);
 const g=game();own(g,[37]);let calls=0;const records=[];
 const p={forget(){},async complete(){return{text:answer('roll',{facts:calls++===0?[{property:37,owner:1,group:'blue',mortgaged:false,rentYouPayHere:35,buildingRequiresLanding:false}]:[]}),usage:{input:100,output:10}};}};
 const session=new AgentSession(0,players()[0],p);await session.decide(g,[{id:'roll'}],{audit:(type,data)=>records.push({type,data})});
 assert.equal(calls,2);assert.ok(records.some(r=>r.type==='validationError'&&r.data.error.includes('owner')));
});
test('a near-bankrupt isolated purchase is blocked for AI but remains a human choice',()=>{
 const t=new Table({players:players()},{});t.game.s.phase='buy';t.game.s.purchase=13;t.game.s.players[0].cash=150;own(t.game,[37,39],0,true);
 assert.ok(!t.choices(0).some(a=>a.id==='buy'));assert.ok(!t.choices(0).some(a=>a.id==='plan:purchase'));
 assert.throws(()=>t.commit(0,{id:'buy'}),/insufficient cash/);
 t.options.players[0].type='human';assert.ok(t.choices(0).some(a=>a.id==='buy'));t.dispose();
});
test('a funded purchase buys then mortgages only unrelated assets to restore its reserve',()=>{
 const g=game();g.s.phase='buy';g.s.purchase=13;g.s.players[0].cash=150;own(g,[5,12,15]);const plan=Plans.quote(g,0,{kind:'purchase',reserve:150});
 assert.ok(plan);assert.equal(plan.steps[0].kind,'buy');assert.ok(plan.steps.slice(1).every(s=>s.kind==='mortgage'&&s.property!==13));
 Plans.execute(g,0,plan);assert.equal(g.s.props[13].owner,0);assert.equal(g.s.props[13].mortgaged,false);assert.ok(g.s.players[0].cash>=150);Game.validate(g.s);
});
test('a whole blue project can fund both mortgages and construction without landing there',()=>{
 const t=new Table({players:players()},{}),g=t.game;g.s.players[0].cash=700;own(g,[37,39],0,true);own(g,[5,15,25,35]);
 const a=t.choices(0).find(a=>a.plan?.spec.group==='blue'&&a.plan.spec.target===1);assert.ok(a);assert.equal(a.plan.steps.filter(s=>s.kind==='unmortgage').length,2);
 const pos=g.player.pos;t.commit(0,a);assert.equal(g.s.props[37].level,1);assert.equal(g.s.props[39].level,1);assert.equal(g.player.pos,pos);assert.ok(g.player.cash>=a.plan.reserve);Game.validate(g.s);t.dispose();
});
test('the twelve-workshop yellow sequence takes one model decision and retains every money event',async()=>{
 let calls=0;const p={forget(){},async complete(r){calls++;const a=JSON.parse(r.text).actions.find(a=>a.plan?.spec.group==='yellow'&&a.plan.spec.target===4);return{text:answer(a.id),usage:{input:100,output:20}};}};
 const t=new Table({players:players()},{ollama:p});own(t.game,[26,27,29]);t.game.s.props[27].mortgaged=true;t.game.s.players[0].cash=2357;
 await t.step();assert.equal(t.error,null);assert.equal(calls,1);for(const n of [26,27,29])assert.equal(t.game.s.props[n].level,4);
 assert.equal(t.game.player.cash,414);assert.equal(t.game.s.workshops,20);assert.equal(t.game.events.filter(e=>e.type==='money').length,13);Game.validate(t.game.s);t.dispose();
});
test('stale, tampered, resource-starved, and debt-phase plans cannot partially execute',()=>{
 const g=game();own(g,[26,27,29]);g.player.cash=3000;const plan=Plans.quote(g,0,{kind:'develop',group:'yellow',target:4,reserve:400});assert.ok(plan);
 g.player.cash--;let before=JSON.stringify(g.s);assert.throws(()=>Plans.execute(g,0,plan),/stale/);assert.equal(JSON.stringify(g.s),before);g.player.cash++;
 const tampered=structuredClone(plan);tampered.steps[0].property=39;before=JSON.stringify(g.s);assert.throws(()=>Plans.execute(g,0,tampered),/constraints/);assert.equal(JSON.stringify(g.s),before);
 for(const [ids,level]of [[[1,3,6,8,9],4],[[11,13,14],3],[[16],1]])for(const n of ids)Object.assign(g.s.props[n],{owner:1,level});g.s.workshops=2;assert.equal(Plans.quote(g,0,{kind:'develop',group:'yellow',target:4,reserve:400}),null);
 g.s.phase='debt';g.s.debt={from:0};assert.equal(Plans.quote(g,0,{kind:'develop',group:'yellow',target:1,reserve:150}),null);
});
test('project actions cannot bypass same-turn building and mortgage reversal safeguards',()=>{
 const t=new Table({players:players()},{}),g=t.game;own(g,[37,39],0,true);g.player.cash=2000;
 const a=t.choices(0).find(a=>a.plan?.spec.group==='blue');assert.ok(a);t.policy.state.finance.push({seat:0,property:37,kind:'mortgage'});
 assert.throws(()=>t.commit(0,a),/reversal/);assert.equal(g.s.props[37].mortgaged,true);t.dispose();
});
test('trade analysis identifies cash that develops an existing opponent complete district',()=>{
 const g=game();own(g,[16,18,19,13]);g.player.cash=150;const r=S.tradeReport(g,{from:0,to:1,give:[13],take:[],giveCash:0,takeCash:550});
 assert.equal(r.newCompleteSets.length,0);assert.ok(r.financingPremium[0]>0);assert.match(r.warning,/EXISTING/);assert.equal(r.development[0].before[0].affordableBuildings,0);assert.ok(r.development[0].after[0].affordableBuildings>0);
});
test('context budgets keep stable rules separate and do not reset every two decisions',async()=>{
 const p={forget(){},async complete(){return{text:answer('roll'),usage:{input:100,output:10}};}},g=game(),s=new AgentSession(0,players()[0],p);
 for(let i=0;i<6;i++)await s.decide(g,[{id:'roll'},{id:'end'}],{});
 assert.equal(s.metrics.compactions,0);assert.equal(s.age,6);
 const b=contextBudget([{role:'system',content:'x'.repeat(10000)},{role:'user',content:'abc'}],'x'.repeat(10000),'abc',true);assert.equal(b.dynamic,9);assert.ok(b.stable>3000);
 s.age=24;await s.decide(g,[{id:'roll'}],{});assert.equal(s.metrics.compactions,1);
});
test('an insufficient automatic debt liquidation explicitly reports bankruptcy',()=>{
 const g=game();g.player.cash=52;own(g,[13],0,true);g.queue(0,null,100,'Luxury Tax');g.processPayments();const a=S.legalActions(g,0).find(a=>a.id==='raise');assert.equal(a.cashAfterLiquidation,52);assert.equal(a.shortfall,48);assert.equal(a.wouldBankrupt,true);assert.match(a.label,/INSUFFICIENT/);
});
test('the on-disk audit survives the 100-entry UI tail and stays outside public/model context',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rent-reason-audit-test-'));let t;try{
  const journal=new AuditJournal(dir);let saved;t=new Table({players:[{type:'human'},{type:'heuristic'}]}, {},{audit:e=>journal.append(e),persist:d=>saved=d});
  for(let i=0;i<120;i++){t.game.s.phase='end';t.commit(t.game.s.turn,{id:'end'},{rationale:'Advance the turn.'});}
  const entries=fs.readFileSync(journal.file(t.id),'utf8').trim().split('\n').map(JSON.parse);assert.equal(entries.filter(e=>e.type==='actionComplete').length,120);assert.equal(t.decisions.length,100);assert.ok(saved.audit);assert.ok(!JSON.stringify(t.status()).includes('sourceVersion'));
  assert.ok(!JSON.stringify(entries).includes('"decks"'));assert.ok(!JSON.stringify(entries).includes('"seed"'));assert.equal(fs.statSync(journal.file(t.id)).mode&0o777,0o600);
  assert.ok(journal.file('../unsafe').startsWith(journal.dir+path.sep));
 }finally{t?.dispose();fs.rmSync(dir,{recursive:true,force:true});}
});
test('the audit endpoint is capability protected and streams exact trade and tool records',async t=>{
 let calls=0;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rent-reason-journal-host-')),p={list:async()=>[{id:'test'}],forget(){},close(){},async complete(){return{text:++calls===1?answer('',{type:'analyze',tool:'risk'}):answer('reject'),usage:{input:100,output:10}};}};
 const host=createHost({dataDir:dir,providers:{ollama:p,codex:p,claude:p}});await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>{host.server.close(resolve);host.server.closeAllConnections();});fs.rmSync(dir,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+host.server.address().port,info=await(await fetch(url+'/api/info')).json(),headers={'X-Rent-Reason-Token':info.token,'Content-Type':'application/json'};
 await fetch(url+'/api/table',{method:'POST',headers,body:JSON.stringify({players:[{type:'human'},{type:'ollama',model:'test'}]})});
 own(host.table.game,[1],0);own(host.table.game,[13],1);host.table.human({revision:0,action:'propose',trade:{from:0,to:1,give:[1],take:[13],giveCash:100,takeCash:0}});await host.table.step();
 assert.equal((await fetch(url+'/api/audit')).status,403);const result=await fetch(url+'/api/audit',{headers});assert.equal(result.status,200);assert.match(result.headers.get('content-type'),/ndjson/);const records=(await result.text()).trim().split('\n').map(JSON.parse);assert.equal(records[0].type,'sessionStart');assert.equal(records[0].data.coverageFromRevision,0);assert.ok(records.some(r=>r.type==='analysis'&&r.data.tool==='risk'));assert.ok(records.some(r=>r.type==='actionStart'&&r.data.action.trade?.give[0]===1));assert.ok(records.some(r=>r.type==='decisionStart'&&r.data.blocked.length>0));assert.equal(JSON.stringify(records).includes(info.token),false);
});
