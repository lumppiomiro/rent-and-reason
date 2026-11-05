/* Deterministic economic advice. All simulated changes use copies, never future dice. */
(function(root){
'use strict';
const DICE=[1,2,3,4,5,6,5,4,3,2,1];
const copy=g=>{const v=Object.create(Object.getPrototypeOf(g));v.s=JSON.parse(JSON.stringify(g.s));v.events=[];return v;};
// A small Markov approximation includes ordinary dice and Go To Permit Review, not cards or Permit Review stays.
let stationary=Array(40).fill(1/40);for(let n=0;n<160;n++){const next=Array(40).fill(0);for(let at=0;at<40;at++)for(let i=0;i<DICE.length;i++){let to=(at+i+2)%40;if(to===30)to=10;next[to]+=stationary[at]*DICE[i]/36;}stationary=next;}
function weights(g,id){const out=stationary.map(p=>p*Math.max(1,g.active.filter(p=>p.id!==id).length));for(const p of g.active.filter(p=>p.id!==id))for(let i=0;i<DICE.length;i++){const to=(p.pos+i+2)%40;if(to!==30)out[to]+=.25*DICE[i]/36;}return out;}
function income(g,id,w=weights(g,id)){return g.own(id).reduce((sum,b)=>sum+w[b.id]*g.rent(b.id,7),0);}
function mortgages(g,id,only=null){const w=weights(g,id);return g.own(id).filter(b=>(!only||only.has(b.id))&&!g.mortgageReason(b.id,id)).map(b=>({kind:'mortgage',property:b.id,cash:b.price/2,rentLoss:w[b.id]*g.rent(b.id,7)})).sort((a,b)=>a.rentLoss/a.cash-b.rentLoss/b.cash||a.property-b.property);}
function enact(g,id,s){return s.kind==='mortgage'?g.mortgage(s.property,id,true):s.kind==='sellset'?g.sellSet(s.property,id,true):g.sell(s.property,id,true);}
function groupPlan(g,id,group,need){
 const v=copy(g),bs=v.group(group),ids=new Set(bs.map(b=>b.id)),initial=v.s.players[id].cash,w=weights(v,id),rent=income(v,id,w);let steps=[],best=null;
 const consider=()=>{const cash=v.s.players[id].cash-initial;if(!cash)return;const loss=Math.max(0,rent-income(v,id,w)),cost=loss/Math.max(1,cash);if(!best||cash>=need&&best.cash<need||cash>=need&&best.cash>=need&&loss<best.rentLoss||cash<need&&best.cash<need&&cash>best.cash)best={steps:steps.map(s=>({...s})),cash,rentLoss:loss,cost,group};};
 for(let guard=0;guard<25&&v.s.players[id].cash-initial<need;guard++){
  const legal=bs.filter(b=>!v.sellReason(b.id,id));
  let step;if(legal.length){const b=legal.map(b=>{const pr=v.s.props[b.id],before=v.rent(b.id,7),after=b.rent[pr.level-1]||b.rent[0]*2;return{b,loss:w[b.id]*(before-(pr.level===1?b.rent[0]*2:after))};}).sort((a,b)=>a.loss/(a.b.workshop/2)-b.loss/(b.b.workshop/2)||a.b.id-b.b.id)[0].b;step={kind:'sell',property:b.id};}
  else if(bs.some(b=>v.s.props[b.id].level===5)&&v.s.workshops<4)step={kind:'sellset',property:bs.find(b=>v.s.props[b.id].level===5).id};else break;
  if(!enact(v,id,step))break;steps.push(step);consider();
  if(bs.every(b=>!v.s.props[b.id].level)){for(const m of mortgages(v,id,ids)){if(v.s.players[id].cash-initial>=need)break;if(!enact(v,id,m))break;steps.push({kind:'mortgage',property:m.property});consider();}break;}
 }
 return best;
}
function liquidation(g,id,target){
 const v=copy(g),initial=v.s.players[id].cash,w=weights(v,id),originalIncome=income(v,id,w),steps=[],groups=[];let guard=0;
 while(v.s.players[id].cash<target&&guard++<160){const m=mortgages(v,id)[0];if(m){if(!enact(v,id,m))break;steps.push({kind:'mortgage',property:m.property});continue;}
  const options=[...new Set(v.own(id).filter(b=>b.workshop&&v.s.props[b.id].level).map(b=>b.group))].map(group=>groupPlan(v,id,group,target-v.s.players[id].cash)).filter(Boolean).sort((a,b)=>a.cost-b.cost||a.rentLoss-b.rentLoss||a.group.localeCompare(b.group));
  const plan=options[0];if(!plan)break;groups.push(plan.group);let changed=false;
  // Complete the selected colour group's funding prefix before considering another group.
  for(const s of plan.steps){if(v.s.players[id].cash>=target)break;if(!enact(v,id,s))break;steps.push({...s});changed=true;}if(!changed)break;
 }
 return{target,cashAfter:v.s.players[id].cash,cashRaised:v.s.players[id].cash-initial,shortfall:Math.max(0,target-v.s.players[id].cash),steps,groups:[...new Set(groups)],mortgages:steps.filter(s=>s.kind==='mortgage').length,buildingSales:steps.filter(s=>s.kind!=='mortgage').length,expectedRentLost:Math.round(Math.max(0,originalIncome-income(v,id,w))*100)/100,approximation:'Stationary ordinary-dice landings plus near-term opponent exposure; omits cards and Permit Review stays.'};
}
function raiseCash(g,id,target){const plan=liquidation(g,id,target);for(const step of plan.steps){if(g.s.players[id].cash>=target)break;if(!enact(g,id,step))break;}return plan;}
function auction(g,id,{value,reserve}){const b=g.board[g.s.auction.id],cash=g.s.players[id].cash,mortgageValue=b.price/2,minimum=g.s.auction.bid+1,discretionary=Math.max(0,Math.floor(cash-reserve)),bargainFloor=Math.min(mortgageValue,discretionary),recommended=Math.max(0,Math.min(Math.round(value),discretionary));return{mortgageValue,minimum,bargainFloor,recommendedCeiling:Math.max(bargainFloor,recommended),cash,reserve,belowMortgage:minimum<=mortgageValue,explanation:'A ceiling authorizes later incremental bids; it is not the purchase price. Below mortgage value is a recoverable bargain when the cash reserve permits. The deed cannot be mortgaged during the auction.'};}
const api={weights,income,mortgages,liquidation,raiseCash,auction};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonEconomy=api;
})(globalThis);
