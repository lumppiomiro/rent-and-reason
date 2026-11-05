#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const ignored=new Set(['.git','.rent-reason-data','node_modules','coverage','release']);
const allowedTop=new Set(['ai','tests','scripts','docs','assets','.github']);
const allowedExtensions=new Set(['.js','.cjs','.mjs','.css','.html','.md','.json','.svg','.png','.mp3','.yml','.command','.cmd','.sh']);
const special=new Set(['LICENSE','.gitignore','.gitattributes']);
function publicFiles(dir=ROOT){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(ignored.has(e.name)||e.name==='.DS_Store')return[];const full=path.join(dir,e.name),rel=path.relative(ROOT,full);if(e.isSymbolicLink())throw Error('Release contains a symlink: '+rel);if(e.isDirectory()){if(dir===ROOT&&!allowedTop.has(e.name))throw Error('Unexpected public directory: '+rel);return publicFiles(full);}if(e.name.startsWith('.env')||/\.(?:log|tmp|zip)$/.test(e.name))return[];if(!special.has(rel)&&!allowedExtensions.has(path.extname(e.name)))throw Error('Unexpected release file: '+rel);return[rel];}).sort();}
function check(){const files=publicFiles(),issues=[];
 // Only complete product names / private paths are blocked; integration names are valid labels.
 const oldContent=new RegExp(['mono'+'poly','has'+'bro','ren'+'to'+' fortune','board'+'walk','mediter'+'ranean avenue'].join('|'),'i');
 const personal=new RegExp(['mi'+'ro','lump'+'pio','/Users/[^/\\s]+','/home/[^/\\s]+'].join('|'),'i');
 const secret=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-or-v1-|sk-proj-|github_pat_|ghp_)[A-Za-z0-9_\-]{32,}/;
 for(const rel of files){if(/(?:^|\/)(?:table|characters|trophies)\.json$|(?:^|\/)[^/]+-(?:key|connection)\.json$|(?:^|\/)(?:backups|matches|audit)\//.test(rel))issues.push(rel+': runtime data');if(/\.(?:png|mp3)$/.test(rel))continue;const body=fs.readFileSync(path.join(ROOT,rel),'utf8');if(oldContent.test(body))issues.push(rel+': excluded board / brand content');if(rel!=='scripts/check-release.cjs'&&personal.test(body))issues.push(rel+': personal name or machine path');if(secret.test(body))issues.push(rel+': possible credential');}
 for(const needed of ['README.md','LICENSE','NOTICES.md','index.html','boards.js','harbor.css','assets/brand/lantern.svg'])if(!files.includes(needed))issues.push('Missing '+needed);
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');if(/\/\* (?:APP|ENGINE|BOARDS|ART|STYLES|MODEL_PROVIDERS) \*\//.test(html))issues.push('index.html: unexpanded build marker');if(/<(?:script|link)[^>]+(?:src|href)=["']https?:/i.test(html))issues.push('index.html: remote script/style dependency');
 const git=cp.spawnSync('git',['-C',ROOT,'ls-files','-z'],{encoding:'utf8'});if(git.status===0)for(const f of git.stdout.split('\0').filter(Boolean))if(!files.includes(f))issues.push(f+': tracked file outside the public set');
 if(issues.length)throw Error(issues.join('\n'));
 return{files:files.length,bytes:files.reduce((sum,rel)=>sum+fs.statSync(path.join(ROOT,rel)).size,0)};
}
if(require.main===module){try{const result=check();console.log(`Release check passed: ${result.files} public files, ${(result.bytes/1024/1024).toFixed(2)} MiB. Runtime data and credentials are excluded.`);}catch(e){console.error('Release check failed:\n'+e.message);process.exitCode=1;}}
module.exports={publicFiles,check};
