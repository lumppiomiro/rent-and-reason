'use strict';
const {Game}=require('../engine.js');
const {createHash}=require('node:crypto');
const MAX_STEPS=24;
function stateKey(g){return createHash('sha256').update(JSON.stringify({turn:g.s.turn,phase:g.s.phase,purchase:g.s.purchase,extra:g.s.extra,players:g.s.players.map(p=>[p.cash,p.pos,p.out,p.inJail]),props:g.s.props,workshops:g.s.workshops,landmarks:g.s.landmarks,rules:g.s.rules})).digest('hex').slice(0,20);}
function step(g,id,a){
 if(g.s.players[id].out||g.manager!==id)return false;
 if(a.kind==='buy')return g.s.phase==='buy'&&g.buy();
 if(!g.canManage(id)||g.s.phase==='debt')return false;
 switch(a.kind){case'mortgage':return g.mortgage(a.property,id);case'unmortgage':return g.unmortgage(a.property);case'build':return g.build(a.property);case'buy':return g.buy();default:return false;}
}
function quote(g,id,spec){
 if(g.manager!==id||g.s.players[id].out||!Number.isInteger(spec.reserve)||spec.reserve<0)return null;
 const purchase=spec.kind==='purchase';
 if(purchase?g.s.phase!=='buy':!['roll','end'].includes(g.s.phase))return null;
 const streets=purchase?[]:g.group(spec.group);
 if(!purchase&&(!streets.length||!streets.every(b=>b.workshop&&g.s.props[b.id].owner===id)||!Number.isInteger(spec.target)||spec.target<0||spec.target>4||streets.some(b=>g.s.props[b.id].level>spec.target)))return null;
 const copy=Game.load(g.s),steps=[],originalCash=g.s.players[id].cash;
 const initialRent=streets.reduce((n,b)=>n+copy.rent(b.id,7),0);
 const add=(kind,property)=>{if(steps.length>=MAX_STEPS)return false;const cash=copy.s.players[id].cash;if(!step(copy,id,{kind,property}))return false;steps.push({kind,property,cashDelta:copy.s.players[id].cash-cash});return true;};
 // Fund the entire goal, rather than borrowing for an isolated next workshop.
 const protectedIds=new Set(purchase?[g.s.purchase]:streets.map(b=>b.id));
 const cost=purchase?g.board[g.s.purchase].price:streets.reduce((n,b)=>n+(copy.s.props[b.id].mortgaged?Math.ceil(b.price*11/20):0)+(spec.target-copy.s.props[b.id].level)*b.workshop,0);
 if(!cost)return null;
 if(purchase&&!add('buy',g.s.purchase))return null;
 const requiredCash=purchase?spec.reserve:cost+spec.reserve;
 const mortgages=copy.own(id).filter(b=>!protectedIds.has(b.id)&&!copy.mortgageReason(b.id,id)).sort((a,b)=>Number(copy.completeSet(id,a.group))-Number(copy.completeSet(id,b.group))||copy.rent(a.id,7)/(a.price/2)-copy.rent(b.id,7)/(b.price/2)||a.id-b.id);
 for(const b of mortgages){if(copy.s.players[id].cash>=requiredCash)break;if(!add('mortgage',b.id))return null;}
 if(copy.s.players[id].cash<requiredCash)return null;
 if(!purchase){
  for(const b of streets)if(copy.s.props[b.id].mortgaged&&!add('unmortgage',b.id))return null;
  while(streets.some(b=>copy.s.props[b.id].level<spec.target)){
   const next=streets.filter(b=>copy.s.props[b.id].level<spec.target&&!copy.buildReason(b.id,id)).sort((a,b)=>copy.s.props[a.id].level-copy.s.props[b.id].level||b.rent[copy.s.props[b.id].level+1]-a.rent[copy.s.props[a.id].level+1]||a.id-b.id)[0];
   if(!next||!add('build',next.id))return null;
  }
 }
 if(copy.s.players[id].cash<spec.reserve)return null;
 return{spec:{...spec},stateKey:stateKey(g),steps,cost,borrowed:steps.filter(s=>s.kind==='mortgage').reduce((n,s)=>n+s.cashDelta,0),cashAfter:copy.s.players[id].cash,cashDelta:copy.s.players[id].cash-originalCash,rentGain:streets.reduce((n,b)=>n+copy.rent(b.id,7),0)-initialRent,levels:streets.map(b=>[b.id,copy.s.props[b.id].level]),reserve:spec.reserve};
}
function execute(g,id,plan){
 if(!plan||plan.stateKey!==stateKey(g))throw Error('The development / funding plan is stale. Reconsider the current state.');
 const fresh=quote(g,id,plan.spec);
 if(!fresh||JSON.stringify(fresh)!==JSON.stringify(plan))throw Error('The plan no longer meets its budget, building inventory or legal constraints.');
 // Validate on a copy before publishing any changes; no RNG or turn is advanced.
 const copy=Game.load(g.s);for(const s of fresh.steps)if(!step(copy,id,s))throw Error('A plan step is no longer legal.');
 if(copy.s.players[id].cash<plan.reserve)throw Error('The plan would cross its cash floor.');
 Game.validate(copy.s);g.s=copy.s;g.events.push(...copy.events);g.log(`${g.s.players[id].name} completes a ${plan.spec.kind==='purchase'?'funded purchase':plan.spec.group+' development plan'}, retaining $${plan.cashAfter}.`);return true;
}
function candidates(g,id,{recommendedReserve:reserve,investmentReserve}){
 const result=[];
 for(const group of new Set(g.own(id).filter(b=>b.workshop).map(b=>b.group))){
  if(!g.completeSet(id,group))continue;
  const quoted=[];
  for(const target of [0,1,3,4]){
   let p=quote(g,id,{kind:'develop',group,target,reserve});
   if(!p&&investmentReserve<reserve)p=quote(g,id,{kind:'develop',group,target,reserve:investmentReserve});
   if(p&&p.steps.length>1)quoted.push(p);
  }
  // Offer the three-workshop goal and either a larger or smaller alternative.
  const preferred=quoted.find(p=>p.spec.target===3)||quoted.findLast(p=>p.spec.target<3)||quoted[0];
  if(preferred)result.push(preferred);
  const alternative=quoted.find(p=>p.spec.target===4&&p!==preferred);if(alternative)result.push(alternative);
 }
 return result.sort((a,b)=>b.rentGain/Math.max(1,b.cost)-a.rentGain/Math.max(1,a.cost)).slice(0,6);
}
module.exports={MAX_STEPS,stateKey,quote,execute,candidates};
