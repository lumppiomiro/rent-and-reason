'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const sourceVersion=createHash('sha256').update(['../engine.js',...fs.readdirSync(__dirname).filter(name=>name.endsWith('.cjs')).sort()].map(name=>fs.readFileSync(path.join(__dirname,name))).join('\n')).digest('hex');
class AuditJournal{
 constructor(dataDir){this.dir=path.join(dataDir,'audit');}
 file(tableId){const name=createHash('sha256').update(String(tableId)).digest('hex').slice(0,24);return path.join(this.dir,'game-'+name+'.jsonl');}
 append(entry){fs.mkdirSync(this.dir,{recursive:true,mode:0o700});fs.appendFileSync(this.file(entry.tableId),JSON.stringify({format:'rent-reason-audit',version:1,id:randomUUID(),at:new Date().toISOString(),sourceVersion,...entry})+'\n',{mode:0o600});}
}
module.exports={AuditJournal};
