/* Compact public match history. Shared by the host and the offline browser. */
(function(root){
'use strict';
const M=root.RentReason||(typeof require==='function'?require('./engine.js'):null),T=root.RentReasonTrophies||(typeof require==='function'?require('./trophies.js'):null),U=root.RentReasonUsage||(typeof require==='function'?require('./usage.js'):null);
const clone=x=>JSON.parse(JSON.stringify(x)),pick=(x,keys)=>Object.fromEntries(keys.filter(k=>x?.[k]!==undefined).map(k=>[k,clone(x[k])])),number=x=>Number.isFinite(x)&&x>=0?x:0;
function publicState(s){
 const out=pick(s,['version','boardId','boardVersion','language','turn','round','phase','doubles','dice','extra','log','payments','auction','bankAuctions','workshops','landmarks','winner','difficulty','roundLimit','notice','rules','startingCash','parkingPot','purchase','resumePhase','debt','card','eliminations','timing']);
 out.players=s.players.map(p=>pick(p,['id','name','bot','token','color','piece','cash','pos','jail','inJail','cards','out']));
 out.props=s.props.map(p=>pick(p,['owner','level','mortgaged']));
 if(s.controllers)out.controllers=s.controllers.map(p=>profile(p));return out;
}
function profile(p){return pick(p,['characterId','type','model','name','personality','voice','chattiness','customVoice','effort']);}
function chatMessage(c){return pick(c,['id','seat','name','text','round','kind','replyTo','targets','contextRevision','contextRound','topicKey','property','active','version']);}
function fresh(s,{complete=false,revision=0,at=null}={}){return {version:1,startedAt:at,finishedAt:null,lastRevision:revision,coverage:{complete,fromRound:s.round,fromRevision:revision,gaps:[],snapshots:'exact'},actions:0,trades:0,biggestRent:null,seats:s.players.map(p=>({id:p.id,peakCash:p.cash,rentPaid:0,rentReceived:0,purchases:0,purchaseSpend:0,trades:0,housesBuilt:0,hotelsBuilt:0,buildingSpend:0,bankruptRound:null})),bankruptcies:[],chat:[],chatComplete:complete,configuration:[]};}
function restore(raw,s,revision){
 if(!raw||raw.version!==1||!Array.isArray(raw.seats)||raw.seats.length!==s.players.length)return fresh(s,{revision});
 const d=fresh(s,{revision});d.startedAt=typeof raw.startedAt==='string'?raw.startedAt:null;d.finishedAt=typeof raw.finishedAt==='string'?raw.finishedAt:null;d.lastRevision=number(raw.lastRevision);
 d.coverage={complete:raw.coverage?.complete===true,fromRound:number(raw.coverage?.fromRound)||s.round,fromRevision:number(raw.coverage?.fromRevision),gaps:Array.isArray(raw.coverage?.gaps)?raw.coverage.gaps.map(g=>pick(g,['from','to','reason'])):[],snapshots:raw.coverage?.snapshots==='action-start'?'action-start':'exact'};
 for(const k of ['actions','trades'])d[k]=number(raw[k]);
 d.seats=d.seats.map((row,i)=>Object.fromEntries(Object.keys(row).map(k=>[k,k==='id'?i:k==='bankruptRound'?(Number.isInteger(raw.seats[i]?.[k])?raw.seats[i][k]:null):number(raw.seats[i]?.[k])])));
 if(raw.biggestRent&&Number.isFinite(raw.biggestRent.amount))d.biggestRent=pick(raw.biggestRent,['amount','from','to','reason','round']);
 d.bankruptcies=(raw.bankruptcies||[]).filter(x=>Number.isInteger(x.seat)&&s.players[x.seat]&&x.state?.players?.length===s.players.length&&x.state.props?.length===40).slice(0,3).map(x=>({...pick(x,['seat','creditor','round','revision','exact']),state:publicState(x.state)}));
 d.chatComplete=raw.chatComplete===true;d.chat=(raw.chat||[]).map(chatMessage);d.configuration=(raw.configuration||[]).map(c=>({round:c.round,revision:c.revision,players:(c.players||[]).map(profile)}));return d;
}
class Tracker{
 constructor(s,{saved,complete=false,revision=0,at=new Date().toISOString()}={}){this.data=saved?restore(saved,s,revision):fresh(s,{complete,revision,at:complete?at:null});}
 attach(game,revision=()=>this.data.lastRevision+1){game.onBeforeBankruptcy=(seat,creditor)=>this.bankruptcy(game.s,seat,creditor,revision(),true);}
 bankruptcy(s,seat,creditor,revision,exact){if(this.data.bankruptcies.some(x=>x.seat===seat))return;this.data.bankruptcies.push({seat,creditor,round:s.round,revision,exact,state:publicState(s)});}
 observe(before,after,events=[],revision=this.data.lastRevision+1){
  const d=this.data;if(revision<=d.lastRevision)return;d.lastRevision=revision;d.actions++;
  for(const p of after.players){const row=d.seats[p.id];row.peakCash=Math.max(row.peakCash,p.cash);if(p.out&&!before.players[p.id].out){row.bankruptRound=after.round;if(!d.bankruptcies.some(b=>b.seat===p.id)){this.bankruptcy(before,p.id,before.debt?.to??null,revision,false);d.coverage.snapshots='action-start';}}}
  for(const e of events){if(e.presentationOnly)continue;if(e.type==='trade'){d.trades++;for(const id of [e.from,e.to])if(d.seats[id])d.seats[id].trades++;}
   if(e.type!=='money')continue;
   for(const c of e.changes||[]){const row=d.seats[c.player];if(!row)continue;if(Number.isFinite(c.balance))row.peakCash=Math.max(row.peakCash,c.balance);
    if(e.kind==='purchase'&&c.amount<0){row.purchases++;row.purchaseSpend-=c.amount;}
    if(e.kind==='building'&&c.amount<0){row.buildingSpend-=c.amount;const landmark=M.boardFor(after).some(b=>b.workshop&&before.props[b.id].owner===c.player&&before.props[b.id].level===4&&after.props[b.id].level===5);row[landmark?'hotelsBuilt':'housesBuilt']++;}
   }
   if(e.kind!=='rent'&&!/^rent on /i.test(e.reason||''))continue;
   const payers=e.changes.filter(c=>c.amount<0),receivers=e.changes.filter(c=>c.amount>0),amount=receivers.reduce((n,c)=>n+c.amount,0);
   for(const c of payers)d.seats[c.player].rentPaid-=c.amount;for(const c of receivers)d.seats[c.player].rentReceived+=c.amount;
   if(amount&&(!d.biggestRent||amount>d.biggestRent.amount))d.biggestRent={amount,from:payers[0]?.player,to:receivers[0]?.player,reason:e.reason,round:after.round};
  }
  if(after.phase==='over')d.finishedAt??=new Date().toISOString();
 }
 capture(chat,players,s,revision){const d=this.data,byId=new Map(d.chat.map((c,i)=>[c.id||'legacy:'+i,c]));for(const [i,c]of(chat||[]).entries())byId.set(c.id||'legacy:'+i,chatMessage(c));d.chat=[...byId.values()];const last=d.configuration.at(-1),configs=players.map(profile);if(!last||JSON.stringify(last.players)!==JSON.stringify(configs))d.configuration.push({round:s.round,revision,players:configs});return d;}
}
function archive(saved,summary,{source='recorded',previous=null}={}){
 const state=publicState(saved.game),tracker=new Tracker(state,{saved:saved.matchHistory,revision:saved.revision||0});
 tracker.capture(saved.chat||[],saved.options?.players||state.controllers||[],state,saved.revision||0);let h=tracker.data;
 // An older imported save or a host predating statistics must not erase a richer archive.
 if(previous?.statistics&&(previous.statistics.actions>h.actions||previous.statistics.coverage.complete&&!h.coverage.complete)){
  const old=previous;h={...h,...old.statistics,startedAt:old.startedAt,finishedAt:old.finishedAt,bankruptcies:old.snapshots.filter(x=>x.kind==='before-bankruptcy').map(({kind,label,...x})=>x),configuration:old.configuration,chat:[...new Map([...old.chat,...h.chat].map(c=>[c.id,c])).values()]};
 }
 const roster=state.players.map(p=>({...profile(saved.options?.players?.[p.id]||state.controllers?.[p.id]||{type:p.bot?'heuristic':'human'}),seat:p.id,name:summary.entries.find(e=>e.seat===p.id)?.name||p.name}));
 const metrics=Object.entries(saved.agents||{}).map(([id,a])=>({id:Number(id),...profile(saved.options.players[id]),...pick(a.metrics||{},['input','output','cached','cacheWrite','calls','decisions','chatCalls','chatReplies','durationMs','incomplete','costUsd','costReports','pricing'])}));
 const models=U.aggregate(metrics).map(row=>({...row,estimate:U.estimate(row,row.pricing||U.rateFor(row.model)),reportedCostEur:row.costReports?row.costUsd/U.FX.usdPerEur:null}));
 const {chat,bankruptcies,configuration,startedAt,finishedAt,...statistics}=h;
 return {timing:clone(saved.timing||state.timing||previous?.timing||null),format:'rent-reason-match-archive',version:1,id:saved.id,source,startedAt,finishedAt:previous?.finishedAt||finishedAt||summary.finishedAt,archivedAt:previous?.archivedAt||new Date().toISOString(),updatedAt:new Date().toISOString(),revision:saved.revision||0,summary:clone(summary),settings:pick(state,['boardId','boardVersion','language','rules','startingCash','roundLimit','difficulty']),roster,configuration,statistics,usage:{models,...((saved.reflectionUsage?.length||previous?.usage?.reflections?.length)?{reflections:[...new Map([...(previous?.usage?.reflections||[]),...(saved.reflectionUsage||[])].map(j=>[j.id,j])).values()]}:{}),fx:clone(U.FX),referenceAsOf:U.AS_OF,scope:'Whole session, including saved post-match replies. Reported API costs may be incomplete after interrupted requests.'},chat,chatCoverage:statistics.chatComplete?'Complete saved conversation':'available history; earlier messages may be missing',snapshots:[...bankruptcies.map(x=>({kind:'before-bankruptcy',...x})),{kind:'final',round:state.round,revision:saved.revision||0,state}]};
}
const api={publicState,profile,fresh,restore,Tracker,archive};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonMatchData=api;
})(globalThis);
