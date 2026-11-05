'use strict';

const S=require('./strategy.cjs');
const Plans=require('./plans.cjs');
const Economy=require('../economy.js');
const {MAX_COUNTERS,counterError}=require('./negotiation.cjs');
const MAX_FINANCE_ACTIONS=4;
const actionKind=a=>a.id.split(':')[0];
// These are AI decision safeguards, not extra RentReason rules. Human players retain
// the engine's complete legal action set. All state survives a host restart.
class StrategyPolicy{
 constructor(saved={}){
  this.state={turn:saved.turn||'',finance:saved.finance||[],development:saved.development||[],proposers:saved.proposers||{},pairs:saved.pairs||{}};
 }
 save(){return JSON.parse(JSON.stringify(this.state));}
 turn(g){const key=`${g.s.round}:${g.s.turn}`;if(this.state.turn!==key){this.state.turn=key;this.state.finance=[];this.state.development=[];}}
 funding(g,id){return S.funding(g,id);}
 pair(from,to){return[from,to].sort((a,b)=>a-b).join(':');}
 canInitiate(g,id,to){
  const emergency=g.s.phase==='debt'&&g.s.debt.from===id&&g.s.players[id].cash<g.s.debt.amount;
  if(!emergency&&this.state.proposers[id]===g.s.round)return false;
  const last=this.state.pairs[this.pair(id,to)];
  // One negotiation per pair per round; rejected pairs sit out the following
  // round too. A real unpaid debt can justify a fresh rescue negotiation.
  return !last||(emergency&&last.round!==g.s.round)||(last.round!==g.s.round&&!(last.outcome==='rejected'&&g.s.round<=last.round+1));
 }
 canPropose(g,id){return g.active.some(p=>p.id!==id&&this.canInitiate(g,id,p.id));}
 tradeReason(g,t,id,{initial=false}={}){
  const error=g.validateTrade(t.from,t.to,t.give,t.take,t.giveCash,t.takeCash);if(error)return error;
  if(initial&&!this.canInitiate(g,id,t.to))return 'Negotiation cooldown: wait for another round before proposing again.';
  const r=S.tradeReport(g,t),other=id===t.from?t.to:t.from;
  const bankCash=g.s.players[id].cash+g.own(id).reduce((n,b)=>n+(g.s.props[b.id].mortgaged?0:b.price/2)+g.s.props[b.id].level*(b.workshop||0)/2,0);
  const emergency=g.s.phase==='debt'&&g.s.debt.from===id&&r.cashAfter[id]>g.s.players[id].cash&&bankCash<g.s.debt.amount;
  // An actual debt rescue may be preferable to bankruptcy. Otherwise completing
  // a rival set requires enough cash / property / our own set to compensate.
  if(!emergency&&r.newCompleteSets.some(m=>m.seat===other)&&r.strategicGain[id]<0)return `This gives ${g.s.players[other].name} a new district without enough compensation: estimated strategic balance $${r.strategicGain[id]}. Ask for more or decline.`;
  if(!emergency&&r.financingPremium[other]>Math.max(50,r.financingPremium[id])&&r.strategicGain[id]<0)return 'This cash finances an existing rival district without enough compensation. Reprice or decline.';
  if(!emergency&&!r.meaningfulFor[id])return 'No material set progress, bargain, funding need or cash profit. Skip this marginal trade.';
  return '';
 }
 actionReason(g,id,a,{offer=null}={}){
  this.turn(g);
  const kind=actionKind(a),p=g.s.players[id];
  if(offer){
   if(kind==='accept')return this.tradeReason(g,offer,id);
   if(kind==='counter'||a.counter){const error=counterError(offer,id,a.trade);return error||this.tradeReason(g,a.trade,id);}
   return '';
  }
  if(g.s.phase==='auction'){const q=S.auctionAdvice(g,id);if(kind==='pass'&&q.minimum<=q.bargainFloor)return 'The bid is below recoverable mortgage value and fits the cash reserve. Authorize a sensible ceiling instead of giving away this bargain.';if(a.cap!==undefined&&a.cap<q.bargainFloor)return 'A ceiling is not an immediate payment. Authorize at least the affordable mortgage-value floor.';}
  if(g.s.phase==='debt'&&g.s.debt.from===id){if(p.cash>=g.s.debt.amount)return kind==='settle'?'':'The debt is affordable. Pay it before managing more property.';if(['sell','sellset'].includes(kind)&&Economy.mortgages(g,id).length)return 'Mortgage an eligible unimproved deed before removing income-producing buildings, or use the coordinated debt plan.';if(kind==='surrender'&&!Economy.liquidation(g,id,g.s.debt.amount).shortfall)return 'The debt can be funded by the coordinated liquidation plan. Do not declare bankruptcy.';if(!a.trade)return '';}
  if(a.trade)return this.tradeReason(g,a.trade,id,{initial:true});
  if(kind==='buy'){
   const b=g.board[g.s.purchase],after=p.cash-(b?.price||0),completes=b?.workshop&&g.group(b.group).every(x=>x.id===b.id||g.s.props[x.id].owner===id);
   if(after<this.funding(g,id).reserve&&!(completes&&after>=50))return 'Purchase leaves insufficient cash. Choose a verified funded purchase, send it to auction, or complete a set while keeping at least $50.';
  }
  if(a.plan){
   const quoted=Plans.quote(g,id,a.plan.spec);if(!quoted||JSON.stringify(quoted)!==JSON.stringify(a.plan))return 'The project is stale or no longer meets its cash floor and building constraints.';
   if(a.plan.reserve<S.risk(g,id).investmentReserve)return 'The project cash floor is too low.';
   const finance=a.plan.steps.filter(s=>['mortgage','unmortgage'].includes(s.kind));
   if(finance.length+this.state.finance.filter(x=>x.seat===id).length>8)return 'The bounded project finance limit is reached.';
   for(const s of a.plan.steps){
    if(['mortgage','unmortgage'].includes(s.kind)&&this.state.finance.some(x=>x.seat===id&&x.property===s.property&&x.kind!==s.kind))return 'A project cannot bypass same-turn mortgage reversal protection.';
    if(s.kind==='build'&&this.state.development.some(x=>x.seat===id&&g.board[x.property].group===g.board[s.property].group&&x.kind==='sell'))return 'A project cannot rebuild a set sold this turn.';
   }return '';
  }
  if(['build','sell','sellset'].includes(kind)){
   const group=g.board[a.property]?.group,opposite=kind==='build'?'sell':'build';
   if(this.state.development.some(x=>x.seat===id&&g.board[x.property].group===group&&x.kind===opposite))return 'Do not build and liquidate the same color set in one turn and lose half the investment. New debt is handled separately.';
  }
  if(!['mortgage','unmortgage'].includes(kind))return '';
  const previous=this.state.finance.filter(x=>x.seat===id);
  if(previous.length>=MAX_FINANCE_ACTIONS)return 'Finance action limit reached for this turn. Continue the game.';
  const last=previous.findLast(x=>x.property===a.property);
  if(last&&last.kind!==kind)return 'Do not reverse a mortgage operation on the same deed in the same turn and lose interest. New debt is handled separately.';
  const f=this.funding(g,id);
  if(kind==='mortgage'&&p.cash>=f.target)return 'Cash already covers the reserve and available investment. No financing need.';
  if(kind==='unmortgage'&&p.cash-Math.ceil(g.board[a.property].price*11/20)<f.reserve)return 'Lifting this mortgage spends cash and would leave too little reserve.';
  return '';
 }
 filter(g,id,actions,context={}){return actions.filter(a=>!this.actionReason(g,id,a,context));}
 context(g,id){
  this.turn(g);
  return{funding:this.funding(g,id),financeThisTurn:this.state.finance.filter(x=>x.seat===id).slice(-MAX_FINANCE_ACTIONS),initialOfferAvailable:this.canPropose(g,id),maxCountersPerPlayer:MAX_COUNTERS,policy:'Avoid same-turn mortgage or building reversals; borrow only for a funding need. One initial AI proposal per round; pair cooldowns and one counter per participant. Do not cheaply complete a rival district.'};
 }
 observe(g,id,a,before){
  // Use actual deed changes, including automatic debt liquidation, rather than
  // trusting a model's explanation of what it thinks happened.
  for(let i=0;i<g.s.props.length;i++){
   const old=before.props[i],now=g.s.props[i];
   if(old.owner!==null&&old.owner===now.owner&&old.mortgaged!==now.mortgaged)this.state.finance.push({seat:old.owner,property:i,kind:now.mortgaged?'mortgage':'unmortgage'});
   if(old.owner!==null&&old.owner===now.owner&&old.level!==now.level)this.state.development.push({seat:old.owner,property:i,kind:now.level>old.level?'build':'sell'});
  }
  if(!before.offer&&a.trade){this.state.proposers[id]=g.s.round;this.state.pairs[this.pair(a.trade.from,a.trade.to)]={round:g.s.round,outcome:'pending'};}
  if(before.offer){const outcome=a.id==='accept'?'accepted':(a.id==='counter'||a.counter)?'pending':'rejected';this.state.pairs[this.pair(before.offer.from,before.offer.to)]={round:g.s.round,outcome};}
  this.turn(g);
 }
}
module.exports={StrategyPolicy,MAX_FINANCE_ACTIONS,MAX_COUNTERS};
