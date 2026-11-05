/* Public match records and compact career memory. No private agent state. */
(function(root){
'use strict';
const empty=()=>({version:1,matches:[]});
const clean=s=>String(s??'').trim().slice(0,160);
function identity(config={},player={}){
 const type=config.type||(!player.bot?'human':'heuristic'),name=clean(player.name||config.name||'Player'),model=clean(config.model);
 return {key:type==='human'?'human:'+name.toLowerCase():type==='heuristic'?'bot:'+name.toLowerCase():'model:'+type+':'+model,type,model,name};
}
function standings(state,options=[]){
 const survivors=state.players.filter(p=>!p.out).sort((a,b)=>wealth(state,b.id)-wealth(state,a.id)),places=new Map();
 if(state.phase==='over'){
  places.set(state.winner,1);
  const rest=survivors.filter(p=>p.id!==state.winner);let previous=null,place=2;
  rest.forEach((p,i)=>{const value=wealth(state,p.id);if(previous!==null&&value!==previous)place=i+2;places.set(p.id,place);previous=value;});
  for(const e of state.eliminations||[])if(state.players[e.seat]?.out)places.set(e.seat,e.place);
 }
 return state.players.map(p=>({...identity(options[p.id]||state.controllers?.[p.id],p),...(options[p.id]?.characterId?{characterId:options[p.id].characterId}:{}),seat:p.id,place:places.get(p.id)??null,out:p.out,netWorth:wealth(state,p.id),eliminatedRound:(state.eliminations||[]).find(e=>e.seat===p.id)?.round??null})).sort((a,b)=>(a.place??99)-(b.place??99)||a.seat-b.seat);
}
function wealth(s,id){return s.players[id].cash+s.props.reduce((n,p,i)=>{if(p.owner!==id)return n;const b=(root.RentReason||require('./engine.js')).boardFor(s)[i];return n+(p.mortgaged?b.price/2:b.price)+(p.level||0)*(b.workshop||0)/2;},0);}
function match(state,options,id,{at=new Date().toISOString(),source='recorded'}={}){
 if(state.phase!=='over')return null;
 return {...(state.timing?{timing:JSON.parse(JSON.stringify(state.timing))}:{}),id:clean(id),finishedAt:at,round:state.round,boardId:state.boardId||'lantern-harbor',language:state.language||'en',source,entries:standings(state,options)};
}
function valid(record){return record&&typeof record.id==='string'&&record.id.length>0&&record.id.length<=160&&Array.isArray(record.entries)&&record.entries.length>0&&record.entries.length<=4&&record.entries.every(e=>e&&typeof e.key==='string'&&e.key.length<=400&&typeof e.name==='string'&&typeof e.type==='string'&&typeof e.model==='string'&&(e.place===null||Number.isInteger(e.place)&&e.place>=1&&e.place<=4))&&record.entries.some(e=>e.place===1);}
function upsert(cabinet,record){
 if(!valid(record))throw Error('Invalid trophy record.');
 const matches=[...(cabinet?.matches||[])],index=matches.findIndex(m=>m.id===record.id),old=matches[index];
 const next=JSON.parse(JSON.stringify(record));
 if(old){if(old.source==='user-confirmed'){next.source=old.source;next.entries=next.entries.map(e=>({...e,...old.entries.find(p=>p.seat===e.seat)}));}next.archive=record.archive||old.archive;next.finishedAt=old.finishedAt;next.entries=next.entries.map(e=>{const previous=old.entries.find(p=>p.key===e.key&&p.seat===e.seat);return {...e,place:e.place??previous?.place??null,eliminatedRound:e.eliminatedRound??previous?.eliminatedRound??null};});}
 next.entries.sort((a,b)=>(a.place??99)-(b.place??99)||a.seat-b.seat);
 if(index<0)matches.push(next);else matches[index]=next;
 return {version:1,matches};
}
function careers(cabinet){
 const rows=new Map();for(const m of cabinet?.matches||[])for(const e of m.entries){let r=rows.get(e.key);if(!r){r={key:e.key,name:e.name,type:e.type,model:e.model,games:0,gold:0,silver:0,bronze:0,fourth:0,unplaced:0,best:null,lastPlace:null};rows.set(e.key,r);}r.name=e.name;r.games++;r.lastPlace=e.place;if(e.place===null)r.unplaced++;else{r[['gold','silver','bronze','fourth'][e.place-1]]++;r.best=r.best===null?e.place:Math.min(r.best,e.place);}}
 return [...rows.values()].sort((a,b)=>b.gold-a.gold||b.silver-a.silver||b.bronze-a.bronze||a.name.localeCompare(b.name));
}
function memory(cabinet,players){const rows=careers(cabinet);return players.map((p,id)=>{const who=identity(p,{name:p.name,bot:p.type!=='human'}),r=rows.find(r=>r.key===who.key);return {seat:id,name:who.name,model:who.model,games:r?.games||0,gold:r?.gold||0,silver:r?.silver||0,bronze:r?.bronze||0,lastPlace:r?.lastPlace??null};});}
const api={empty,identity,standings,match,valid,upsert,careers,memory};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonTrophies=api;
})(globalThis);
