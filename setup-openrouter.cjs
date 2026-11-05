#!/usr/bin/env node
'use strict';
const path=require('node:path'),readline=require('node:readline'),{Writable}=require('node:stream');
const {OpenRouterProvider}=require('./ai/openrouter.cjs');
function promptSecret(input=process.stdin,output=process.stdout){
 if(!input.isTTY)throw Error('Open Save OpenRouter Key.command in Terminal to paste your key privately.');
 return new Promise((resolve,reject)=>{
  let hidden=false,settled=false;
  const muted=new Writable({write(chunk,encoding,done){if(!hidden)output.write(chunk,encoding);done();}});
  const rl=readline.createInterface({input,output:muted,terminal:true,historySize:0});
  rl.on('SIGINT',()=>{if(!settled){settled=true;rl.close();output.write('\n');reject(Error('Key setup cancelled.'));}});
  rl.on('close',()=>{if(!settled){settled=true;reject(Error('Key setup cancelled.'));}});
  rl.question('Paste your OpenRouter API key (hidden), then press Return: ',key=>{settled=true;hidden=true;rl.close();output.write('\n');resolve(key.trim());});hidden=true;
 });
}
async function main(){
 const mode=process.argv[2];
 if(mode==='--check'){const provider=new OpenRouterProvider({dataDir:path.join(__dirname,'.rent-reason-data')});const models=await provider.list();console.log(`OpenRouter backend ready: ${models.length} compatible models. No model inference was run.`);return;}
 if(mode==='--remove'){const provider=new OpenRouterProvider({dataDir:path.join(__dirname,'.rent-reason-data'),apiKey:''});await provider.configure('');console.log('Saved OpenRouter key removed. Refresh providers to reload the backend.');return;}
 if(mode)throw Error('Use --check, --remove, or no arguments for the hidden key prompt.');
 console.log('Save your OpenRouter key once. It will be reused for future games.');
 const key=await promptSecret();if(!key)throw Error('No key entered. Nothing was saved.');
 const provider=new OpenRouterProvider({dataDir:path.join(__dirname,'.rent-reason-data'),apiKey:''});
 console.log('Checking the key with OpenRouter (no model call or API charge)…');await provider.configure(key);
 console.log(provider.configuration.storage==='macos-keychain'?'Saved in macOS Keychain.':'Saved in a local file readable only by your user account.');
 console.log('Use Refresh providers in the game to load the saved key and model catalog. An older host without OpenRouter support needs one restart.');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={promptSecret};
