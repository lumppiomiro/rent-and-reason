#!/usr/bin/env node
'use strict';
// One-time migration of completed local saves. Run while the AI host is stopped.
const fs=require('node:fs'),path=require('node:path'),{Game}=require('./engine.js'),{TrophyStore}=require('./ai/trophies.cjs'),{AuditJournal}=require('./ai/audit.cjs'),{fromAudit}=require('./ai/archive-backfill.cjs');
function migrate(dataDir,imports=[]){
 const store=new TrophyStore(dataDir),journal=new AuditJournal(dataDir),current=path.join(dataDir,'table.json'),files=[...(fs.existsSync(current)?[current]:[]),...imports],results=[];
 for(const file of files){const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.format!=='rent-reason-ai-table'||saved.version!==1)throw Error('Choose a full exported AI table save.');Game.validate(saved.game);if(saved.game.phase!=='over')continue;
  const history=fromAudit(saved,journal.file(saved.id));if(history&&(!saved.matchHistory||history.actions>saved.matchHistory.actions))saved.matchHistory=history;
  store.record(saved,{source:file===current?'local-save-and-audit':'imported-save'});
  if(file===current&&saved.matchHistory){fs.writeFileSync(file+'.tmp',JSON.stringify(saved),{mode:0o600});fs.renameSync(file+'.tmp',file);}
  const a=store.archives.read(saved.id);results.push({id:saved.id,snapshots:a.snapshots.length,chat:a.chat.length,actions:a.statistics.actions,complete:a.statistics.coverage.complete,bytes:Buffer.byteLength(JSON.stringify(a))});
 }
 return results;
}
if(require.main===module){try{console.log(JSON.stringify(migrate(path.join(__dirname,'.rent-reason-data'),process.argv.slice(2)),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={migrate};
