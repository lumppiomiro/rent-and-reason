'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {PassThrough}=require('node:stream');
const {CredentialStore}=require('../ai/credentials.cjs');
const {OpenRouterProvider}=require('../ai/openrouter.cjs');
const {promptSecret}=require('../setup-openrouter.cjs');
const KEY='sk-or-v1-secret-for-unit-tests';
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rent-reason-credentials-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function keychain(){const items=new Map(),calls=[];let failWrites=false;
 return{calls,items,set failWrites(v){failWrites=v;},run(binary,args,options){calls.push({binary,args,options});
  if(args.includes('-i')){const m=options.input.match(/-a ([a-f0-9]+).* -X ([a-f0-9]+)\n/);assert.ok(m);if(!failWrites)items.set(m[1],Buffer.from(m[2],'hex').toString('utf8'));return'';}
  const account=args[args.indexOf('-a')+1];if(!items.has(account)){const e=Error('not found');e.status=44;throw e;}
  if(args[0]==='delete-generic-password'){items.delete(account);return'';}return items.get(account)+'\n';
 }};
}
test('macOS stores the secret in Keychain and only a nonsecret marker on disk; future sessions reuse it',t=>{
 const dir=temp(t),mock=keychain(),store=new CredentialStore({dataDir:dir,platform:'darwin',run:mock.run});assert.equal(store.load(),'');assert.equal(mock.calls.length,0);
 store.save(KEY);const marker=fs.readFileSync(store.file,'utf8');assert.equal(marker.includes(KEY),false);assert.deepEqual(JSON.parse(marker),{version:2,storage:'macos-keychain'});assert.equal(fs.statSync(store.file).mode&0o777,0o600);
 assert.equal(new CredentialStore({dataDir:dir,platform:'darwin',run:mock.run}).load(),KEY);assert.ok(mock.calls.every(c=>c.binary==='/usr/bin/security'&&!JSON.stringify(c.args).includes(KEY)));
 const write=mock.calls.find(c=>c.args.includes('-i'));assert.equal(write.options.input.includes(KEY),false);assert.equal(write.args.includes('-A'),false);assert.deepEqual(write.options.stdio,['pipe','pipe','pipe']);
 store.save('');assert.equal(fs.existsSync(store.file),false);assert.equal(mock.items.size,0);
});
test('legacy plaintext files migrate only after verified Keychain storage, without leaving a plaintext backup',t=>{
 const dir=temp(t),mock=keychain(),store=new CredentialStore({dataDir:dir,platform:'darwin',run:mock.run});fs.writeFileSync(store.file,JSON.stringify({apiKey:KEY}));fs.writeFileSync(store.file+'.tmp',JSON.stringify({apiKey:KEY}));
 assert.equal(store.load(),KEY);assert.equal(JSON.stringify(fs.readdirSync(dir).map(f=>fs.readFileSync(path.join(dir,f),'utf8'))).includes(KEY),false);assert.equal(fs.existsSync(store.file+'.tmp'),false);
});
test('Keychain denial does not silently fall back to a plaintext file or expose errors containing secrets',t=>{
 const dir=temp(t),store=new CredentialStore({dataDir:dir,platform:'darwin',run(){throw Error(KEY);}});assert.throws(()=>store.save(KEY),e=>/Keychain/.test(e.message)&&!e.message.includes(KEY));assert.equal(fs.existsSync(store.file),false);
 fs.writeFileSync(store.file,JSON.stringify({apiKey:KEY}));assert.throws(()=>store.load(),/Keychain/);assert.equal(JSON.parse(fs.readFileSync(store.file)).apiKey,KEY);
});
test('a successful interactive CLI exit still needs read-back verification before discarding the old file',t=>{
 const dir=temp(t),mock=keychain();mock.failWrites=true;const store=new CredentialStore({dataDir:dir,platform:'darwin',run:mock.run});fs.writeFileSync(store.file,JSON.stringify({apiKey:KEY}));assert.throws(()=>store.load(),/did not save/);assert.equal(JSON.parse(fs.readFileSync(store.file)).apiKey,KEY);
});
test('provider restores Keychain credentials automatically without putting them in its public configuration',async t=>{
 const dir=temp(t),mock=keychain(),store=new CredentialStore({dataDir:dir,platform:'darwin',run:mock.run});
 const first=new OpenRouterProvider({apiKey:'',credentialStore:store,fetchImpl:async()=>Response.json({data:{}})});await first.configure(KEY);assert.deepEqual(first.configuration,{configured:true,environment:false,storage:'macos-keychain'});
 const next=new OpenRouterProvider({apiKey:'',credentialStore:new CredentialStore({dataDir:dir,platform:'darwin',run:mock.run})});assert.equal(next.key,KEY);assert.equal(JSON.stringify(next.configuration).includes(KEY),false);
});
test('one-time Terminal setup hides pasted key text and handles cancellation',async()=>{
 const input=new PassThrough();input.isTTY=true;const output=new PassThrough();let visible='';output.on('data',chunk=>visible+=chunk);
 const pending=promptSecret(input,output);input.write(KEY+'\n');assert.equal(await pending,KEY);assert.equal(visible.includes(KEY),false);assert.match(visible,/hidden/);
 const second=new PassThrough();second.isTTY=true;const cancelled=promptSecret(second,output);second.write('\u0003');await assert.rejects(cancelled,/cancelled/);
});
test('table setup reports backend status without a credential form or credential write action',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../ai-ui.js'),'utf8');
 const context=vm.createContext({document:{addEventListener(){}},esc:s=>String(s)});vm.runInContext(source,context);
 vm.runInContext("aiHost={providers:['ollama','codex','claude']};providerInfo={};",context);
 assert.equal(vm.runInContext('supportsOpenRouter()',context),false);assert.match(vm.runInContext('openRouterConnectionNotice()',context),/press Control-C/);
 vm.runInContext("aiHost.providers.push('openrouter');providerInfo={openrouter:{available:true,models:[{id:'model'}]}};",context);
 assert.equal(vm.runInContext('supportsOpenRouter()',context),true);assert.equal(vm.runInContext('openRouterConnectionNotice()',context),'');
 assert.equal(source.includes('openrouter-key'),false);assert.equal(source.includes('ai-openrouter-save'),false);assert.equal(source.includes('openRouterSettings'),false);
 vm.runInContext("providerInfo.openrouter={available:false,error:'Backend key could not be loaded.'};",context);assert.match(vm.runInContext('openRouterConnectionNotice()',context),/Backend key could not be loaded/);
});
