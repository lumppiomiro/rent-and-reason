'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {OpenRouterProvider}=require('../ai/openrouter.cjs'),Output=require('../ai/openrouter-budget.cjs');
const {Table}=require('../ai/table.cjs'),{AgentSession,schema}=require('../ai/session.cjs'),{Game}=require('../engine.js'),S=require('../ai/strategy.cjs');
const MODEL='deepseek/test-reasoner',KEY='sk-or-unit-test';
const model={id:MODEL,name:'Test reasoning model',context_length:262144,architecture:{input_modalities:['text'],output_modalities:['text']},top_provider:{max_completion_tokens:65536},supported_parameters:['response_format','structured_outputs','reasoning'],reasoning:{default_enabled:true,supported_efforts:['low','high']},pricing:{prompt:'0.000001',completion:'0.000002'}};
const decision=(id='buy',extra={})=>({type:'act',actionId:id,tool:'',actionIds:[],proposal:null,memory:'Preserve a reserve.',rationale:'An affordable acquisition.',say:'',facts:[],...extra});
const success=(id='buy',extra={})=>({model:MODEL,choices:[{finish_reason:'stop',message:{content:JSON.stringify(decision(id,extra))}}],usage:{prompt_tokens:200,completion_tokens:100,prompt_tokens_details:{cached_tokens:80},completion_tokens_details:{reasoning_tokens:60},cost:.0004}});
const truncated=(limit=16384)=>({model:MODEL,choices:[{finish_reason:'length',message:{content:'{"type":"act","actionId":"surrender"',reasoning:'PRIVATE THOUGHTS MUST NOT ENTER HISTORY'}}],usage:{prompt_tokens:200,completion_tokens:limit,prompt_tokens_details:{cached_tokens:80},completion_tokens_details:{reasoning_tokens:limit-10},cost:.003}});
function provider(responses,override={},options={}){
 const calls=[];let n=0;const p=new OpenRouterProvider({apiKey:KEY,fetchImpl:async(url,request)=>{
  if(url.endsWith('/key'))return Response.json({data:{}});if(url.endsWith('/models/user'))return Response.json({data:[{...model,...override}]});
  const body=JSON.parse(request.body);calls.push({body,signal:request.signal});const response=responses[Math.min(n++,responses.length-1)];return Response.json(typeof response==='function'?await response(body,p):response);
 },...options});return{p,calls};
}
const request=extra=>({model:MODEL,messages:[{role:'system',content:'Stable complete game rules.'},{role:'user',content:'Complete current game state and legal actions.'}],schema:schema(),effort:'low',...extra});
test('generation headroom is independent of effort, while the requested effort is preserved',async()=>{
 const {p,calls}=provider([success()]);for(const effort of ['low','medium','high'])await p.complete(request({effort}));assert.deepEqual(calls.map(c=>c.body.max_tokens),[16384,16384,16384]);assert.deepEqual(calls.map(c=>c.body.reasoning.effort),['low','medium','high']);
 assert.equal(calls[0].body.response_format.json_schema.schema.properties.memory.maxLength,500);assert.equal(calls[0].body.response_format.json_schema.schema.properties.rationale.maxLength,300);
});
test('truncated reasoning recovers once with more room, full context and honest combined usage',async()=>{
 const {p,calls}=provider([truncated(),success()]),progress=[];const original=request({onProgress:v=>progress.push(v)}),result=await p.complete(original);
 assert.equal(calls.length,2);assert.deepEqual(calls.map(c=>c.body.max_tokens),[16384,32768]);assert.deepEqual(calls[1].body.messages.slice(0,-1),original.messages);assert.equal(JSON.stringify(calls[1].body.messages).includes('surrender'),false);assert.equal(JSON.stringify(calls[1].body).includes('PRIVATE THOUGHTS'),false);assert.equal(JSON.stringify(result).includes('PRIVATE THOUGHTS'),false);
 assert.ok(calls.every(c=>c.body.model===MODEL&&c.body.reasoning.effort==='low'));assert.equal(result.usage.requests,2);assert.equal(result.usage.input,400);assert.equal(result.usage.output,16484);assert.equal(result.usage.cached,160);assert.equal(result.usage.reasoningOutput,16434);assert.equal(result.usage.outputRecoveries,1);assert.equal(result.usage.outputLimits,1);assert.equal(result.usage.costReports,2);assert.ok(Math.abs(result.usage.costUsd-.0034)<1e-12);assert.equal(result.usage.attempts.length,2);assert.ok(progress.some(p=>p.phase==='retrying'&&p.attempt===2));
 await p.complete(request());assert.equal(calls[2].body.max_tokens,32768);
});
test('repeated truncation is bounded to two attempts and reports the real cap and all costs',async()=>{
 const {p,calls}=provider([truncated(),truncated(32768)]);await assert.rejects(p.complete(request()),e=>/32,768-token/.test(e.message)&&/one automatic recovery/.test(e.message)&&!/lower thinking effort/.test(e.message)&&e.usage.requests===2&&e.usage.output===49152&&e.usage.outputRecoveries===1&&e.usage.costReports===2);assert.equal(calls.length,2);
});
test('valid complete decision JSON at the output boundary does not incur an unnecessary retry',async()=>{
 const answer=success();answer.choices[0].finish_reason='length';const {p,calls}=provider([answer]);const result=await p.complete(request());assert.equal(JSON.parse(result.text).actionId,'buy');assert.equal(calls.length,1);assert.equal(result.usage.outputRecoveries,0);
 const partial=success();partial.choices[0]={finish_reason:'length',message:{content:'{}'}};const more=provider([partial,success()]);await more.p.complete(request());assert.equal(more.calls.length,2);
});
test('a model or context hard limit prevents a pointless same-size paid retry',async()=>{
 const {p,calls}=provider([truncated(8192)],{top_provider:{max_completion_tokens:8192}});await assert.rejects(p.complete(request()),e=>/8,192-token/.test(e.message)&&/cannot support a larger allowance/.test(e.message));assert.equal(calls.length,1);
 const limited=provider([truncated()],{context_length:32768});await limited.p.list();const r=request({messages:[{role:'user',content:'x'.repeat(60000)}]});await assert.rejects(limited.p.complete(r),/cannot support a larger allowance/);assert.equal(limited.calls.length,1);assert.ok(limited.calls[0].body.max_tokens<16384);
});
test('models advertising direct reasoning budgets reserve output for the final JSON',async()=>{
 const {p,calls}=provider([success()],{reasoning:{supports_max_tokens:true,mandatory:true}});await p.complete(request({effort:'high'}));assert.equal(calls[0].body.reasoning.max_tokens,12288);assert.equal(calls[0].body.reasoning.exclude,true);assert.ok(calls[0].body.max_tokens-calls[0].body.reasoning.max_tokens>=2048);
});
test('short tagged replies have their own headroom and never retry automatically',async()=>{
 const {p,calls}=provider([truncated(8192)]);await assert.rejects(p.complete(request({schema:{type:'object',properties:{say:{type:'string',maxLength:150}},required:['say']},outputLimit:600,recover:false})),e=>/chat reply/.test(e.message)&&!/table is paused/.test(e.message)&&e.usage.requests===1);assert.equal(calls.length,1);assert.equal(calls[0].body.max_tokens,8192);
 const plain=provider([{...success(),choices:[{finish_reason:'stop',message:{content:'{"say":"Hello"}'}}]}],{supported_parameters:['structured_outputs','response_format'],reasoning:undefined});await plain.p.complete(request({outputLimit:600}));assert.equal(plain.calls[0].body.max_tokens,600);
});
test('recovery allowance is shared across calls in the same strategic decision',async()=>{
 const quota={remaining:1},{p,calls}=provider([truncated(),success(),truncated()]);await p.complete(request({recoveryBudget:quota}));assert.equal(quota.remaining,0);p.outputBudgets.clear();await assert.rejects(p.complete(request({recoveryBudget:quota})),/one-retry allowance/);assert.equal(calls.length,3);
 const g=new Game({players:[{type:'openrouter',model:MODEL},{type:'heuristic'}]}),seen=[];
 const session=new AgentSession(0,{type:'openrouter',model:MODEL},{complete:async r=>{seen.push(r.recoveryBudget);if(seen.length===1){r.recoveryBudget.remaining=0;return{text:JSON.stringify(decision('',{type:'analyze',tool:'risk'})),usage:{requests:1}};}assert.equal(r.recoveryBudget.remaining,0);return{text:JSON.stringify(decision('roll')),usage:{requests:1}};}});
 await session.decide(g,S.legalActions(g,0));assert.equal(seen[0],seen[1]);
});
test('Pause aborts recovery, unknown second-call usage is marked incomplete and no third request starts',async()=>{
 const abort=new AbortController(),{p,calls}=provider([truncated(),()=>{abort.abort();return success();}]);await p.list();
 // The mock models an interrupted second HTTP request rather than a server response.
 const fetch=p.fetch;p.fetch=async(url,r)=>{if(url.endsWith('/chat/completions')&&calls.length===1){calls.push({body:JSON.parse(r.body)});abort.abort();throw Error('request cancelled');}return fetch(url,r);};
 await assert.rejects(p.complete(request({signal:abort.signal})),e=>e.name==='AbortError'&&e.usage.requests===2&&e.usage.incomplete===1&&e.usage.outputRecoveries===1&&e.usage.costReports===1);assert.equal(calls.length,2);
});
test('recovery respects the original deadline instead of resetting the timer',async()=>{
 const {p,calls}=provider([truncated()],{}, {timeout:500});await p.list();await assert.rejects(p.complete(request()),/no time for recovery/);assert.equal(calls.length,1);
});
test('rate-limit failures never consume recovery allowance or cause an automatic request',async()=>{
 const {p,calls}=provider([success()]);await p.list();let attempts=0;p.fetch=async()=>{attempts++;return Response.json({error:{message:'rate limited'}},{status:429});};
 const quota={remaining:1};await assert.rejects(p.complete(request({recoveryBudget:quota})),e=>/429/.test(e.message)&&e.usage.requests===1&&e.usage.outputRecoveries===0);assert.equal(attempts,1);assert.equal(quota.remaining,1);assert.equal(calls.length,0);
});
test('persistent exhaustion leaves the authoritative board unchanged',async t=>{
 const {p}=provider([truncated(),truncated(32768)]);await p.list();const table=new Table({players:[{type:'openrouter',model:MODEL,name:'DeepSeek',effort:'low'},{type:'heuristic',name:'Bot'}]},{openrouter:p});t.after(()=>table.dispose());table.game.roll([1,2]);const before=JSON.stringify(table.game.s);await table.step();assert.equal(JSON.stringify(table.game.s),before);assert.equal(table.running,false);assert.match(table.error,/32,768-token/);assert.equal(table.sessions.get(0).metrics.calls,2);assert.equal(table.sessions.get(0).metrics.decisions,0);
});
test('the actual table commits only the completed legal move and persists combined recovery metrics',async t=>{
 const {p,calls}=provider([truncated(),success()]);await p.list();let saved;
 const table=new Table({players:[{type:'openrouter',model:MODEL,name:'DeepSeek',effort:'low'},{type:'heuristic',name:'Bot'}]},{openrouter:p},{persist:d=>saved=structuredClone(d)});t.after(()=>table.dispose());table.game.roll([1,2]);assert.equal(table.game.s.phase,'buy');await table.step();assert.equal(table.error,null);assert.equal(table.game.s.props[3].owner,0);assert.equal(table.game.s.players[0].out,false);assert.equal(table.sessions.get(0).metrics.calls,2);assert.equal(table.sessions.get(0).metrics.decisions,1);assert.equal(table.sessions.get(0).metrics.outputRecoveries,1);assert.equal(table.status().modelUsage[0].total,16884);assert.equal(calls.length,2);
 const resumed=new Table(null,{openrouter:p},{saved});t.after(()=>resumed.dispose());assert.equal(resumed.sessions.get(0).metrics.outputRecoveries,1);assert.equal(resumed.sessions.get(0).metrics.output,16484);
});
test('OpenRouter context planning reserves generation space before history fills a small window',()=>{
 const {p}=provider([success()]);p.catalog=[{id:MODEL,contextLength:32768,maxOutput:32768}];assert.equal(p.inputLimit(MODEL),14336);const format=Output.compactSchema(schema());assert.equal(format.properties.say.maxLength,240);
});
