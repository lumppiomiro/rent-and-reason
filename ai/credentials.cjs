'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
class CredentialStore{
 constructor({dataDir,platform=process.platform,run=execFileSync,name='openrouter'}={}){
  if(!/^[a-z][a-z0-9-]{0,31}$/.test(name))throw Error('Invalid credential store name.');
  this.service='com.rent-reason-offline.'+name;this.label=name==='openrouter'?'OpenRouter':name;
  this.file=dataDir?path.join(dataDir,name+'-key.json'):null;this.platform=platform;this.run=run;this.memory='';
  this.kind=!this.file?'memory':platform==='darwin'?'macos-keychain':'private-file';
  this.account=createHash('sha256').update(path.resolve(dataDir||'.')).digest('hex').slice(0,32);
 }
 security(args,input){
  try{return this.run('/usr/bin/security',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000,maxBuffer:32768}).trimEnd();}
  catch(e){if(e.status===44)return null;throw Error('macOS Keychain is unavailable or access was denied. Unlock your login keychain and try again.');}
 }
 readKeychain(){return this.security(['find-generic-password','-a',this.account,'-s',this.service,'-w']);}
 load(){
  if(!this.file)return this.memory;
  let saved;try{saved=JSON.parse(fs.readFileSync(this.file,'utf8'));}catch(e){if(e.code==='ENOENT')return'';throw Error('Unable to read the saved key settings.');}
  if(saved.storage==='macos-keychain'){
   if(this.platform!=='darwin')throw Error('This key belongs to macOS Keychain. Save a key on this computer.');
   const key=this.readKeychain();if(!key)throw Error('The saved key is missing from macOS Keychain. Paste it again.');return key;
  }
  if(typeof saved.apiKey!=='string')throw Error('Invalid saved key settings.');
  if(this.kind==='macos-keychain'&&saved.apiKey)this.save(saved.apiKey); // Migrate the previous file after verifying Keychain storage.
  return saved.apiKey;
 }
 writeSettings(value){
  fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});const tmp=this.file+'.'+randomUUID()+'.tmp';
  try{fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600,flag:'wx'});fs.renameSync(tmp,this.file);}finally{fs.rmSync(tmp,{force:true});}
  fs.rmSync(this.file+'.tmp',{force:true});
 }
 save(key){
  if(!this.file){this.memory=key;return;}
  if(this.kind==='macos-keychain'){
   if(key){
    // Hex travels over stdin, never argv, shell history or an inherited environment.
    // Interactive security can exit successfully after a failed command: read back to verify.
    this.security(['-q','-i'],`add-generic-password -U -a ${this.account} -s ${this.service} -l "Rent & Reason ${this.label} API key" -X ${Buffer.from(key,'utf8').toString('hex')}\n`);
    if(this.readKeychain()!==key)throw Error('macOS Keychain did not save the key. Unlock your login keychain and retry.');
    this.writeSettings({version:2,storage:'macos-keychain'});
   }else{this.security(['delete-generic-password','-a',this.account,'-s',this.service]);fs.rmSync(this.file,{force:true});fs.rmSync(this.file+'.tmp',{force:true});}
  }else if(key)this.writeSettings({apiKey:key});
  else{fs.rmSync(this.file,{force:true});fs.rmSync(this.file+'.tmp',{force:true});}
 }
}
module.exports={CredentialStore};
