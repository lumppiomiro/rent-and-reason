'use strict';
const {spawn,execFile}=require('node:child_process');
const {createInterface}=require('node:readline');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const MODELS=[{id:'sonnet',name:'Claude Sonnet · subscription alias',isDefault:true},{id:'opus',name:'Claude Opus · subscription alias'},{id:'haiku',name:'Claude Haiku · subscription alias'}];
const FLAGS=['--safe-mode','--tools','--strict-mcp-config','--json-schema','--effort','--setting-sources'];
function environment(){
 const env={...process.env};
 // Use the official CLI's own stored login. Never route a game to API billing,
 // third-party backends, injected credentials, model overrides or parent agents.
 for(const key of Object.keys(env))if(/^(ANTHROPIC_|CLAUDE_|CLAUDECODE$)/.test(key))delete env[key];
 env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC='1';
 env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS='1';return env;
}
const count=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:0;
function cumulativeUsage(models,previous={}){
 const usage={input:0,output:0,cached:0,cacheWrite:0};
 for(const [model,u]of Object.entries(models||{})){
  const old=previous[model]||{},delta=key=>Math.max(0,count(u[key])-count(old[key]));
  const read=delta('cacheReadInputTokens'),write=delta('cacheCreationInputTokens');
  usage.input+=delta('inputTokens')+read+write;usage.output+=delta('outputTokens');usage.cached+=read;usage.cacheWrite+=write;
 }return usage;
}
class ClaudeProvider{
 constructor({binary=process.env.RENT_REASON_CLAUDE_BIN||'claude',spawnImpl=spawn,execFileImpl=execFile,timeout=180000}={}){
  this.binary=binary;this.spawn=spawnImpl;this.execFile=execFileImpl;this.timeout=timeout;this.sessions=new Map();this.active=new Set();
 }
 command(args,env){return new Promise((resolve,reject)=>this.execFile(this.binary,args,{env,timeout:10000,maxBuffer:1024*1024},(error,out)=>{
  if(error){reject(Error(error.code==='ENOENT'?'Claude Code is not installed. Install the official CLI, run “claude auth login”, then refresh providers.':'Claude Code could not verify its version or sign-in. Run “claude auth status” in Terminal; update with “claude update” if needed.'));return;}resolve(out);
 }));}
 async ready(env){
  if(!this.checked)this.checked=(async()=>{
   const version=await this.command(['--version'],env),v=version.match(/(\d+)\.(\d+)\.(\d+)/);
   if(!v||Number(v[1])<2||(Number(v[1])===2&&(Number(v[2])<1||Number(v[2])===1&&Number(v[3])<277)))throw Error('Update Claude Code with “claude update”. Version 2.1.277 or newer is required for reliable session usage accounting.');
   const help=await this.command(['--help'],env);if(FLAGS.some(flag=>!help.includes(flag)))throw Error('Update Claude Code with “claude update”. This integration requires safe mode, structured output and session controls.');
  })().catch(e=>{this.checked=null;throw e;});
  await this.checked;
  let auth;try{auth=JSON.parse(await this.command(['auth','status'],env));}catch(e){if(e.message.startsWith('Claude Code'))throw e;throw Error('Claude Code returned an unsupported sign-in status. Update it and run “claude auth login”.');}
  if(!auth.loggedIn||auth.authMethod!=='claude.ai')throw Error('Claude requires a Claude subscription sign-in. Run “claude auth login”. API-key, OAuth-token and third-party accounts are not used by the game.');
  // Keep no email, credential or organization identifiers in host status.
  this.account={type:'claude.ai',plan:auth.subscriptionType||'Claude subscription'};
 }
 async list(){await this.ready(environment());return MODELS.map(m=>({...m,efforts:['low','medium','high']}));}
 async complete({model,sessionKey,system,text,schema,effort='medium',reset,signal}){
  const env=environment();signal?.throwIfAborted();await this.ready(env);signal?.throwIfAborted();
  if(reset)this.forget(sessionKey);
  let session=this.sessions.get(sessionKey);
  if(session&&(session.model!==model||session.system!==system))throw Error('Claude session configuration changed. Retry to rebuild its context.');
  const fresh=!session;
  if(!session){session={id:randomUUID(),model,system,cwd:fs.mkdtempSync(path.join(os.tmpdir(),'rent-reason-claude-')),usage:{}};this.sessions.set(sessionKey,session);}
  // --bare deliberately is not used: it skips subscription authentication.
  // Safe mode retains authentication while removing personal customizations.
  const settings={disableAllHooks:true,autoMemoryEnabled:false,permissions:{defaultMode:'dontAsk'},fallbackModel:[]};
  const args=['--safe-mode','--setting-sources','','--settings',JSON.stringify(settings),'--print','--output-format','stream-json','--verbose','--tools','','--disallowedTools','mcp__*','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--disable-slash-commands','--no-chrome','--permission-mode','dontAsk','--model',model,'--effort',effort,'--max-turns','3','--json-schema',JSON.stringify(schema),'--system-prompt',system,...(fresh?['--session-id',session.id]:['--resume',session.id])];
  const started=Date.now();let usage={requests:0,input:0,output:0,cached:0,cacheWrite:0,durationMs:0},child;
  try{child=this.spawn(this.binary,args,{cwd:session.cwd,env,stdio:['pipe','pipe','pipe']});}catch(e){this.forget(sessionKey);throw e;}
  return new Promise((resolve,reject)=>{
   let settled=false,result=null,bytes=0,timer,killTimer,requested=false;const steps=new Map();
   const lines=createInterface({input:child.stdout});
   // Drain diagnostics without copying user configuration or credentials to UI.
   child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
   const stop=()=>{child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),1000);killTimer.unref?.();};
   const finish=(error)=>{
    if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);this.active.delete(cancel);
    usage.durationMs=Date.now()-started;
    if(!result){for(const u of steps.values()){usage.input+=count(u.input_tokens)+count(u.cache_read_input_tokens)+count(u.cache_creation_input_tokens);usage.cached+=count(u.cache_read_input_tokens);usage.cacheWrite+=count(u.cache_creation_input_tokens);}usage.incomplete=requested?1:0;}
    if(error){if(!result)usage.incomplete=requested?1:0;error.usage=usage;this.forget(sessionKey);reject(error);}else resolve({text:JSON.stringify(result.structured_output),usage});
   };
   const cancel=()=>{stop();finish(Error('Claude decision cancelled.'));};this.active.add(cancel);
   lines.on('line',line=>{
    if(settled)return;bytes+=Buffer.byteLength(line);if(bytes>4*1024*1024){stop();finish(Error('Claude output exceeded the game response limit.'));return;}
    let m;try{m=JSON.parse(line);}catch{return;}
    if(m.type==='system'&&m.subtype==='init'){
     if((m.tools||[]).some(t=>t!=='StructuredOutput')||(m.mcp_servers||[]).length){stop();finish(Error('Claude exposed native tools. Update Claude Code before retrying.'));return;}
    }
    if(m.type==='assistant'){
     const a=m.message;if(a?.id&&a.usage){steps.set(a.id,a.usage);requested=true;usage.requests=steps.size;}
     if(a?.content?.some(c=>c.type==='tool_use'&&c.name!=='StructuredOutput')){stop();finish(Error('Claude attempted a native tool. Only game analysis is allowed.'));return;}
    }
    if(m.type==='result'){
     result=m;requested=true;usage.requests=Math.max(steps.size,count(m.num_turns),1);
     if(m.modelUsage&&Object.keys(m.modelUsage).length){Object.assign(usage,cumulativeUsage(m.modelUsage,session.usage),{resolvedModels:Object.keys(m.modelUsage)});session.usage=structuredClone(m.modelUsage);}
     else{const u=m.usage||{};Object.assign(usage,{input:count(u.input_tokens)+count(u.cache_read_input_tokens)+count(u.cache_creation_input_tokens),output:count(u.output_tokens),cached:count(u.cache_read_input_tokens),cacheWrite:count(u.cache_creation_input_tokens),incomplete:1});}
    }
   });
   child.on('error',()=>{finish(Error('Claude Code could not start. Check the CLI installation and RENT_REASON_CLAUDE_BIN.'));});
   child.on('close',code=>{
    clearTimeout(killTimer);if(settled)return;
    if(code!==0||!result||result.is_error||result.subtype!=='success'){finish(Error('Claude did not complete the decision'+(result?.errors?.[0]?': '+String(result.errors[0]).slice(0,250):'. Check sign-in, model access or subscription limits, then retry.')));return;}
    if(!result.structured_output||typeof result.structured_output!=='object'||Array.isArray(result.structured_output)){finish(Error('Claude returned no structured game decision. The table is paused; retry.'));return;}
    finish();
   });
   timer=setTimeout(()=>{stop();finish(Error('Claude decision timed out after '+Math.round(this.timeout/1000)+' seconds. The table is paused.'));},this.timeout);
   signal?.addEventListener('abort',cancel,{once:true});
   if(signal?.aborted){cancel();return;}
   child.stdin.end(text);
  });
 }
 forget(key){const s=this.sessions.get(key);this.sessions.delete(key);if(s)try{fs.rmSync(s.cwd,{recursive:true,force:true});}catch{}}
 close(){for(const cancel of [...this.active])cancel();for(const key of this.sessions.keys())this.forget(key);this.checked=null;}
}
module.exports={ClaudeProvider,cumulativeUsage};
