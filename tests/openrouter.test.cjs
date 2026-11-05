'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {OpenRouterProvider}=require('../ai/openrouter.cjs');
const {CredentialStore}=require('../ai/credentials.cjs');
const {AgentSession}=require('../ai/session.cjs');
const {Table}=require('../ai/table.cjs');
const {Game}=require('../engine.js');
const S=require('../ai/strategy.cjs'),Social=require('../ai/social.cjs'),Usage=require('../usage.js');
const {createHost}=require('../server.cjs');
const KEY='sk-or-v1-unit-test-secret';
const models=[{id:'test/smart',name:'Smart test',supported_parameters:['structured_outputs','response_format','reasoning'],context_length:65536,top_provider:{max_completion_tokens:16000},architecture:{input_modalities:['text'],output_modalities:['text']},pricing:{prompt:'0.0000001',completion:'0.0000003',input_cache_read:'0.00000005'}},{id:'test/plain',supported_parameters:['response_format']},{id:'test/image',supported_parameters:['structured_outputs'],architecture:{output_modalities:['image']}}];
const decision={type:'act',actionId:'roll',tool:'',actionIds:[],proposal:null,memory:'Save cash for development.',rationale:'Acquire property.',say:'',facts:[]};
const answer={model:'test/smart',choices:[{finish_reason:'stop',message:{content:JSON.stringify(decision)}}],usage:{prompt_tokens:100,completion_tokens:80,prompt_tokens_details:{cached_tokens:40,cache_write_tokens:10},completion_tokens_details:{reasoning_tokens:60},cost:.000028}};
function mock(){const calls=[];return{calls,fetch:async(url,o)=>{calls.push({url,...o});return Response.json(url.endsWith('/key')?{data:{label:'private account data'}}:url.endsWith('/models/user')?{data:models}:answer);}};}
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rent-reason-openrouter-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('OpenRouter validates, privately persists and removes a key without returning its value',async t=>{
 const dir=temp(t),m=mock(),p=new OpenRouterProvider({dataDir:dir,credentialStore:new CredentialStore({dataDir:dir,platform:'linux'}),apiKey:'',fetchImpl:m.fetch});assert.equal(p.configuration.configured,false);
 assert.deepEqual(await p.configure(KEY),{configured:true,environment:false,storage:'private-file'});assert.equal(m.calls[0].url,'https://openrouter.ai/api/v1/key');
 const file=path.join(dir,'openrouter-key.json');assert.equal(fs.statSync(file).mode&0o777,0o600);assert.equal(JSON.parse(fs.readFileSync(file)).apiKey,KEY);
 const restored=new OpenRouterProvider({dataDir:dir,credentialStore:new CredentialStore({dataDir:dir,platform:'linux'}),apiKey:'',fetchImpl:m.fetch});assert.equal(restored.configuration.configured,true);assert.equal(JSON.stringify(restored.configuration).includes(KEY),false);
 await restored.configure('');assert.equal(fs.existsSync(file),false);assert.equal(restored.configuration.configured,false);await assert.rejects(restored.list(),/OpenRouter is not connected/);
});
test('invalid replacements keep the prior key; upstream errors never expose credentials',async t=>{
 const dir=temp(t),m=mock(),p=new OpenRouterProvider({dataDir:dir,credentialStore:new CredentialStore({dataDir:dir,platform:'linux'}),apiKey:'',fetchImpl:m.fetch});await p.configure(KEY);
 p.fetch=async()=>new Response('bad key '+KEY,{status:401});await assert.rejects(p.configure('bad'),e=>/401/.test(e.message)&&!e.message.includes(KEY));assert.equal(p.key,KEY);assert.equal(JSON.parse(fs.readFileSync(p.file)).apiKey,KEY);
 await assert.rejects(p.configure('key with whitespace'),/valid OpenRouter/);await assert.rejects(p.configure('x'.repeat(1025)),/valid OpenRouter/);
 const env=new OpenRouterProvider({apiKey:KEY,fetchImpl:m.fetch});assert.equal(env.configuration.environment,true);await assert.rejects(env.configure(''),/environment variable/);
});
test('OpenRouter discovers only structured text models and converts live token prices',async()=>{
 const m=mock(),p=new OpenRouterProvider({apiKey:KEY,fetchImpl:m.fetch});const list=await p.list();assert.equal(list.length,1);assert.equal(list[0].id,'test/smart');assert.ok(Math.abs(list[0].pricing.input-.1)<1e-12);assert.equal(list[0].pricing.output,.3);assert.ok(Math.abs(list[0].pricing.cached-.05)<1e-12);assert.equal(JSON.stringify(list).includes(KEY),false);assert.equal(JSON.stringify(list).includes('private account'),false);
});
test('a running backend picks up saved, replaced and removed credentials without a host restart',async t=>{
 const dir=temp(t),m=mock(),store=new CredentialStore({dataDir:dir,platform:'linux'}),p=new OpenRouterProvider({apiKey:'',credentialStore:store,fetchImpl:m.fetch});
 await assert.rejects(p.list(),/OpenRouter is not connected/);store.save(KEY);assert.equal((await p.list()).length,1);assert.equal(m.calls.at(-1).headers.Authorization,'Bearer '+KEY);
 store.save('sk-or-v1-replacement');await p.complete({model:'test/smart',messages:[],schema:{}});assert.equal(m.calls.at(-1).headers.Authorization,'Bearer sk-or-v1-replacement');assert.equal(m.calls.at(-2).url.endsWith('/models/user'),true);
 store.save('');const count=m.calls.length;await assert.rejects(p.complete({model:'test/smart',messages:[],schema:{}}),/OpenRouter is not connected/);assert.equal(m.calls.length,count);assert.equal(p.catalog.length,0);
});
test('an empty compatible catalog reports a useful discovery error rather than a connected provider with no models',async()=>{
 const p=new OpenRouterProvider({apiKey:KEY,fetchImpl:async()=>Response.json({data:[]})});await assert.rejects(p.list(),/no compatible text models/);
});
test('a damaged key file can be repaired without preventing the host from starting',async t=>{
 const dir=temp(t);fs.writeFileSync(path.join(dir,'openrouter-key.json'),'broken JSON');const m=mock(),p=new OpenRouterProvider({dataDir:dir,credentialStore:new CredentialStore({dataDir:dir,platform:'linux'}),apiKey:'',fetchImpl:m.fetch});await assert.rejects(p.list(),/Model connections/);await p.configure(KEY);assert.equal((await p.list()).length,1);
});
test('context overflow and expired decisions stop before any paid request is sent',async()=>{
 const m=mock(),p=new OpenRouterProvider({apiKey:KEY,fetchImpl:m.fetch});await p.list();await assert.rejects(p.complete({model:'test/smart',messages:[{role:'user',content:'x'.repeat(200000)}],schema:{}}),/larger context window/);
 await assert.rejects(p.complete({model:'test/smart',messages:[],schema:{},deadline:Date.now()-1}),/time limit/);assert.equal(m.calls.filter(c=>c.url.endsWith('/chat/completions')).length,0);
});
test('OpenRouter submits exact model, stable messages and strict schema; records usage without double-counting reasoning',async()=>{
 const m=mock(),p=new OpenRouterProvider({apiKey:KEY,fetchImpl:m.fetch}),messages=[{role:'system',content:'Stable rules'},{role:'user',content:'Current state'}],schema={type:'object',properties:{say:{type:'string'}},required:['say'],additionalProperties:false};
 const result=await p.complete({model:'test/smart',messages,schema,effort:'high'});const req=m.calls.at(-1),body=JSON.parse(req.body);
 assert.equal(req.url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(req.headers.Authorization,'Bearer '+KEY);assert.equal(req.redirect,'error');assert.equal(req.signal.aborted,false);assert.deepEqual(body.messages,messages);assert.deepEqual(body.response_format.json_schema.schema,{...schema,properties:{say:{type:'string',maxLength:240}}});assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.provider.require_parameters,true);assert.equal(body.model,'test/smart');assert.equal(body.models,undefined);assert.equal(body.max_tokens,16000);assert.deepEqual(body.reasoning,{effort:'high',exclude:true});assert.equal(req.body.includes(KEY),false);
 assert.equal(result.usage.input,100);assert.equal(result.usage.output,80);assert.equal(result.usage.cached,40);assert.equal(result.usage.cacheWrite,10);assert.equal(result.usage.costUsd,.000028);assert.equal(result.usage.costReports,1);assert.equal(result.usage.requests,1);assert.equal(JSON.stringify(result).includes(KEY),false);
});
test('OpenRouter rejects unavailable models before inference and respects an explicit no-recovery request',async()=>{
 const m=mock(),p=new OpenRouterProvider({apiKey:KEY,fetchImpl:m.fetch});await p.list();await assert.rejects(p.complete({model:'test/plain',messages:[],schema:{}}),/structured decisions/);assert.equal(m.calls.filter(c=>c.url.endsWith('/chat/completions')).length,0);
 p.fetch=async()=>Response.json({...answer,choices:[{finish_reason:'length',message:{content:'{'}}]});await assert.rejects(p.complete({model:'test/smart',messages:[],schema:{},recover:false}),e=>/Automatic recovery is disabled/.test(e.message)&&e.usage.costReports===1&&e.usage.output===80);
 p.fetch=async()=>Response.json({choices:[{finish_reason:'content_filter',message:{content:''}}]});await assert.rejects(p.complete({model:'test/smart',messages:[],schema:{}}),e=>/complete decision/.test(e.message)&&e.usage.incomplete===1);
});
test('OpenRouter cancellation stops inference and reports incomplete usage without leaking fetch errors',async()=>{
 const m=mock(),p=new OpenRouterProvider({apiKey:KEY,fetchImpl:m.fetch});await p.list();const abort=new AbortController();p.fetch=async(_,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(Error(KEY)),{once:true}));const pending=p.complete({model:'test/smart',messages:[],schema:{},signal:abort.signal});abort.abort();await assert.rejects(pending,e=>e.name==='AbortError'&&e.usage.incomplete===1&&!e.message.includes(KEY));
 p.fetch=async()=>{throw Error(KEY);};await assert.rejects(p.complete({model:'test/smart',messages:[],schema:{}}),e=>!e.message.includes(KEY)&&/internet connection/.test(e.message));
});
test('OpenRouter joins the existing strategy, chat, save/restore and cumulative cost accounting',async t=>{
 const m=mock(),provider=new OpenRouterProvider({apiKey:KEY,fetchImpl:m.fetch}),config={type:'openrouter',model:'test/smart',name:'Router',effort:'low'};
 const game=new Game({players:[config,{type:'heuristic',name:'Bot'}]}),session=new AgentSession(0,config,provider);
 await session.decide(game,S.legalActions(game,0));game.s.players[0].cash-=10;await session.decide(game,S.legalActions(game,0));
 const calls=m.calls.filter(c=>c.url.endsWith('/chat/completions')).map(c=>JSON.parse(c.body));assert.ok(JSON.parse(calls[0].messages.at(-1).content).snapshot);assert.ok(JSON.parse(calls[1].messages.at(-1).content).patch);assert.equal(calls[0].messages[0].content,calls[1].messages[0].content);assert.equal(session.metrics.costReports,2);assert.equal(session.metrics.costUsd,.000056);assert.equal(session.metrics.output,160);
 let save;const table=new Table({players:[config,{type:'heuristic',name:'Bot'}]},{openrouter:provider},{persist:d=>save=structuredClone(d)});t.after(()=>table.dispose());table.sessions.get(0).metrics=session.metrics;table.save();assert.equal(JSON.stringify(save).includes(KEY),false);const resumed=new Table(null,{openrouter:provider},{saved:save});t.after(()=>resumed.dispose());assert.equal(resumed.sessions.get(0).metrics.costUsd,.000056);assert.equal(Game.load(save.game).s.controllers[0].type,'openrouter');assert.deepEqual(Social.mentionTargets('@all',[config,{type:'heuristic'}]),[0]);
 const row=Usage.aggregate([{...session.metrics,id:0,type:'openrouter',model:config.model}])[0];assert.equal(row.costUsd,.000056);assert.ok(Math.abs(row.pricing.input-.1)<1e-12);assert.equal(Usage.estimate(row,row.pricing).cachedDiscountApplied,80);
});
test('HTTP model discovery reloads backend credentials and exports exclude secrets; browser key writes are disabled',{timeout:15000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rent-reason-openrouter-http-')),m=mock(),provider=new OpenRouterProvider({dataDir:dir,credentialStore:new CredentialStore({dataDir:dir,platform:'linux'}),apiKey:'',fetchImpl:m.fetch}),empty={list:async()=>[]};
 const host=createHost({dataDir:dir,providers:{ollama:empty,codex:empty,claude:empty,openrouter:provider}});await new Promise(r=>host.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>{host.server.close(r);host.server.closeAllConnections();});fs.rmSync(dir,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+host.server.address().port,info=await(await fetch(url+'/api/info')).json(),headers={'X-Rent-Reason-Token':info.token,'Content-Type':'application/json'};assert.ok(info.providers.includes('openrouter'));assert.equal(info.localGameHost,true);assert.equal(info.subscriptionOnly,false);assert.equal(info.features.openrouterBackendCredentials,1);
 const post=(route,data,extra={})=>fetch(url+'/api/'+route,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)});
 assert.equal((await post('providers/openrouter',{apiKey:KEY},{'X-Rent-Reason-Token':''})).status,403);assert.equal((await post('providers/openrouter',{apiKey:KEY},{Origin:'https://other.example'})).status,403);assert.equal(provider.configuration.configured,false);
 let response=await post('providers/openrouter',{apiKey:KEY});assert.equal(response.status,404);assert.equal(provider.configuration.configured,false);provider.store.save(KEY);assert.equal((await response.text()).includes(KEY),false);
 const discovery=await(await fetch(url+'/api/providers',{headers})).json();assert.equal(discovery.openrouter.available,true);assert.equal(discovery.openrouter.configuration.configured,true);assert.equal(JSON.stringify(discovery).includes(KEY),false);
 response=await post('table',{players:[{type:'human',name:'You'},{type:'openrouter',name:'Router',model:'test/smart'}]});assert.equal(response.status,200);assert.equal((await response.text()).includes(KEY),false);
 const exported=await(await fetch(url+'/api/export',{headers})).json();assert.equal(exported.options.players[1].type,'openrouter');assert.equal(JSON.stringify(exported).includes(KEY),false);assert.equal((await(await fetch(url+'/api/audit',{headers})).text()).includes(KEY),false);assert.equal((await fetch(url+'/.rent-reason-data/openrouter-key.json',{headers})).status,404);
 assert.equal((await post('import',exported)).status,200);assert.equal((await post('providers/openrouter',{apiKey:''})).status,404);assert.equal(provider.configuration.configured,true);provider.store.save('');const refreshed=await(await fetch(url+'/api/providers?refresh=1',{headers})).json();assert.equal(refreshed.openrouter.available,false);assert.equal(refreshed.openrouter.configuration.configured,false);
});
