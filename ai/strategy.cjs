'use strict';
const {Game,CHANCE,CHEST}=require('../engine.js');
const Plans=require('./plans.cjs');
const Economy=require('../economy.js');
const Negotiation=require('./negotiation.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function publicState(g){
 const s=clone(g.s);delete s.seed;delete s.decks;
 // Draw order, PRNG state and other agents' working notes never leave the host.
 return s;
}
function actor(g,offer){return offer?offer.to:g.s.phase==='over'?null:g.s.phase==='auction'?g.s.auction.cursor:g.manager;}
function value(g,id,owner){
 const b=g.board[id],p=g.s.props[id],set=g.group(b.group),n=set.filter(x=>x.id!==id&&g.s.props[x.id].owner===owner).length;
 return Math.round(b.price*(p.mortgaged?.5:1)+(b.type==='street'?(n===set.length-1?b.price*1.3:n*b.price*.23):b.type==='rail'?n*65:n*35));
}
function risk(g,id){
 const p=g.s.players[id],landings=[];
 for(let a=1;a<=6;a++)for(let b=1;b<=6;b++){
  let at=(p.pos+a+b)%40;if(at===30)at=10;
  const pr=g.s.props[at],amount=pr.owner!==null&&pr.owner!==id?g.rent(at,a+b):g.board[at].type==='tax'?g.board[at].amount:0;
  landings.push({at,amount});
 }
 const max=Math.max(0,...landings.map(x=>x.amount));
 const mean=landings.reduce((n,x)=>n+x.amount,0)/36;
 const danger=g.board.filter(b=>b.price&&g.s.props[b.id].owner!==null&&g.s.props[b.id].owner!==id).map(b=>({id:b.id,rent:g.rent(b.id,7)})).sort((a,b)=>b.rent-a.rent).slice(0,5);
 return{cash:p.cash,expectedNextRollCost:Math.round(mean),worstNextRollCost:max,probabilityCostExceedsCash:landings.filter(x=>x.amount>p.cash).length/36,recommendedReserve:Math.round(Math.max(150,mean*3,Math.min(max,600))),investmentReserve:Math.round(Math.max(150,mean*1.5)),danger,ownPropertyRentDue:0,buildingRequiresLanding:false,approximation:'36 dice outcomes; card movement, extra rolls and Permit Review stay decisions omitted. Own property never charges rent. Danger lists opponents only. The lower investment reserve is a deliberate risk option for a fully quoted project.'};
}
function sets(g,id,props=g.s.props){
 const groups=[...new Set(g.board.filter(b=>b.workshop).map(b=>b.group))];
 return groups.map(group=>{const all=g.group(group),owned=all.filter(b=>props[b.id].owner===id);return{group,owned:owned.length,total:all.length,complete:owned.length===all.length,mortgaged:owned.filter(b=>props[b.id].mortgaged).length};}).filter(x=>x.owned);
}
function funding(g,id){
 const reserve=risk(g,id).recommendedReserve;
 if(g.s.phase==='debt'&&g.s.debt.from===id)return{reserve,target:g.s.debt.amount,purpose:'Pay the outstanding debt.'};
 const projects=g.own(id).filter(b=>b.workshop&&g.completeSet(id,b.group)&&g.s.props[b.id].level<5&&g.group(b.group).every(x=>!g.s.props[x.id].mortgaged)&&g.group(b.group).every(x=>g.s.props[x.id].level>=g.s.props[b.id].level)&&(g.s.props[b.id].level===4?g.s.landmarks:g.s.workshops)>0).map(b=>b.workshop);
 const build=projects.length?Math.min(...projects):0;
 return{reserve,target:reserve+build,purpose:build?'Keep a reserve and fund the next legal building.':'Maintain a risk-adjusted cash reserve.'};
}
function portfolioValue(g,id,props=g.s.props){
 const owned=g.board.filter(b=>b.price&&props[b.id].owner===id);
 let amount=owned.reduce((n,b)=>n+b.price*(props[b.id].mortgaged?.5:1),0);
 for(const group of new Set(owned.filter(b=>b.workshop).map(b=>b.group))){
  const streets=owned.filter(b=>b.group===group),cost=streets.reduce((n,b)=>n+b.price,0);
  amount+=cost*(streets.length===g.group(group).length?.65:(streets.length-1)*.115);
 }
 const rails=owned.filter(b=>b.type==='rail').length,utilities=owned.filter(b=>b.type==='utility').length;
 return Math.round(amount+rails*(rails-1)/2*65+(utilities===2?35:0));
}
function developmentCapacity(g,id,props,cash){
 // Compare every already-owned district too: cash can arm an existing rival set.
 const groups=[];
 for(const group of sets(g,id,props).filter(s=>s.complete).map(s=>s.group)){
  const streets=g.group(group),levels=streets.map(b=>props[b.id].level),release=streets.reduce((n,b)=>n+(props[b.id].mortgaged?Math.ceil(b.price*11/20):0),0);
  let budget=Math.max(0,cash-150-release),workshops=g.s.workshops,spent=0;
  while(budget>=streets[0].workshop&&workshops>0&&levels.some(n=>n<3)){
   const low=Math.min(...levels),index=levels.findIndex(n=>n===low&&n<3);if(index<0)break;levels[index]++;budget-=streets[index].workshop;spent+=streets[index].workshop;workshops--;
  }
  const canActivate=cash>=release+150,rent=canActivate?streets.reduce((n,b,i)=>n+(levels[i]?b.rent[levels[i]]:b.rent[0]*2),0):0;
  groups.push({group,releaseCost:release,affordableBuildings:levels.reduce((n,l,i)=>n+Math.max(0,l-props[streets[i].id].level),0),buildingSpend:spent,combinedRentPotential:rent,assumption:'Each set evaluated separately with a $150 floor and current workshop supply; not all projects can be funded simultaneously.'});
 }return groups;
}
function tradeReport(g,t){
 const {from,to,give,take,giveCash,takeCash}=t;
 const fee=ids=>ids.reduce((n,id)=>n+(g.s.props[id].mortgaged?Math.ceil(g.board[id].price/20):0),0);
 const after=g.s.props.map(p=>({...p}));give.forEach(i=>after[i].owner=to);take.forEach(i=>after[i].owner=from);
 const cashAfter={[from]:g.s.players[from].cash-giveCash+takeCash-fee(take),[to]:g.s.players[to].cash+giveCash-takeCash-fee(give)};
 const changes=owner=>{const before=sets(g,owner),later=sets(g,owner,after);return{completedBefore:before.filter(x=>x.complete).map(x=>x.group),completedAfter:later.filter(x=>x.complete).map(x=>x.group),colorCounts:[...new Set([...give,...take].filter(i=>g.board[i].workshop).map(i=>g.board[i].group))].map(group=>({group,before:before.find(x=>x.group===group)?.owned||0,after:later.find(x=>x.group===group)?.owned||0,total:g.group(group).length}))};};
 const setChanges={[from]:changes(from),[to]:changes(to)},newCompleteSets=[];
 for(const seat of [from,to])for(const group of setChanges[seat].completedAfter.filter(x=>!setChanges[seat].completedBefore.includes(x))){
  const streets=g.group(group),buildingCost=streets.reduce((n,b)=>n+b.workshop*3,0),threeHouseRent=streets.reduce((n,b)=>n+b.rent[3],0);
  const releaseCost=streets.reduce((n,b)=>n+(after[b.id].mortgaged?Math.ceil(b.price*11/20):0),0);
  const canStartBuilding=g.s.workshops>0&&cashAfter[seat]-releaseCost>=streets[0].workshop+150;
  const premium=Math.round(Math.max(100,streets.reduce((n,b)=>n+b.price,0)*.5,buildingCost*.5,threeHouseRent*.2)*(canStartBuilding?1:.65));
  newCompleteSets.push({seat,name:g.s.players[seat].name,group,properties:streets.map(b=>b.name),canStartBuilding,threeHousesEachCost:buildingCost,combinedThreeHouseRent:threeHouseRent,strategicPremium:premium});
 }
 // Value the entire transaction simultaneously. Per-deed marginal valuations
 // count a street we are giving away as a future complement to one we receive.
 const estimatedGain={[from]:portfolioValue(g,from,after)-portfolioValue(g,from)+takeCash-giveCash-fee(take),[to]:portfolioValue(g,to,after)-portfolioValue(g,to)+giveCash-takeCash-fee(give)};
 const strategicGain={},meaningfulFor={},development={},financingPremium={};
 for(const seat of [from,to]){
  const before=developmentCapacity(g,seat,g.s.props,g.s.players[seat].cash),later=developmentCapacity(g,seat,after,cashAfter[seat]);
  development[seat]={before,after:later};
  // New-set development is already priced above; add only newly funded existing sets.
  financingPremium[seat]=Math.round(later.filter(x=>before.some(y=>y.group===x.group)).reduce((n,x)=>n+Math.max(0,x.combinedRentPotential-before.find(y=>y.group===x.group).combinedRentPotential)*.2,0));
 }
 for(const seat of [from,to]){
  const other=seat===from?to:from,received=seat===from?take:give;
  const ownBonus=newCompleteSets.filter(m=>m.seat===seat).reduce((n,m)=>n+m.strategicPremium,0),rivalBonus=newCompleteSets.filter(m=>m.seat===other).reduce((n,m)=>n+m.strategicPremium,0);
  strategicGain[seat]=estimatedGain[seat]+ownBonus-rivalBonus+financingPremium[seat]-financingPremium[other];
  const progress=setChanges[seat].colorCounts.some(c=>c.after>c.before&&c.after>=2)||['rail','utility'].some(group=>received.some(i=>g.board[i].group===group)&&after.filter((p,i)=>g.board[i].group===group&&p.owner===seat).length>=2);
  const financing=cashAfter[seat]>g.s.players[seat].cash&&g.s.players[seat].cash<funding(g,seat).target;
  meaningfulFor[seat]=progress||ownBonus>0||financing||strategicGain[seat]>=25||(rivalBonus>0&&strategicGain[seat]>=0);
 }
 return{from,to,parties:{[from]:g.s.players[from].name,[to]:g.s.players[to].name},sets:setChanges,newCompleteSets,estimatedGain,strategicGain,meaningfulFor,cashAfter,development,financingPremium,warning:[...newCompleteSets.map(m=>`${m.name} (seat ${m.seat}) gains the ${m.group} district, including the right to build. The premium over deed price must compensate the OTHER player.`),...[from,to].filter(i=>financingPremium[i]>0).map(i=>`This cash can finance ${g.s.players[i].name}'s EXISTING complete districts; estimated development premium $${financingPremium[i]}.`)].join(' '),assumption:'Heuristic values and district development / denial premiums; estimates, not market prices or guaranteed returns. Mortgages, transfer interest and available building cash included.'};
}
function tradePerspective(g,t,id,report=tradeReport(g,t)){
 const own=id===t.from,other=own?t.to:t.from;
 return{you:{seat:id,name:g.s.players[id].name,give:(own?t.give:t.take).map(i=>({id:i,name:g.board[i].name,group:g.board[i].group})),receive:(own?t.take:t.give).map(i=>({id:i,name:g.board[i].name,group:g.board[i].group})),cashPaid:own?t.giveCash:t.takeCash,cashReceived:own?t.takeCash:t.giveCash,cashAfter:report.cashAfter[id],newCompleteSets:report.newCompleteSets.filter(m=>m.seat===id).map(m=>m.group),estimatedStrategicGain:report.strategicGain[id]},opponent:{seat:other,name:g.s.players[other].name,newCompleteSets:report.newCompleteSets.filter(m=>m.seat===other)},warning:report.warning};
}
function trades(g,id,onlyTo=null){
 const out=[],tradable=owner=>g.own(owner).filter(b=>b.type!=='street'||g.group(b.group).every(x=>!g.s.props[x.id].level));
 for(const q of g.active){if(q.id===id||onlyTo!==null&&q.id!==onlyTo)continue;
  for(const b of tradable(q.id).sort((a,b)=>value(g,b.id,id)-b.price-(value(g,a.id,id)-a.price)).slice(0,3)){
   for(const factor of [1,1.45]){const amount=Math.round(b.price*factor/10)*10;out.push({from:id,to:q.id,give:[],take:[b.id],giveCash:amount,takeCash:0});}
   for(const a of tradable(id).sort((a,b)=>value(g,b.id,q.id)-value(g,b.id,id)-(value(g,a.id,q.id)-value(g,a.id,id))).slice(0,2)){
    const diff=Math.round((b.price-a.price)/10)*10;
    out.push({from:id,to:q.id,give:[a.id],take:[b.id],giveCash:Math.max(0,diff),takeCash:Math.max(0,-diff)});
   }
  }
  if(g.s.phase==='debt')for(const b of tradable(id).slice(0,4))for(const price of new Set([Math.round(b.price*.8),Math.max(Math.round(b.price*.8),Math.min(g.s.debt.amount-g.s.players[id].cash,Math.round(b.price*1.5)))]))out.push({from:id,to:q.id,give:[b.id],take:[],giveCash:0,takeCash:price});
 }
 const bankCash=g.s.players[id].cash+g.own(id).reduce((n,b)=>n+(g.s.props[b.id].mortgaged?0:b.price/2)+g.s.props[b.id].level*(b.workshop||0)/2,0);
 const rescue=g.s.phase==='debt'&&g.s.debt.from===id&&bankCash<g.s.debt.amount;
 const unique=new Map();
 for(const original of out){
  let t={...original};
  // Quote a price that accounts for the other player's complete district concession too.
  // This reduces predictable rejected offers and their extra inference calls.
  for(let attempt=0;attempt<3;attempt++){
   if(g.validateTrade(t.from,t.to,t.give,t.take,t.giveCash,t.takeCash))break;
   const report=tradeReport(g,t),shortfall=Math.max(0,-report.strategicGain[t.to]);
   if(shortfall>25&&attempt<2){const net=t.giveCash-t.takeCash+Math.ceil(shortfall/10)*10;t={...t,giveCash:Math.max(0,net),takeCash:Math.max(0,-net)};continue;}
   if(report.meaningfulFor[id]&&(report.strategicGain[id]>=0||(rescue&&report.cashAfter[id]>g.s.players[id].cash))&&report.strategicGain[t.to]>=-25){const key=JSON.stringify([t.from,t.to,t.give,t.take,t.giveCash,t.takeCash]);unique.set(key,{...t,report});}
   break;
  }
 }
 return[...unique.values()].sort((a,b)=>b.report.strategicGain[id]-a.report.strategicGain[id]).slice(0,6);
}
function counterOffers(g,id,offer){
 if(!Negotiation.canCounter(offer,id))return[];
 const base=Negotiation.reversed(offer),original=tradeReport(g,offer),gap=Math.max(10,Math.ceil((30-original.strategicGain[id])/10)*10),net=base.giveCash-base.takeCash-gap;
 const cash={...base,giveCash:Math.max(0,net),takeCash:Math.max(0,-net)},candidates=[cash];
 // Drop one requested concession, or substitute a relevant strategic swap.
 if(base.give.length>1)for(const n of base.give)candidates.push({...base,give:base.give.filter(x=>x!==n)});
 const focus=new Set([...offer.give,...offer.take]);
 candidates.push(...trades(g,id,offer.from).filter(t=>t.to===offer.from&&[...t.give,...t.take].some(n=>focus.has(n))));
 const unique=new Map();for(const t of candidates){if(g.validateTrade(t.from,t.to,t.give,t.take,t.giveCash,t.takeCash)||Negotiation.sameTerms(t,base))continue;const report=tradeReport(g,t);if(report.strategicGain[id]<0||!report.meaningfulFor[id])continue;
  const clean={from:t.from,to:t.to,give:t.give,take:t.take,giveCash:t.giveCash,takeCash:t.takeCash},key=JSON.stringify([clean.give.slice().sort(),clean.take.slice().sort(),clean.giveCash-clean.takeCash]);if(!unique.has(key))unique.set(key,clean);
 }return[...unique.values()].slice(0,3);
}
function auctionAdvice(g,id){return Economy.auction(g,id,{value:value(g,g.s.auction.id,id),reserve:risk(g,id).recommendedReserve});}
function legalActions(g,id,{offer=null,allowTrade=true}={}){
 const s=g.s,p=s.players[id],out=[];let debtPlan=null;
 const add=(key,label,score,data={})=>out.push({id:key,label:require('../boards.js').moneyText(label,g.s),score,...data});
 if(offer){
  add('reject','Decline this trade',0);if(!g.validateTrade(offer.from,offer.to,offer.give,offer.take,offer.giveCash,offer.takeCash))add('accept','Accept this trade',tradeReport(g,offer).strategicGain[id],{trade:offer,perspective:tradePerspective(g,offer,id)});
  // Reprice the same deal first; a few relevant deed alternatives give smaller
  // models a real counter without requiring a separate proposal-analysis call.
  for(const [i,t]of counterOffers(g,id,offer).entries()){
   const report=tradeReport(g,t),give=t.give.map(n=>g.board[n].name).join(', ')||'no deeds',take=t.take.map(n=>g.board[n].name).join(', ')||'no deeds';
   add(i?'counter:'+i:'counter',`Counteroffer: give ${give} + $${t.giveCash}; receive ${take} + $${t.takeCash}`,Math.min(20,report.strategicGain[id])-10,{trade:t,counter:true,perspective:tradePerspective(g,t,id,report)});
  }return out;
 }
 if(actor(g)!==id||s.phase==='over')return out;if(p.out){if(s.phase==='end')add('end','Advance past the bankrupt player',0);return out;}
 const reserve=risk(g,id).recommendedReserve;
 if(s.phase==='auction'){
  const min=s.auction.bid+1,b=g.board[s.auction.id],v=value(g,b.id,id),advice=auctionAdvice(g,id);
  add('pass','Pass and leave this auction',0);
  const caps=[min,b.price,b.price/2,advice.recommendedCeiling,Math.round(v*.8),v,Math.max(0,p.cash-reserve),p.cash];
  for(const cap of [...new Set(caps)].sort((a,b)=>a-b))if(cap>=min&&cap<=p.cash)add('cap:'+cap,`Authorize bids up to $${cap}; host bids only the next increment`,v-min-Math.abs(cap-advice.recommendedCeiling)*.3-Math.max(0,reserve-(p.cash-cap))*.5,{cap});return out;
 }
 if(s.phase==='buy'){
  const b=g.board[s.purchase],v=value(g,b.id,id);add('decline','Send property to auction',0);
  if(p.cash>=b.price){const after=p.cash-b.price,own=g.group(b.group).filter(x=>g.s.props[x.id].owner===id).length,completesYourSet=b.workshop&&own===g.group(b.group).length-1;
   add('buy',`Buy ${b.name} (${b.group}) for $${b.price}; cash after $${after}`,v-b.price+(after>=reserve?80:-80),{property:b.id,cashDelta:-b.price,cashAfter:after,reserveGap:Math.max(0,reserve-after),completesYourSet:Boolean(completesYourSet),liquidityWarning:after<reserve?'Below reserve; choose a verified funded purchase or a justified set completion.':''});
   if(after<reserve){const plan=Plans.quote(g,id,{kind:'purchase',reserve});if(plan&&plan.steps.length>1)add('plan:purchase','Buy and fund the reserve using the quoted mortgages',v-b.price-20,{plan});}
  }return out;
 }
 if(s.phase==='debt'){
  if(p.cash>=s.debt.amount)add('settle','Pay the outstanding debt',10000);
  {const plan=debtPlan=Economy.liquidation(g,id,s.debt.amount),available=plan.cashAfter;add('raise',`Mortgage first, then sell lower-ROI colour groups toward debt: cash $${available}${plan.shortfall?'; INSUFFICIENT — declares bankruptcy':''}`,plan.shortfall?-50000:60,{cashAfterLiquidation:available,cashRaised:plan.cashRaised,shortfall:plan.shortfall,wouldBankrupt:!!plan.shortfall,liquidation:{mortgages:plan.mortgages,buildingSales:plan.buildingSales,groups:plan.groups,expectedRentLost:plan.expectedRentLost,approximation:plan.approximation}});}
  add('surrender','Declare bankruptcy',-100000);
 }else{
  add(s.phase==='roll'?'roll':'end',s.phase==='roll'?'Roll the dice':'End turn',0);
  if(s.phase==='roll'&&p.inJail){if(p.cards.length)add('jailcard','Use a Get Out of Permit Review card',20);if(p.cash>=require('../boards.js').rules(s).jailFee)add('jailpay',`Pay $${require('../boards.js').rules(s).jailFee} to leave Permit Review`,s.round<12?10:-10);}
 }
 if(['roll','end'].includes(s.phase))for(const plan of Plans.candidates(g,id,risk(g,id)))add(`plan:${plan.spec.group}:${plan.spec.target}:${plan.reserve}`,`Develop ${plan.spec.group} to level ${plan.spec.target}; ${plan.steps.length} verified steps; keep $${plan.cashAfter}`,Math.min(90,plan.rentGain*.12)-plan.borrowed*.01,{plan});
 if(g.canManage(id))for(const b of g.own(id)){
  const pr=s.props[b.id];
  if(s.phase!=='debt'&&b.workshop&&!g.buildReason(b.id,id)){
   const rentGain=b.rent[pr.level+1]-(pr.level?b.rent[pr.level]:b.rent[0]*2);
   add('build:'+b.id,`Build on ${b.name}: $${b.workshop}, level ${pr.level+1}`,p.cash-b.workshop>=reserve?rentGain*.12+5:-50,{property:b.id});
  }
  if(!g.sellReason(b.id,id))add('sell:'+b.id,`Sell one building on ${b.name}`,s.phase==='debt'?(debtPlan?.groups[0]===b.group?25:-10):-60,{property:b.id,group:b.group,preferredDebtGroup:debtPlan?.groups[0]===b.group});
  if(pr.level===5&&g.s.workshops<4)add('sellset:'+b.id,`Liquidate buildings in ${b.group} set`,s.phase==='debt'?15:-100,{property:b.id});
  if(!g.mortgageReason(b.id,id))add('mortgage:'+b.id,`Borrow $${b.price/2} against ${b.name}; rent stops`,s.phase==='debt'?25:(p.cash<reserve?5:-40),{property:b.id,cashDelta:b.price/2,cashAfter:p.cash+b.price/2,costToReverse:Math.ceil(b.price*11/20),interestLostIfReversed:Math.ceil(b.price*11/20)-b.price/2});
  if(s.phase!=='debt'&&pr.mortgaged&&p.cash>=Math.ceil(b.price*11/20))add('unmortgage:'+b.id,`PAY $${Math.ceil(b.price*11/20)} to restore rent on ${b.name}; cash DECREASES`,p.cash-Math.ceil(b.price*11/20)>=reserve?6:-40,{property:b.id,cashDelta:-Math.ceil(b.price*11/20),cashAfter:p.cash-Math.ceil(b.price*11/20),interestCost:Math.ceil(b.price*11/20)-b.price/2});
 }
 if(allowTrade&&g.canManage(id))trades(g,id).forEach((t,i)=>{const {report,...offer}=t;add('trade:'+i,`Offer to ${s.players[t.to].name}: GIVE ${t.give.map(i=>g.board[i].name).join(', ')||'no deed'} + $${t.giveCash}; RECEIVE ${t.take.map(i=>g.board[i].name).join(', ')||'no deed'} + $${t.takeCash}`,Math.min(15,report.strategicGain[id]*.02),{trade:offer,perspective:tradePerspective(g,t,id,report)});});
 return out;
}
function apply(g,id,a){
 if(a.trade)throw Error('Trades must be handled by the table host.');
 if(a.plan)return Plans.execute(g,id,a.plan);
 const key=a.id.split(':')[0],n=a.property;
 switch(key){case'roll':return g.roll();case'end':return g.end();case'buy':return g.buy();case'decline':return g.decline();case'jailcard':return g.releaseJail(true);case'jailpay':return g.releaseJail();case'settle':return g.settle();case'raise':{g.raiseCash(id,g.s.debt.amount);if(g.s.players[id].cash>=g.s.debt.amount)g.settle();else g.surrender(id);return true;}case'surrender':return g.surrender(id);case'build':return g.build(n);case'sell':return g.sell(n,id);case'sellset':return g.sellSet(n,id);case'mortgage':return g.mortgage(n,id);case'unmortgage':return g.unmortgage(n);case'pass':return g.pass();case'cap':return g.bid(Math.min(a.cap,Math.max(1,g.s.auction.bid+10)));default:throw Error('Unknown action.');}
}
// Rollouts use independent random seeds and fresh shuffled decks, never the real future.
function simulate(g,id,actions){
 return actions.slice(0,5).map(a=>{
  let total=0,fail=0;const samples=24;
  for(let k=0;k<samples;k++){
   const copy=Game.load(g.s);copy.s.seed=(0x9e3779b9*(k+1))>>>0||1;
   for(const deck of ['chance','chest'])copy.s.decks[deck]=copy.shuffle((deck==='chance'?CHANCE:CHEST).map((_,i)=>i).filter(i=>!copy.s.players.some(p=>p.cards.some(c=>c.deck===deck&&c.index===i))));
   copy.s.controllers=copy.s.players.map(()=>({type:'heuristic'}));copy.s.players.forEach(p=>p.bot=true);
   try{if(a.trade){copy.executeTrade(a.trade.from,a.trade.to,a.trade.give,a.trade.take,a.trade.giveCash,a.trade.takeCash);}else apply(copy,id,a);
    for(let j=0;j<40&&copy.s.phase!=='over';j++)copy.botStep();
    total+=copy.wealth(id)-Math.max(...copy.s.players.filter(p=>p.id!==id).map(p=>copy.wealth(p.id)));if(copy.s.players[id].out)fail++;
   }catch{fail++;}
  }
  return{actionId:a.id,samples,meanWealthLead:Math.round(total/samples),bankruptcyFraction:fail/samples,assumption:'~40 heuristic actions, sampled independent futures; trades assume acceptance. Comparative estimate, not a guarantee.'};
 });
}
function analyze(g,id,tool,ids,actions){
 const selected=ids.map(key=>actions.find(a=>a.id===key)).filter(Boolean).slice(0,5);
 switch(tool){case'risk':return risk(g,id);case'property':return g.board.filter(b=>b.price).map(b=>({id:b.id,value:value(g,b.id,id),rent:g.rent(b.id,7),owner:g.s.props[b.id].owner,level:g.s.props[b.id].level}));case'trade':return selected.filter(a=>a.trade).map(a=>({actionId:a.id,...tradeReport(g,a.trade)}));case'simulate':return simulate(g,id,selected.length?selected:actions.slice().sort((a,b)=>b.score-a.score).slice(0,3));default:throw Error('Unknown analysis tool.');}
}
module.exports={auctionAdvice,publicState,actor,value,risk,sets,funding,tradeReport,tradePerspective,counterOffers,legalActions,apply,analyze};
