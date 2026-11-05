'use strict';
const fs=require('node:fs'),path=require('node:path');
const {CredentialStore}=require('./credentials.cjs');
const {API}=require('../model-providers.js');
function endpoint(value){let u;try{u=new URL(value);}catch{throw Error('Enter a valid API base URL.');}if(u.username||u.password||u.search||u.hash)throw Error('The base URL cannot contain credentials, a query, or a fragment.');const local=['127.0.0.1','localhost','[::1]'].includes(u.hostname);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&local))throw Error('Use HTTPS, or HTTP on this device’s loopback address.');if(/\/(?:chat\/completions|models)\/?$/.test(u.pathname))throw Error('Use the API base URL, without /chat/completions or /models.');return u.href.replace(/\/$/,'');}
const cleanIds=value=>{if(typeof value!=='string'&&value!==undefined)throw Error('Enter model IDs as text.');const ids=[...new Set(String(value||'').split(/[\s,]+/).filter(Boolean))];if(ids.length>100||ids.some(id=>id.length>150||!/^[-\w./:@~]+$/.test(id)))throw Error('Use at most 100 model IDs, each no longer than 150 characters.');return ids;};
const amount=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?Math.floor(n):0;
const isText=id=>!/(?:embedding|whisper|tts|dall-e|image|audio|realtime|transcri|moderation|rerank|safeguard|guard)/i.test(id);
class CompatibleProvider{
 constructor({type,dataDir,fetchImpl=fetch,credentialStore,timeout=180000}={}){
  if(!API[type])throw Error('Unknown API provider.');this.type=type;this.definition=API[type];this.fetch=fetchImpl;this.timeout=timeout;this.catalog=[];
  this.store=credentialStore||new CredentialStore({dataDir,name:type});this.settingsFile=dataDir?path.join(dataDir,type+'-connection.json'):null;this.settings=null;this.key='';
  if(this.settingsFile)try{const settings=JSON.parse(fs.readFileSync(this.settingsFile,'utf8'));this.settings=this.validate(settings);}catch(e){if(e.code!=='ENOENT')this.settingsError='Saved connection settings could not be loaded. Save the connection again.';}
  try{this.key=this.store.load();}catch{this.keyError='The saved key could not be read. Unlock Keychain or reconnect this provider.';}
 }
 validate({baseUrl=this.definition.url,format=this.definition.format,modelIds='',maxOutput=8192}={}){const url=endpoint(baseUrl);if(!this.definition.custom&&!this.definition.local&&url!==this.definition.url)throw Error('Use Custom endpoint to connect a different API base URL.');if(this.definition.local&&!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname))throw Error('LM Studio must use a loopback endpoint. Use Custom endpoint for a remote server.');if(!['schema','json','text'].includes(format))throw Error('Choose a supported response format.');if(!Number.isInteger(Number(maxOutput))||Number(maxOutput)<1024||Number(maxOutput)>32768)throw Error('Output allowance must be 1024–32768 tokens.');return{baseUrl:url,format,modelIds:cleanIds(Array.isArray(modelIds)?modelIds.join('\n'):modelIds),maxOutput:Number(maxOutput)};}
 get configuration(){return{configured:!!this.settings,hasKey:!!this.key,storage:this.store.kind,baseUrl:this.settings?.baseUrl||this.definition.url,format:this.settings?.format||this.definition.format,modelIds:this.settings?.modelIds||[],maxOutput:this.settings?.maxOutput||8192};}
 async request(route,{settings=this.settings,key=this.key,body,signal,deadline=Date.now()+15000}={}){
  if(!settings)throw Error('Connect '+this.definition.name+' in Model connections first.');if(Date.now()>=deadline)throw Error(this.definition.name+' request timed out.');
  const timeout=AbortSignal.timeout(Math.max(1,Math.ceil(deadline-Date.now()))),combined=signal?AbortSignal.any([signal,timeout]):timeout;let r;
  try{r=await this.fetch(settings.baseUrl+route,{method:body?'POST':'GET',headers:{...(key?{Authorization:'Bearer '+key}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:combined,redirect:'error'});}catch{if(signal?.aborted)throw new DOMException('Request cancelled.','AbortError');throw Error(this.definition.name+(combined.aborted?' request timed out.':' connection failed. Check the server address and connection.'));}
  if(!r.ok){const message=({400:'The model rejected the request format. Adjust Response format in Model connections or choose a chat model.',401:'API key rejected. Reconnect with a valid key.',402:'API credits are exhausted.',403:'This account cannot use the selected endpoint.',404:'Model or endpoint unavailable.',429:'Rate limit reached. Wait and retry.'})[r.status]||'Provider request failed. Try again later.';throw Object.assign(Error(this.definition.name+' HTTP '+r.status+': '+message),{status:r.status});}
  let d;try{d=await r.json();}catch{throw Error(this.definition.name+' returned unreadable JSON.');}if(d.error)throw Error(this.definition.name+' could not complete the request. Check your model and account settings.');return d;
 }
 async discover(settings,key){let d;try{d=await this.request('/models',{settings,key});}catch(e){if(![404,405].includes(e.status)||!settings.modelIds.length)throw e;return settings.modelIds.map(id=>({id,name:id,manual:true}));}
  const ids=[...new Set([...(d.data||[]).map(m=>m.id).filter(id=>typeof id==='string'&&id.length<=150&&isText(id)),...settings.modelIds])];if(!ids.length)throw Error('No text models were listed. Enter a model ID under Advanced settings, or load a local model first.');return ids.map(id=>({id,name:id})).sort((a,b)=>a.id.localeCompare(b.id));
 }
 async configure(input={}){
  const settings=this.validate(input),key=input.apiKey===undefined||input.apiKey===''?this.key:String(input.apiKey).trim();if(key.length>4096||/\s/.test(key))throw Error('Enter a valid API key.');if(!key&&!this.definition.local&&!this.definition.custom)throw Error('Enter your '+this.definition.name+' key.');
  if(this.settings&&new URL(settings.baseUrl).origin!==new URL(this.settings.baseUrl).origin&&this.key&&!input.apiKey)throw Error('Enter a key for the new server address, or remove the old connection first.');
  const catalog=await this.discover(settings,key); // No inference: validates credentials / model discovery before persistence.
  if(input.apiKey)this.store.save(key);if(this.settingsFile){fs.mkdirSync(path.dirname(this.settingsFile),{recursive:true,mode:0o700});const tmp=this.settingsFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(settings),{mode:0o600});fs.renameSync(tmp,this.settingsFile);}
  this.key=key;this.keyError=null;this.settingsError=null;this.settings=settings;this.catalog=catalog;return this.configuration;
 }
 remove(){this.store.save('');if(this.settingsFile)fs.rmSync(this.settingsFile,{force:true});this.key='';this.settings=null;this.catalog=[];}
 async list(){if(!this.settings)throw Error(this.settingsError||'Connect '+this.definition.name+' in Model connections.');if(this.keyError)throw Error(this.keyError);this.catalog=await this.discover(this.settings,this.key);return this.catalog;}
 async complete({model,messages,schema,outputLimit,signal,deadline,onProgress}){
  if(!this.settings)throw Error('This provider is not configured. Reconnect it in Model connections.');const start=Date.now(),limit=Math.min(outputLimit??this.settings.maxOutput,this.settings.maxOutput),requestMessages=messages.map(m=>({role:m.role,content:m.content}));
  const body={model,messages:requestMessages,stream:false,...(this.type==='openai'?{max_completion_tokens:limit}:{max_tokens:limit})};
  if(this.settings.format==='schema')body.response_format={type:'json_schema',json_schema:{name:'game_decision',strict:true,schema:structuredClone(schema)}};
  else if(this.settings.format==='json')body.response_format={type:'json_object'};
  body.messages=[...body.messages,{role:'user',content:'Return one complete JSON object matching this schema. No markdown or commentary. Schema: '+JSON.stringify(schema)}];
  onProgress?.({phase:'reasoning'});let data;
  try{data=await this.request('/chat/completions',{body,signal,deadline:Math.min(deadline??Infinity,start+this.timeout)});}catch(e){e.usage={requests:1,input:0,output:0,cached:null,incomplete:1,durationMs:Date.now()-start};throw e;}
  const choice=data.choices?.[0],u=data.usage,usage={requests:1,input:amount(u?.prompt_tokens),output:amount(u?.completion_tokens),cached:typeof u?.prompt_tokens_details?.cached_tokens==='number'?Math.min(amount(u.prompt_tokens),amount(u.prompt_tokens_details.cached_tokens)):null,reasoningOutput:Math.min(amount(u?.completion_tokens),amount(u?.completion_tokens_details?.reasoning_tokens)),incomplete:u?0:1,durationMs:Date.now()-start};
  let completeJson=false;try{const value=JSON.parse(choice?.message?.content);completeJson=!!value&&typeof value==='object'&&!Array.isArray(value);}catch{}
  if(choice?.finish_reason==='length'&&!completeJson){const e=Error(this.definition.name+' output limit reached before a complete decision. Increase the output allowance in Model connections.');e.status=400;e.usage=usage;throw e;}
  if(choice?.message?.refusal||!['stop','length'].includes(choice?.finish_reason)||typeof choice?.message?.content!=='string'){const e=Error(this.definition.name+' returned no complete decision. Choose a compatible text model.');e.usage=usage;throw e;}
  onProgress?.({phase:'answering',answerCharacters:choice.message.content.length});return{text:choice.message.content,usage};
 }
 close(){}
}
module.exports={CompatibleProvider,endpoint,cleanIds};
