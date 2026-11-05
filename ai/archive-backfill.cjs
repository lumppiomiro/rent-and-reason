'use strict';
const fs=require('node:fs'),Data=require('../match-data.js');
// Reconstruct public highlights from existing evidence. Never asks a model.
function fromAudit(saved,file){
 if(!fs.existsSync(file))return null;
 const entries=[];for(const line of fs.readFileSync(file,'utf8').split('\n')){if(!line.trim())continue;try{const e=JSON.parse(line);if(e.tableId===saved.id&&e.revision<=saved.revision)entries.push(e);}catch{/* An interrupted final append is not evidence. */}}
 const starts=new Map(),ends=new Map(),sessions=[];
 for(const e of entries){if(e.type==='actionStart')starts.set(e.revision,e);if(e.type==='actionComplete')ends.set(e.revision,e);if(e.type==='sessionStart')sessions.push(e);}
 // An action can have saved its result before its final audit append failed.
 // The next action's starting board recovers that boundary, but not its events.
 for(const [revision,start]of starts)if(!ends.has(revision+1)&&starts.has(revision+1)&&start.data.state){const next=starts.get(revision+1);ends.set(revision+1,{...next,reconstructed:true,data:{state:next.data.state,events:[]}});}
 if(!ends.size)return null;
 const first=[...ends.keys()].sort((a,b)=>a-b)[0],initial=starts.get(first-1)?.data.state||sessions.find(e=>e.revision<=first)?.data.state;if(!initial)return null;
 const opening=sessions.find(e=>e.revision===0&&!e.data.restored),tracker=new Data.Tracker(initial,{complete:Boolean(opening&&first===1),revision:first-1,at:opening?.at});
 tracker.data.startedAt=opening?.at||null;tracker.data.chatComplete=false;tracker.data.coverage.snapshots='action-start';
 let previous=first-1;
 for(const [revision,e]of [...ends].sort(([a],[b])=>a-b)){
  const start=starts.get(revision-1);if(!start?.data.state||!e.data.state){tracker.data.coverage.complete=false;tracker.data.coverage.gaps.push({from:revision,to:revision,reason:'Action boundary unavailable in the audit.'});continue;}
  if(revision!==previous+1){tracker.data.coverage.complete=false;tracker.data.coverage.gaps.push({from:previous+1,to:revision-1,reason:'Actions were not recorded in the available audit.'});}
  if(e.reconstructed){tracker.data.coverage.complete=false;tracker.data.coverage.gaps.push({from:revision,to:revision,reason:'Board boundary recovered from the next action; payment events unavailable.'});}tracker.observe(start.data.state,e.data.state,e.data.events||[],revision);if(e.data.state.phase==='over')tracker.data.finishedAt=e.at;previous=revision;
 }
 if(previous!==saved.revision){tracker.data.coverage.complete=false;tracker.data.coverage.gaps.push({from:previous+1,to:saved.revision,reason:'The saved game extends beyond the available action audit.'});}
 for(const e of entries){if(e.type==='chat'&&e.data.message)tracker.capture([e.data.message],[],e.data.state||saved.game,e.revision);}
 tracker.data.configuration=sessions.filter(e=>e.data.options?.players).map(e=>({round:e.round,revision:e.revision,players:e.data.options.players.map(Data.profile)})).filter((e,i,all)=>!i||JSON.stringify(e.players)!==JSON.stringify(all[i-1].players));
 tracker.capture(saved.chat||[],saved.options.players,saved.game,saved.revision);return tracker.data;
}
module.exports={fromAudit};
