#!/usr/bin/env node
'use strict';
const path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
if(Number(process.versions.node.split('.')[0])<22){console.error('Rent & Reason requires Node.js 22 or newer. Download it from https://nodejs.org/');process.exit(1);}
const port=Number(process.env.RENT_REASON_PORT||8790);
if(!Number.isInteger(port)||port<1||port>65535){console.error('RENT_REASON_PORT must be a whole number between 1 and 65535.');process.exit(1);}
const built=spawnSync(process.execPath,[path.join(__dirname,'build.mjs')],{cwd:__dirname,stdio:'inherit'});
if(built.status!==0)process.exit(built.status||1);
const {createHost}=require('./server.cjs'),host=createHost();
host.server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is already in use. Choose another RENT_REASON_PORT; this launcher did not replace the running app.`:e.message);host.server.close();host.server.closeAllConnections();process.exitCode=1;});
host.server.listen(port,'127.0.0.1',()=>{
 const url=`http://127.0.0.1:${port}`;
 console.log(`\nRent & Reason · Lantern Harbor\n${url}\n\nKeep this terminal open. Press Control-C to stop.\nSaves stay in this folder's .rent-reason-data directory.\nLocal bots need no account or API key. Optional AI providers use your own setup.\n`);
 if(process.env.RENT_REASON_OPEN_BROWSER==='0')return;
 const [bin,args]=process.platform==='darwin'?['open',[url]]:process.platform==='win32'?['rundll32',['url.dll,FileProtocolHandler',url]]:['xdg-open',[url]];
 const child=spawn(bin,args,{stdio:'ignore'});child.on('error',()=>console.log('Open the address above in your browser.'));child.unref();
});
let stopping=false;function stop(){if(stopping)return;stopping=true;host.server.close();host.server.closeAllConnections();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
