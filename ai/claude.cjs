'use strict';
const {spawn,execFile}=require('node:child_process');
const {createInterface}=require('node:readline');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const MODELS=[{id:'sonnet',name:'Claude Sonnet · subscription alias',isDefault:true},{id:'opus',name:'Claude Opus · subscription alias'},{id:'haiku',name:'Claude Haiku · subscription alias'}];
const FLAGS=['--safe-mode','--tools','--strict-mcp-config','--json-schema','--effort','--setting-sources','--input-format','--no-session-persistence'];
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
  this.binary=binary;this.spawn=spawnImpl;this.execFile=execFileImpl;this.timeout=timeout;this.sessions=new Map();this.active=new Set();this.generation=0;
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
  const env=environment(),generation=this.generation;signal?.throwIfAborted();await this.ready(env);signal?.throwIfAborted();
  if(generation!==this.generation)throw Error('Claude decision cancelled.');
  if(reset)this.forget(sessionKey);
  let session=this.sessions.get(sessionKey);
  if(session?.pending)throw Error('Claude session already has a decision in progress.');
  if(session&&(session.model!==model||session.system!==system||session.schema!==JSON.stringify(schema)))throw Error('Claude session configuration changed. Retry to rebuild its context.');
  // An exited process has lost its in-memory context. Never send it a delta as
  // a fresh conversation; AgentSession handles the error by rebuilding a snapshot.
  if(session?.failure){const error=session.failure;this.forget(sessionKey);throw error;}
  if(!session){session=this.startSession({model,system,schema,effort,env});this.sessions.set(sessionKey,session);}
  const {child}=session,started=Date.now();
  let usage={requests:0,input:0,output:0,cached:0,cacheWrite:0,durationMs:0};
  return new Promise((resolve,reject)=>{
   let settled=false,result=null,bytes=0,timer,requested=false,control=null;const steps=new Map();
   const finish=(error)=>{
    if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);this.active.delete(cancel);session.pending=null;
    usage.durationMs=Date.now()-started;
    if(!result){for(const u of steps.values()){usage.input+=count(u.input_tokens)+count(u.cache_read_input_tokens)+count(u.cache_creation_input_tokens);usage.cached+=count(u.cache_read_input_tokens);usage.cacheWrite+=count(u.cache_creation_input_tokens);}usage.incomplete=requested?1:0;}
    if(error){error.usage=usage;this.forget(sessionKey);reject(error);}else resolve({text:JSON.stringify(result.structured_output),usage});
   };
   const cancel=()=>finish(Error('Claude decision cancelled.'));
   const write=message=>{try{child.stdin.write(JSON.stringify(message)+'\n');}catch{finish(Error('Claude Code input closed. Retry to rebuild its context.'));}};
   const sendControl=(request,done)=>{control={id:randomUUID(),done};write({type:'control_request',request_id:control.id,request});};
   const prompt=()=>{requested=true;write({type:'user',session_id:session.id,parent_tool_use_id:null,message:{role:'user',content:text}});};
   const configure=()=>session.effort===effort?prompt():sendControl({subtype:'apply_flag_settings',settings:{effortLevel:effort}},()=>{session.effort=effort;prompt();});
   const onLine=line=>{
    if(settled)return;bytes+=Buffer.byteLength(line);if(bytes>4*1024*1024){finish(Error('Claude output exceeded the game response limit.'));return;}
    let m;try{m=JSON.parse(line);}catch{return;}
    if(m.type==='control_response'){
     if(!control||m.response?.request_id!==control.id)return;
     const done=control.done;control=null;
     if(m.response.subtype!=='success'){finish(Error('Claude Code could not configure its in-memory session. Update Claude Code, then retry.'));return;}
     done();return;
    }
    if(m.type==='control_request'){finish(Error('Claude requested a native tool or permission. Only game analysis is allowed.'));return;}
    if(m.type==='system'&&m.subtype==='init'){
     if((m.tools||[]).some(t=>t!=='StructuredOutput')||(m.mcp_servers||[]).length){finish(Error('Claude exposed native tools. Update Claude Code before retrying.'));return;}
    }
    if(m.type==='assistant'){
     const a=m.message;if(a?.id&&a.usage){steps.set(a.id,a.usage);usage.requests=steps.size;}
     if(a?.content?.some(c=>c.type==='tool_use'&&c.name!=='StructuredOutput')){finish(Error('Claude attempted a native tool. Only game analysis is allowed.'));return;}
    }
    if(m.type==='result'){
     result=m;usage.requests=Math.max(steps.size,count(m.num_turns),1);
     if(m.modelUsage&&Object.keys(m.modelUsage).length){Object.assign(usage,cumulativeUsage(m.modelUsage,session.usage),{resolvedModels:Object.keys(m.modelUsage)});session.usage=structuredClone(m.modelUsage);}
     else{const u=m.usage||{};Object.assign(usage,{input:count(u.input_tokens)+count(u.cache_read_input_tokens)+count(u.cache_creation_input_tokens),output:count(u.output_tokens),cached:count(u.cache_read_input_tokens),cacheWrite:count(u.cache_creation_input_tokens),incomplete:1});}
     if(m.is_error||m.subtype!=='success'){finish(Error('Claude did not complete the decision'+(m.errors?.[0]?': '+String(m.errors[0]).slice(0,250):'. Check sign-in, model access or subscription limits, then retry.')));return;}
     if(!m.structured_output||typeof m.structured_output!=='object'||Array.isArray(m.structured_output)){finish(Error('Claude returned no structured game decision. The table is paused; retry.'));return;}
     finish();
    }
   };
   session.pending={finish,onLine};this.active.add(cancel);
   timer=setTimeout(()=>finish(Error('Claude decision timed out after '+Math.round(this.timeout/1000)+' seconds. The table is paused.')),this.timeout);
   signal?.addEventListener('abort',cancel,{once:true});
   if(signal?.aborted){cancel();return;}
   if(!session.initialized)sendControl({subtype:'initialize',hooks:{}},()=>{session.initialized=true;configure();});else configure();
  });
 }
 startSession({model,system,schema,effort,env}){
  const session={id:randomUUID(),model,system,schema:JSON.stringify(schema),effort,cwd:fs.mkdtempSync(path.join(os.tmpdir(),'rent-reason-claude-')),usage:{},pending:null};
  // --bare deliberately is not used: it skips subscription authentication.
  // Safe mode retains authentication while removing personal customizations.
  // Keep stdin open and reuse the live process. No transcripts are written for
  // desktop external-agent imports, and no credentials/config directories move.
  const settings={disableAllHooks:true,autoMemoryEnabled:false,permissions:{defaultMode:'dontAsk'},fallbackModel:[]};
  const args=['--safe-mode','--setting-sources','','--settings',JSON.stringify(settings),'--print','--input-format','stream-json','--output-format','stream-json','--no-session-persistence','--verbose','--tools','','--disallowedTools','mcp__*','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--disable-slash-commands','--no-chrome','--permission-mode','dontAsk','--model',model,'--effort',effort,'--max-turns','3','--json-schema',session.schema,'--system-prompt',system,'--session-id',session.id];
  let child;try{child=session.child=this.spawn(this.binary,args,{cwd:session.cwd,env,stdio:['pipe','pipe','pipe']});}catch(e){fs.rmSync(session.cwd,{recursive:true,force:true});throw e;}
  session.lines=createInterface({input:child.stdout});session.lines.on('line',line=>session.pending?.onLine(line));
  const fail=error=>{session.failure=error;session.pending?.finish(error);};
  // Drain diagnostics without copying user configuration or credentials to UI.
  child.stderr.on('data',()=>{});child.stdin.on('error',()=>fail(Error('Claude Code input closed. Retry to rebuild its context.')));
  child.on('error',()=>fail(Error('Claude Code could not start. Check the CLI installation and RENT_REASON_CLAUDE_BIN.')));
  child.on('close',()=>{session.closed=true;clearTimeout(session.killTimer);fail(Error('Claude Code session stopped. Retry to rebuild its context.'));});
  return session;
 }
 forget(key){
  const s=this.sessions.get(key);this.sessions.delete(key);if(!s)return;
  s.pending?.finish(Error('Claude decision cancelled.'));
  if(!s.closed){s.child.kill('SIGTERM');s.killTimer=setTimeout(()=>s.child.kill('SIGKILL'),1000);s.killTimer.unref?.();}
  s.lines.close();try{fs.rmSync(s.cwd,{recursive:true,force:true});}catch{}
 }
 close(){this.generation++;for(const cancel of [...this.active])cancel();for(const key of this.sessions.keys())this.forget(key);this.checked=null;}
}
module.exports={ClaudeProvider,cumulativeUsage};
