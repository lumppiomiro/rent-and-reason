'use strict';
const {CredentialStore}=require('./credentials.cjs');
const Compatibility=require('../model-compatibility.js');
const Output=require('./openrouter-budget.cjs');
const BASE='https://openrouter.ai/api/v1';
const amount=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:0;
class OpenRouterProvider{
 constructor({dataDir,apiKey=process.env.OPENROUTER_API_KEY||'',fetchImpl=fetch,timeout=180000,credentialStore}={}){
  this.fetch=fetchImpl;this.timeout=timeout;this.environment=!!apiKey;this.key=apiKey.trim();this.store=credentialStore||new CredentialStore({dataDir});this.file=this.store.file;this.catalog=[];this.outputBudgets=new Map();
  if(!this.environment)this.reloadCredential();
 }
 reloadCredential(){
  if(this.environment)return;
  try{const key=this.store.load();if(key!==this.key)this.catalog=[];this.key=key;this.keyError=null;}
  catch{this.key='';this.catalog=[];this.keyError='Unable to read the saved OpenRouter key. Unlock macOS Keychain or reconnect it in Model connections.';}
 }
 get configuration(){return{configured:!!this.key,environment:this.environment,storage:this.environment?'environment':this.store.kind};}
 async request(route,{key=this.key,body,signal,deadline=Date.now()+this.timeout}={}){
  if(!key)throw Error(this.keyError||'OpenRouter is not connected. Open Model connections to add your key.');
  if(Date.now()>=deadline)throw Error('OpenRouter request time limit reached. Retry when ready.');
  const timer=AbortSignal.timeout(Math.max(1,Math.ceil(deadline-Date.now()))),combined=signal?AbortSignal.any([signal,timer]):timer;
  let r;try{r=await this.fetch(BASE+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:combined,redirect:'error'});}
  catch(e){if(signal?.aborted)throw new DOMException('OpenRouter request cancelled.','AbortError');throw Error(combined.aborted?'OpenRouter request timed out. The table is paused; retry when ready.':'Unable to reach OpenRouter. Check your internet connection.');}
  // Never reflect upstream error bodies, which can contain request headers or credentials.
  if(!r.ok)throw Error(`OpenRouter ${r.status}: ${({401:'API key rejected. Replace it in Model connections.',402:'Not enough credits. Add credits or choose a free model.',403:'This key or model is not allowed by your account settings.',404:'Model or endpoint unavailable. Refresh providers.',429:'Rate limit reached. Wait before retrying.'})[r.status]||'Request failed. Check the selected model and your OpenRouter account.'}`);
  let d;try{d=await r.json();}catch{throw Error('OpenRouter returned an unreadable response.');}if(d.error)throw Error('OpenRouter could not complete the request. Check model availability and account limits.');return d;
 }
 async configure(apiKey){
  if(this.environment)throw Error('OpenRouter is configured through OPENROUTER_API_KEY. Change that environment variable and restart the host.');
  if(typeof apiKey!=='string'||apiKey.trim().length>1024||/\s/.test(apiKey.trim()))throw Error('Enter a valid OpenRouter API key.');
  const key=apiKey.trim();
  if(key)await this.request('/key',{key,deadline:Date.now()+15000});
  this.store.save(key);
  this.key=key;this.keyError=null;this.catalog=[];return this.configuration;
 }
 async list({signal,deadline=Date.now()+15000}={}){
  this.reloadCredential();deadline=Math.min(deadline,Date.now()+15000);await this.request('/key',{deadline,signal});
  const d=await this.request('/models/user',{deadline,signal});
  this.catalog=(d.data||[]).filter(m=>!Compatibility.reason(m)).map(m=>{
   const price=n=>n!=null&&n!==''&&Number.isFinite(Number(n))&&Number(n)>=0?Number(n)*1e6:null;
   return{id:m.id,gameCompatible:true,name:String(m.name||m.id),contextLength:m.context_length,maxOutput:m.top_provider?.max_completion_tokens,parameters:m.supported_parameters,reasoning:m.reasoning,pricing:{input:price(m.pricing?.prompt),output:price(m.pricing?.completion),cached:price(m.pricing?.input_cache_read),label:'OpenRouter live catalog',source:'https://openrouter.ai/'+m.id}};
  }).sort((a,b)=>a.name.localeCompare(b.name));
  const visible=this.catalog.filter(m=>!m.id.startsWith('~'));
  if(!visible.length)throw Error('OpenRouter returned no compatible text models with structured decisions and at least 32K context. Check your account model restrictions.');
  return visible.map(({parameters,maxOutput,...m})=>m);
 }
 inputLimit(model){const info=this.catalog.find(m=>m.id===model);return info?Math.max(4096,Math.min(26000,info.contextLength-Math.min(info.maxOutput||Infinity,this.outputBudgets.get(model)||Output.DECISION_OUTPUT)-2048)):undefined;}
 async complete({model,messages,schema,effort='medium',outputLimit,recover=true,recoveryBudget,signal,deadline,onProgress}){
  const started=Date.now(),expires=Math.min(deadline??Infinity,started+this.timeout),quota=recoveryBudget||{remaining:1};
  const mayRecover=recover&&outputLimit===undefined;
  const usage={requests:0,input:0,output:0,cached:null,durationMs:0,reasoningOutput:0,reasoningReports:0,outputRecoveries:0,outputLimits:0,attempts:[],resolvedModels:[]};let inFlight=false;
  try{
   signal?.throwIfAborted();this.reloadCredential();if(!this.key)throw Error(this.keyError||'OpenRouter is not connected. Open Model connections to add your key.');
   if(!this.catalog.length)await this.list({signal,deadline:expires});
   signal?.throwIfAborted();const info=this.catalog.find(m=>m.id===model);if(!info)throw Error('This OpenRouter model is unavailable or does not support structured decisions. Refresh providers.');
   const format=Output.compactSchema(schema);let prompt=messages,plan=Output.budget(info,prompt,format,{outputLimit,learned:this.outputBudgets.get(model)});
   if(plan.limit<512)throw Error('The selected OpenRouter model has too little context space for this game decision. Choose a model with a larger context window.');
   for(let attempt=0;attempt<2;attempt++){
    signal?.throwIfAborted();if(Date.now()>=expires)throw Error('OpenRouter decision time limit reached. The table is paused; retry when ready.');
    const body={model,messages:prompt,stream:false,response_format:{type:'json_schema',json_schema:{name:'rent-reason_decision',strict:true,schema:format}},provider:{require_parameters:true},max_tokens:plan.limit};
    const thought=Output.reasoning(info,effort,plan.limit,outputLimit);if(thought)body.reasoning=thought;
    onProgress?.({phase:attempt?'retrying':'preparing',attempt:attempt+1,outputBudget:plan.limit});usage.requests++;inFlight=true;
    const d=await this.request('/chat/completions',{body,signal,deadline:expires});inFlight=false;
    const u=d.usage,c=d.choices?.[0],input=amount(u?.prompt_tokens),output=amount(u?.completion_tokens),reasoning=typeof u?.completion_tokens_details?.reasoning_tokens==='number'?Math.min(output,amount(u.completion_tokens_details.reasoning_tokens)):null;
    usage.input+=input;usage.output+=output;usage.cacheWrite=(usage.cacheWrite||0)+amount(u?.prompt_tokens_details?.cache_write_tokens);usage.pricing=info.pricing;
    if(typeof u?.prompt_tokens_details?.cached_tokens==='number')usage.cached=(usage.cached??0)+Math.min(input,amount(u.prompt_tokens_details.cached_tokens));
    if(reasoning!==null){usage.reasoningOutput+=reasoning;usage.reasoningReports++;}
    const cost=typeof u?.cost==='number'&&Number.isFinite(u.cost)&&u.cost>=0?u.cost:null;
    if(cost!==null){usage.costUsd=(usage.costUsd||0)+cost;usage.costReports=(usage.costReports||0)+1;}
    if(!u)usage.incomplete=(usage.incomplete||0)+1;
    usage.attempts.push({limit:plan.limit,finishReason:c?.finish_reason||null,input,output,reasoningOutput:reasoning,costUsd:cost});
    const resolved=String(d.model||model);if(!usage.resolvedModels.includes(resolved))usage.resolvedModels.push(resolved);
    if(c?.error||c?.message?.refusal)throw Error('OpenRouter did not return a complete decision. The table is paused; retry or choose another model.');
    if(c?.finish_reason==='length'&&!Output.completeJson(c.message?.content,format)){
     usage.outputLimits++;
     const retryPrompt=[...messages,{role:'user',content:'The previous generation exhausted its output allowance before completing the required JSON. You have more output space. Keep the reasoning focused and the final JSON concise. Use the supplied game analysis tools for calculations. Return one complete schema object, including every required field. Do not continue a truncated answer.'}];
     const next=Output.budget(info,retryPrompt,format,{outputLimit,requested:Math.min(Output.MAX_OUTPUT,plan.limit*2)});
     if(mayRecover&&attempt===0&&quota.remaining>0&&next.limit>plan.limit&&Date.now()+1000<expires){
      quota.remaining--;usage.outputRecoveries++;if(outputLimit===undefined)this.outputBudgets.set(model,next.limit);prompt=retryPrompt;plan=next;continue;
     }
     const reason=!mayRecover?(outputLimit===undefined?'Automatic recovery is disabled for this request.':'Automatic recovery is disabled for short chat replies.'):next.limit<=plan.limit?'The model or remaining context cannot support a larger allowance.':quota.remaining<=0||attempt>0?'The one-retry allowance for this decision has been used.':'The decision time limit left no time for recovery.';
     throw Error(`OpenRouter exhausted its ${plan.limit.toLocaleString('en-US')}-token generation allowance before completing the ${outputLimit===undefined?'decision':'chat reply'}${usage.outputRecoveries?' after one automatic recovery attempt':''}. ${reason} ${outputLimit===undefined?'The table is paused; use Run / retry or choose another model.':'The tagged reply failed; try again when ready.'}`);
    }
    if(!['stop','length'].includes(c?.finish_reason)||typeof c?.message?.content!=='string'||!c.message.content)throw Error('OpenRouter did not return a complete decision. The table is paused; retry or choose another model.');
    onProgress?.({phase:'answering',attempt:attempt+1,answerCharacters:c.message.content.length,outputBudget:plan.limit});usage.durationMs=Date.now()-started;return{text:c.message.content,usage};
   }
  }catch(e){usage.durationMs=Date.now()-started;if(inFlight)usage.incomplete=(usage.incomplete||0)+1;e.usage=usage;throw e;}
 }
 close(){}
}
module.exports={OpenRouterProvider};
