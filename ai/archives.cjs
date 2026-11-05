'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),Data=require('../match-data.js');
class ArchiveStore{
 constructor(dataDir){this.dir=path.join(dataDir,'matches');}
 file(id){if(typeof id!=='string'||!id||id.length>160)throw Error('Invalid match ID.');return path.join(this.dir,createHash('sha256').update(id).digest('hex')+'.json');}
 read(id){try{const data=JSON.parse(fs.readFileSync(this.file(id),'utf8'));if(data.format!=='rent-reason-match-archive'||data.version!==1||data.id!==id)throw Error('Invalid match archive.');return data;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 write(data){if(data?.format!=='rent-reason-match-archive'||data.version!==1)throw Error('Invalid match archive.');const file=this.file(data.id);fs.mkdirSync(this.dir,{recursive:true,mode:0o700});fs.writeFileSync(file+'.tmp',JSON.stringify(data),{mode:0o600});fs.renameSync(file+'.tmp',file);}
 record(saved,summary,options={}){if(saved.game.phase!=='over')return null;const previous=this.read(saved.id);if(previous&&previous.revision>Number(saved.revision||0))return previous;const data=Data.archive(saved,summary,{...options,previous});const file=this.file(saved.id);fs.mkdirSync(this.dir,{recursive:true,mode:0o700});fs.writeFileSync(file+'.tmp',JSON.stringify(data),{mode:0o600});fs.renameSync(file+'.tmp',file);return data;}
}
module.exports={ArchiveStore};
