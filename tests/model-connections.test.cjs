'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CompatibleProvider,endpoint}=require('../ai/compatible.cjs'),{CredentialStore}=require('../ai/credentials.cjs'),{API,TYPES}=require('../model-providers.js');
const {Game}=require('../engine.js'),{Table}=require('../ai/table.cjs'),{AgentSession}=require('../ai/session.cjs'),S=require('../ai/strategy.cjs'),Social=require('../ai/social.cjs'),Memory=require('../character-memory.js');
const KEY='synthetic-provider-key';const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
function fixture(t,type='compatible',fetchImpl,cleanup=true){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rent-reason-connection-test-'));if(cleanup)t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new CredentialStore({dataDir:dir,platform:'linux',name:type});const p=new CompatibleProvider({type,dataDir:dir,credentialStore:store,fetchImpl:fetchImpl||(async()=>response({data:[{id:'test-chat'},{id:'test-embedding'}]}))});return{p,dir,store};}
test('connection configuration persists each provider separately and never returns saved secrets',async t=>{
 const {p,dir,store}=fixture(t);assert.equal(p.configuration.configured,false);let calls=0;p.fetch=async(url,options)=>{calls++;assert.equal(options.headers.Authorization,'Bearer '+KEY);assert.equal(options.redirect,'error');assert.equal(options.method,'GET');return response({data:[{id:'test-chat'},{id:'image-model'}]});};
 const result=await p.configure({apiKey:KEY,baseUrl:'http://127.0.0.1:1234/v1'});assert.equal(calls,1);assert.equal(result.configured,true);assert.equal(result.hasKey,true);assert.equal(JSON.stringify(result).includes(KEY),false);assert.deepEqual(p.catalog.map(m=>m.id),['test-chat']);assert.equal(fs.statSync(store.file).mode&0o777,0o600);
 const restarted=new CompatibleProvider({type:'compatible',dataDir:dir,credentialStore:store,fetchImpl:p.fetch});assert.equal(restarted.key,KEY);assert.equal(restarted.configuration.baseUrl,'http://127.0.0.1:1234/v1');assert.equal(new CredentialStore({dataDir:dir,platform:'linux',name:'openai'}).load(),'');assert.equal(fs.readFileSync(path.join(dir,'compatible-connection.json'),'utf8').includes(KEY),false);
 p.remove();assert.equal(p.configuration.configured,false);assert.equal(fs.existsSync(store.file),false);
});
test('custom URLs cannot smuggle credentials or redirect secrets; provider presets have fixed destinations',async t=>{
 for(const url of ['file:///secret','http://example.com/v1','https://user:pass@example.com/v1','https://example.com/v1?key=secret','https://example.com/v1#secret','https://example.com/v1/models'])assert.throws(()=>endpoint(url));
 assert.equal(endpoint('http://127.0.0.1:1234/v1/'),'http://127.0.0.1:1234/v1');assert.equal(endpoint('https://models.example/v1'),'https://models.example/v1');
 const {p}=fixture(t,'openai');await assert.rejects(p.configure({apiKey:KEY,baseUrl:'https://other.example/v1'}),/Custom endpoint/);
});
test('failed connection tests preserve a working key and never echo upstream errors',async t=>{
 const {p}=fixture(t);await p.configure({apiKey:KEY,baseUrl:'http://127.0.0.1:1234/v1'});p.fetch=async()=>response({error:{message:KEY}},401);await assert.rejects(p.configure({apiKey:'replacement',baseUrl:'https://other.example/v1'}),e=>e.status===401&&!e.message.includes(KEY));assert.equal(p.key,KEY);assert.equal(p.settings.baseUrl,'http://127.0.0.1:1234/v1');
});
test('manual model IDs only replace unsupported model listing, never authentication failures',async t=>{
 const {p}=fixture(t,'compatible',async()=>response({},404));await p.configure({baseUrl:'http://127.0.0.1:1234/v1',modelIds:'my-model, my-model\nother-model'});assert.deepEqual(p.catalog.map(m=>m.id),['my-model','other-model']);p.fetch=async()=>response({},401);await assert.rejects(p.configure({modelIds:'my-model'}),/key rejected/);
});
test('all API adapters send bounded JSON decisions and report usage without double-counting reasoning',async t=>{
 for(const type of Object.keys(API)){const {p}=fixture(t,type);let sent;p.fetch=async(url,options)=>{if(url.endsWith('/models'))return response({data:[{id:'test-chat'}]});sent=JSON.parse(options.body);return response({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}],usage:{prompt_tokens:100,completion_tokens:20,prompt_tokens_details:{cached_tokens:30},completion_tokens_details:{reasoning_tokens:8}}});};
 await p.configure({apiKey:KEY});const answer=await p.complete({model:'test-chat',messages:[{role:'system',content:'Return JSON.'}],schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},outputLimit:600});assert.equal(answer.usage.output,20);assert.equal(answer.usage.reasoningOutput,8);assert.equal(answer.usage.cached,30);assert.equal(sent.max_completion_tokens||sent.max_tokens,600);assert.equal(sent.stream,false);assert.equal(JSON.stringify(sent).includes(KEY),false);assert.equal(JSON.parse(answer.text).ok,true);
 if(API[type].format==='schema')assert.equal(sent.response_format.type,'json_schema');else assert.equal(sent.response_format.type,'json_object');
 }
});
test('new provider seats participate in strategy, mentions, memory and export/restore without connection settings',async t=>{
 for(const type of Object.keys(API)){const {p}=fixture(t,type);p.catalog=[{id:'test-chat'}];p.complete=async()=>({text:JSON.stringify({type:'act',actionId:'roll',tool:'',actionIds:[],memory:'Keep a cash buffer.',rationale:'Begin this turn.',say:'',facts:[],proposal:null}),usage:{requests:1,input:10,output:10,cached:0}});
 const players=[{type,model:'test-chat',name:'Model Player'},{type:'heuristic',name:'Bot'}],table=new Table({players,preMatch:false},{[type]:p});assert(table.sessions.get(0) instanceof AgentSession);assert.deepEqual(Social.mentionTargets('@all',players),[0]);assert.equal(Memory.definition(players[0]).type,type);
 const decision=await table.sessions.get(0).decide(table.game,S.legalActions(table.game,0),{});assert.equal(decision.action.id,'roll');let saved;table.persistFn=value=>saved=structuredClone(value);table.save();const serialized=JSON.stringify(saved);assert.equal(serialized.includes(KEY),false);assert.equal(serialized.includes('baseUrl'),false);const restored=new Table(null,{[type]:p},{saved});assert.equal(restored.options.players[0].type,type);assert.equal(Game.load(saved.game).s.controllers[0].type,type);restored.dispose();table.dispose();
 }
});
test('host-only connection setup is authenticated, redacted, reusable after restart, and absent from game exports',async t=>{
 const {p,dir}=fixture(t,'compatible',undefined,false);const {createHost}=require('../server.cjs');const empty={list:async()=>[],close(){}};
 const host=createHost({dataDir:dir,providers:{ollama:empty,codex:empty,claude:empty,compatible:p},delay:10});await new Promise(r=>host.server.listen(0,'127.0.0.1',r));t.after(async()=>{host.table?.pause();await new Promise(r=>{host.server.close(r);host.server.closeAllConnections();});fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+host.server.address().port,info=await(await fetch(base+'/api/info')).json();assert(info.providers.includes('compatible'));assert.equal(info.features.modelConnections,1);
 const headers={'X-Rent-Reason-Token':info.token,'Content-Type':'application/json'},post=(data,extra={})=>fetch(base+'/api/connections',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)}),config={type:'compatible',action:'connect',apiKey:KEY,baseUrl:'http://127.0.0.1:1234/v1'};
 assert.equal((await fetch(base+'/api/connections')).status,403);assert.equal((await post(config,{'X-Rent-Reason-Token':''})).status,403);assert.equal((await post(config,{Origin:'https://other.example'})).status,403);assert.equal(p.configuration.configured,false);
 const connected=await post(config);assert.equal(connected.status,200);const result=await connected.json();assert.equal(JSON.stringify(result).includes(KEY),false);assert.deepEqual(result.models.map(m=>m.id),['test-chat']);
 const metadata=await(await fetch(base+'/api/connections',{headers})).json();assert.equal(metadata.providers.length,TYPES.length);assert.equal(JSON.stringify(metadata).includes(KEY),false);assert.equal(metadata.providers.find(p=>p.type==='compatible').configuration.hasKey,true);
 const tableResponse=await fetch(base+'/api/table',{method:'POST',headers,body:JSON.stringify({preMatch:false,players:[{type:'human',name:'You'},{type:'compatible',model:'test-chat',name:'API Player'}]})});assert.equal(tableResponse.status,200);
 const save=await(await fetch(base+'/api/export',{headers})).json();assert.equal(save.options.players[1].type,'compatible');assert.equal(JSON.stringify(save).includes(KEY),false);assert.equal(JSON.stringify(save).includes('baseUrl'),false);assert.equal((await fetch(base+'/.rent-reason-data/compatible-key.json')).status,404);
 host.table.run();const blocked=await post({type:'compatible',action:'remove'});assert.equal(blocked.status,400);assert.equal(p.configuration.configured,true);host.table.pause();assert.equal((await post({type:'compatible',action:'remove'})).status,200);assert.equal(p.configuration.configured,false);
});
test('changing a custom destination never silently forwards an existing key',async t=>{
 const {p}=fixture(t);await p.configure({apiKey:KEY,baseUrl:'https://first.example/v1'});let calls=0;p.fetch=async()=>{calls++;return response({data:[{id:'test-chat'}]});};await assert.rejects(p.configure({baseUrl:'https://second.example/v1'}),/Enter a key for the new server/);assert.equal(calls,0);assert.equal(p.settings.baseUrl,'https://first.example/v1');
});
test('a complete JSON object at the output boundary is returned for host validation; real truncation pauses',async t=>{
 const {p}=fixture(t);await p.configure({baseUrl:'http://127.0.0.1:1234/v1'});p.fetch=async()=>response({choices:[{finish_reason:'length',message:{content:'{"ok":true}'}}],usage:{prompt_tokens:10,completion_tokens:5}});assert.equal((await p.complete({model:'test-chat',messages:[],schema:{}})).text,'{"ok":true}');p.fetch=async()=>response({choices:[{finish_reason:'length',message:{content:'{"ok":'}}],usage:{prompt_tokens:10,completion_tokens:5}});await assert.rejects(p.complete({model:'test-chat',messages:[],schema:{}}),e=>e.status===400&&e.usage.output===5);
});
