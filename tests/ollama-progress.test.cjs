'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {OllamaProvider}=require('../ai/providers.cjs'),{AgentSession}=require('../ai/session.cjs'),{Table}=require('../ai/table.cjs'),{Game}=require('../engine.js'),S=require('../ai/strategy.cjs');
const answer={type:'act',actionId:'roll',tool:'',actionIds:[],memory:'Preserve cash.',rationale:'Roll.',say:'',proposal:null};
function stream(frames,signal,{hang=false,split=false}={}){
 let keepAlive;
 return new Response(new ReadableStream({start(c){
  // A real pending fetch has a socket. Keep the hanging mock alive too:
  // AbortSignal.timeout uses an unreferenced timer on supported Node versions.
  if(hang)keepAlive=setInterval(()=>{},1000);
  const abort=()=>{clearInterval(keepAlive);c.error(signal.reason);};signal.addEventListener('abort',abort,{once:true});
  for(const f of frames){const bytes=new TextEncoder().encode(JSON.stringify(f)+'\n');if(split)for(const b of bytes)c.enqueue(Uint8Array.of(b));else c.enqueue(bytes);}
  if(!hang){signal.removeEventListener('abort',abort);c.close();}
 },cancel(){clearInterval(keepAlive);}}));
}
const request={model:'qwen3.5:9b',messages:[{role:'system',content:'Stable rules'}],schema:{type:'object'},effort:'medium'};
test('Ollama streams progress while keeping private reasoning out of status and the final decision',async()=>{
 const progress=[],text=JSON.stringify({...answer,say:'Café ♟'});let sent;
 const p=new OllamaProvider({fetchImpl:async(url,opts)=>{sent=JSON.parse(opts.body);return stream([{message:{thinking:'Secret plan ♟'}},{message:{content:text.slice(0,20)}},{message:{content:text.slice(20)}},{done:true,done_reason:'stop',message:{},prompt_eval_count:100,prompt_eval_cached_count:80,eval_count:30,total_duration:1e6}],opts.signal,{split:true});}});
 const r=await p.complete({...request,onProgress:x=>progress.push(x)});assert.equal(sent.stream,true);assert.equal(r.text,text);assert.equal(r.usage.input,100);assert.equal(r.usage.output,30);assert.equal(r.usage.cached,80);assert.equal(progress[0].phase,'preparing');assert.ok(progress.some(p=>p.phase==='reasoning'));assert.equal(progress.at(-1).phase,'answering');assert.equal(progress.at(-1).reasoningCharacters,'Secret plan ♟'.length);assert.equal(JSON.stringify(progress).includes('Secret plan'),false);assert.equal(r.text.includes('Secret plan'),false);
});
test('a cut-off Ollama stream cannot become a move, and unknown consumed tokens are marked incomplete',async()=>{
 const p=new OllamaProvider({fetchImpl:async(url,opts)=>stream([{message:{content:JSON.stringify(answer)}}],opts.signal)});
 await assert.rejects(p.complete(request),e=>{assert.match(e.message,/before completing/);assert.equal(e.usage.incomplete,1);assert.equal(e.usage.output,0);return true;});
});
test('stream error frames pause rather than accepting an earlier partial decision',async()=>{
 const p=new OllamaProvider({fetchImpl:async(url,opts)=>stream([{message:{content:'{"type":'}},{error:'runner failed'}],opts.signal)});await assert.rejects(p.complete(request),/runner failed/);
});
test('one Ollama wall-clock budget covers output expansion instead of restarting the timeout',async()=>{
 let calls=0,secondAborted=false;const started=Date.now();
 const p=new OllamaProvider({timeout:75,fetchImpl:async(url,opts)=>{
  if(++calls===1)return stream([{done:true,done_reason:'length',message:{thinking:'private'},prompt_eval_count:100,eval_count:8000}],opts.signal);
  opts.signal.addEventListener('abort',()=>secondAborted=true,{once:true});return stream([{message:{thinking:'still thinking'}}],opts.signal,{hang:true});
 }});
 // This explicit deadline comes from AgentSession and must override a provider
 // request timeout; otherwise each recovery would receive a fresh budget.
 await assert.rejects(p.complete({...request,deadline:started+40}),e=>{assert.match(e.message,/total decision limit/);assert.equal(e.usage.requests,2);assert.equal(e.usage.output,8000);assert.equal(e.usage.incomplete,1);return true;});assert.equal(secondAborted,true);
});
test('Pause aborts a streaming generation without starting a retry',async()=>{
 const abort=new AbortController();let calls=0;
 const p=new OllamaProvider({fetchImpl:async(url,opts)=>{calls++;const r=stream([{message:{thinking:'hidden'}}],opts.signal,{hang:true});setImmediate(()=>abort.abort());return r;}});
 await assert.rejects(p.complete({...request,signal:abort.signal}),e=>e.name==='AbortError'&&e.usage.incomplete===1);assert.equal(calls,1);
});
test('Low effort disables optional Qwen thinking; medium / high preserve it',async()=>{
 const sent=[],p=new OllamaProvider({fetchImpl:async(url,opts)=>{sent.push(JSON.parse(opts.body));return{ok:true,json:async()=>({message:{content:JSON.stringify(answer)}})};}});
 for(const effort of ['low','medium','high'])await p.complete({...request,effort});assert.deepEqual(sent.map(s=>s.think),[false,true,true]);assert.deepEqual(sent.map(s=>s.options.num_predict),[4000,8000,12000]);
});
test('analysis, validation repair and retries share a deadline; progress labels identify each call',async()=>{
 const deadlines=[],progress=[],p={timeout:12345,forget(){},async complete(r){deadlines.push(r.deadline);r.onProgress({phase:'reasoning',reasoningCharacters:10});return{text:JSON.stringify(deadlines.length===1?{...answer,type:'analyze',tool:'risk',actionId:''}:deadlines.length===2?{}:answer),usage:{input:100,output:20}};}};
 const g=new Game(),session=new AgentSession(0,{type:'ollama',model:'test'},p);await session.decide(g,S.legalActions(g,0),{onProgress:x=>progress.push(x)});assert.equal(deadlines.length,3);assert.ok(deadlines.every(d=>d===deadlines[0]));assert.deepEqual(progress.map(p=>p.call),[1,2,3]);
});
test('host status exposes safe progress, ignores late callbacks after Pause and preserves the game',async()=>{
 let finish,report;const p={forget(){},complete:r=>{report=r.onProgress;report({phase:'reasoning',reasoningCharacters:123});return new Promise(resolve=>finish=resolve);}};
 const t=new Table({players:[{type:'ollama',model:'test'},{type:'heuristic'}]},{ollama:p});t.game.player.inJail=true;const before=JSON.stringify(t.game.s),pending=t.step();assert.equal(t.status().thinking.progress.reasoningCharacters,123);t.pause();report({phase:'answering',answerCharacters:500});assert.equal(t.status().thinking,null);finish({text:JSON.stringify(answer)});await pending;assert.equal(JSON.stringify(t.game.s),before);t.dispose();
});
test('existing game effort can change only while paused, without losing holdings, memory or token totals',()=>{
 let saved;const p={forget(){}};const t=new Table({players:[{type:'human'},{type:'ollama',model:'qwen3.5:9b',effort:'medium'}]},{ollama:p},{persist:d=>saved=structuredClone(d)});t.game.s.props[1].owner=1;const s=t.sessions.get(1);s.memory='Build brown evenly.';s.metrics.input=1234;s.last={};
 t.running=true;assert.throws(()=>t.setEfforts({revision:0,efforts:['medium','low']}),/Pause/);t.running=false;assert.throws(()=>t.setEfforts({revision:5,efforts:['medium','low']}),/changed/);assert.throws(()=>t.setEfforts({revision:0,efforts:['medium','invalid']}),/valid effort/);
 t.setEfforts({revision:0,efforts:['medium','low']});assert.equal(t.game.s.props[1].owner,1);assert.equal(s.memory,'Build brown evenly.');assert.equal(s.metrics.input,1234);assert.equal(s.last,null);assert.equal(t.options.players[1].effort,'low');assert.equal(t.game.s.controllers[1].effort,'low');assert.equal(t.revision,1);const restored=new Table(null,{ollama:p},{saved});assert.equal(restored.options.players[1].effort,'low');assert.equal(restored.sessions.get(1).memory,s.memory);assert.equal(restored.game.s.props[1].owner,1);t.dispose();restored.dispose();
});
