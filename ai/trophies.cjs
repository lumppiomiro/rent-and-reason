'use strict';
const fs=require('node:fs'),path=require('node:path'),T=require('../trophies.js');
const {ArchiveStore}=require('./archives.cjs');
class TrophyStore{
 constructor(dataDir){this.archives=new ArchiveStore(dataDir);this.file=path.join(dataDir,'trophies.json');this.data=T.empty();try{const data=JSON.parse(fs.readFileSync(this.file,'utf8'));if(data.version!==1||!Array.isArray(data.matches)||!data.matches.every(T.valid))throw Error('Invalid trophy cabinet.');this.data=data;}catch(e){if(e.code!=='ENOENT')throw e;}}
 snapshot(){return structuredClone(this.data);}
 add(record){const next=T.upsert(this.data,record);if(JSON.stringify(next)===JSON.stringify(this.data))return;fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});fs.writeFileSync(this.file+'.tmp',JSON.stringify(next),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);this.data=next;}
 record(saved,options={}){const result=T.match(saved.game,saved.options.players,saved.id);if(!result)return;if(saved.timing)result.timing=structuredClone(saved.timing);for(const e of result.entries)e.eliminatedRound??=saved.matchHistory?.seats?.[e.seat]?.bankruptRound??null;const merged=T.upsert(this.data,result).matches.find(m=>m.id===saved.id);const archive=this.archives.record(saved,merged,options);this.add({...merged,archive:{version:1,bytes:Buffer.byteLength(JSON.stringify(archive)),snapshots:archive.snapshots.length,statistics:archive.statistics.coverage.complete?'complete':'partial'}});}
}
module.exports={TrophyStore};
