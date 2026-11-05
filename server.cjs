#!/usr/bin/env node
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {OllamaProvider,CodexProvider,ClaudeProvider}=require('./ai/providers.cjs');
const {Table,validateOptions}=require('./ai/table.cjs');
const Tournament=require('./tournament.js');
const {TrophyStore}=require('./ai/trophies.cjs');
const {MemoryStore}=require('./ai/memories.cjs');
const {OpenRouterProvider}=require('./ai/openrouter.cjs');
const {AuditJournal}=require('./ai/audit.cjs');
const {InternetHosting}=require('./ai/hosting.cjs');
const {CompatibleProvider}=require('./ai/compatible.cjs');
const {API:API_PROVIDERS,TYPES:MODEL_TYPES,CHOICES:PROVIDER_CHOICES}=require('./model-providers.js');
const ROOT=__dirname;
function createHost({dataDir=path.join(ROOT,'.rent-reason-data'),providers,delay=1800,memoryOptions={},hostingOptions={}}={}){
 const token=crypto.randomBytes(32).toString('hex');let table=null,discovery=null,discoveredAt=0;
 fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
 providers=providers||{ollama:new OllamaProvider(),codex:new CodexProvider(),claude:new ClaudeProvider()};
 providers={...providers,openrouter:providers.openrouter||new OpenRouterProvider({dataDir})};
 for(const type of Object.keys(API_PROVIDERS))providers[type]??=new CompatibleProvider({type,dataDir});
 const ollamaSettings=path.join(dataDir,'ollama-connection.json');if(providers.ollama instanceof OllamaProvider)try{providers.ollama.url=new OllamaProvider({url:JSON.parse(fs.readFileSync(ollamaSettings,'utf8')).baseUrl}).url;}catch{}
 const trophies=new TrophyStore(dataDir),trophyData=()=>trophies.snapshot();
 const memories=new MemoryStore(dataDir,{...memoryOptions,cabinet:trophyData,onChange:job=>{if(table?.id===job.matchId)table.save();const archive=trophies.archives.read(job.matchId);if(archive)trophies.archives.write(memories.enrichArchive(archive));}});
 const journal=new AuditJournal(dataDir),audit=entry=>journal.append(entry);
 const save=data=>{const file=path.join(dataDir,'table.json');fs.writeFileSync(file+'.tmp',JSON.stringify(data),{mode:0o600});fs.renameSync(file+'.tmp',file);trophies.record(data);memories.record(data,trophies.snapshot().matches.find(m=>m.id===data.id));if(data.game.phase==='over'){const archive=trophies.archives.read(data.id);if(archive)trophies.archives.write(memories.enrichArchive(archive));}};
 try{const saved=JSON.parse(fs.readFileSync(path.join(dataDir,'table.json'),'utf8'));if(saved.format==='rent-reason-ai-table')table=new Table(null,providers,{saved,persist:save,audit,delay,trophies:trophyData,memories});}catch(e){if(e.code!=='ENOENT')console.warn('Previous AI table could not be restored:',e.message);}
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 const body=req=>new Promise((resolve,reject)=>{let data='',size=0;req.on('data',b=>{size+=b.length;if(size>2e6){reject(Error('Request too large.'));req.destroy();}else data+=b;});req.on('end',()=>{try{resolve(JSON.parse(data||'{}'));}catch{reject(Error('Invalid JSON.'));}});req.on('error',reject);});
 async function models(force=false){if(discovery&&!force&&Date.now()-discoveredAt<30000)return discovery;
  const types=MODEL_TYPES;
  const results=await Promise.allSettled(types.map(async type=>{if(!providers[type])throw Error('Provider is not configured.');return{type,models:await providers[type].list()};}));
  discovery=Object.fromEntries(results.map((r,i)=>[types[i],r.status==='fulfilled'?{available:true,...r.value,account:providers[types[i]]?.account,configuration:providers[types[i]]?.configuration}:{available:false,models:[],error:r.reason.message,configuration:providers[types[i]]?.configuration}]));discoveredAt=Date.now();return discovery;
 }
 if(table?.preMatch?.state==='waiting')table.schedule(30);
 const sharing=new InternetHosting({...hostingOptions,table:()=>table,memories,html:()=>fs.readFileSync(path.join(ROOT,'index.html')),interrupt:reason=>memories.interrupt(reason)});
 const server=http.createServer(async(req,res)=>{
  try{
   const expected=`http://127.0.0.1:${server.address().port}`,host=req.headers.host;
   if(host!==`127.0.0.1:${server.address().port}`){json(res,403,{error:'Use the 127.0.0.1 address printed in Terminal.'});return;}
   if(req.headers.origin&&req.headers.origin!==expected){json(res,403,{error:'Cross-origin access is disabled.'});return;}
   const url=new URL(req.url,expected);
   if(url.pathname.startsWith('/api/')){
    if(url.pathname==='/api/info'&&req.method==='GET'){json(res,200,{token,appearance:{pieces:require('./engine.js').PIECES,colors:require('./engine.js').PLAYER_COLORS.map(c=>c[0])},viewer:{role:'host',seat:0},version:2,socialVersion:1,table:table?{id:table.id}:null,providers:MODEL_TYPES,localGameHost:true,subscriptionOnly:false,features:{modelConnections:1,tournament:1,multiplayer:1,internetHosting:1,noRentInJail:1,characterProfiles:1,preMatchChat:1,decisionRetries:1,gameTiming:1,postMatchOpeners:1,debtPlanner:1,characterMemory:1,boards:1,boardEditions:Object.keys(require('./boards.js').EDITIONS),boardLayouts:{'lantern-harbor':1},languages:['en','fi'],postMatchChat:1,completeChat:1,trophies:1,matchArchives:1,openrouterBackendCredentials:1,openrouterOutputRecovery:1}});return;}
    if(req.headers['x-rent-reason-token']!==token){json(res,403,{error:'Refresh the game to reconnect to the local host.'});return;}
    if(req.method==='GET'){
     if(url.pathname==='/api/hosting'){json(res,200,sharing.status());return;}
     if(url.pathname==='/api/providers'){json(res,200,await models(url.searchParams.has('refresh')));return;}
     if(url.pathname==='/api/connections'){json(res,200,{providers:PROVIDER_CHOICES.map(([type,name])=>({type,name,...API_PROVIDERS[type],configuration:type==='ollama'?{configured:true,baseUrl:providers.ollama?.url||'http://127.0.0.1:11434'}:providers[type]?.configuration||{},available:discovery?.[type]?.available||false,modelCount:discovery?.[type]?.models.length||0}))});return;}
     if(url.pathname==='/api/table'){json(res,200,table?table.status(Number(url.searchParams.get('after'))||0):null);return;}
     if(url.pathname==='/api/characters'){json(res,200,memories.publicView(table));return;}
     if(url.pathname==='/api/trophies'){json(res,200,trophies.snapshot());return;}
     if(url.pathname==='/api/match'){const id=url.searchParams.get('id'),record=trophies.snapshot().matches.find(m=>m.id===id);if(!record){json(res,404,{error:'Match not found.'});return;}const archive=trophies.archives.read(id);if(!archive){json(res,404,{error:'No saved board is available for this older match.'});return;}json(res,200,memories.enrichArchive({...archive,summary:record}));return;}
     if(url.pathname==='/api/insights'){if(!table)throw Error('Create an AI table first.');json(res,200,table.insights());return;}
     if(url.pathname==='/api/audit'){if(!table)throw Error('No AI table.');const file=journal.file(table.id);if(!fs.existsSync(file))throw Error('No audit journal exists for this table.');res.writeHead(200,{'Content-Type':'application/x-ndjson','Content-Disposition':'attachment; filename=rent-reason-audit.jsonl','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;}
     if(url.pathname==='/api/export'){if(!table)throw Error('No AI table.');let saved;const old=table.persistFn;table.persistFn=d=>{saved=d;};try{table.save();}finally{table.persistFn=old;}json(res,200,saved);return;}
    }
    if(req.method==='POST'){
     const d=await body(req);
     if(url.pathname==='/api/connections'){
      if(table?.running||table?.thinking||table?.inFlight)throw Error('Pause the table and wait for its current request to finish before changing connections.');
      const provider=providers[d.type];if(!MODEL_TYPES.includes(d.type)||!provider)throw Error('Choose a valid provider.');
      let found;
      if(d.action==='remove'){
       if(d.type==='openrouter')await provider.configure('');
       else if(API_PROVIDERS[d.type])provider.remove();
       else throw Error('This connection uses an external application. Manage its sign-in in that application.');
       discovery=null;json(res,200,{configuration:provider.configuration||{},models:[],removed:true});return;
      }
      if(d.action==='connect'){
       if(d.type==='openrouter'){if(typeof d.apiKey!=='string'||!d.apiKey.trim())throw Error('Enter your OpenRouter API key.');await provider.configure(d.apiKey);found=await provider.list();}
       else if(API_PROVIDERS[d.type]){await provider.configure(d);found=provider.catalog;}
       else if(d.type==='ollama'){
        const candidate=new OllamaProvider({url:d.baseUrl||'http://127.0.0.1:11434',fetchImpl:provider.fetch});found=await candidate.list();
        if(!(provider instanceof OllamaProvider))throw Error('This Ollama connection cannot be reconfigured.');
        fs.writeFileSync(ollamaSettings+'.tmp',JSON.stringify({baseUrl:candidate.url}),{mode:0o600});fs.renameSync(ollamaSettings+'.tmp',ollamaSettings);provider.url=candidate.url;provider.outputBudgets.clear();
       }else found=await provider.list();
      }else if(d.action==='refresh')found=await provider.list();else throw Error('Choose Connect, Refresh, or Remove.');
      discovery=null;json(res,200,{configuration:d.type==='ollama'?{configured:true,baseUrl:provider.url}:provider.configuration||{},models:found||[]});return;
     }

     if(url.pathname==='/api/hosting'){
      if(d.action==='start')json(res,200,await sharing.start());
      else if(d.action==='stop'){await sharing.stop();json(res,200,sharing.status());}
      else if(d.action==='invite')json(res,200,sharing.invite(d.seat));
      else if(d.action==='revoke'){sharing.revoke(d.seat);json(res,200,sharing.status());}
      else throw Error('Unknown hosting control.');return;
     }
     if(url.pathname==='/api/characters'){json(res,200,memories.update(d,table));return;}
     if(url.pathname==='/api/providers/openrouter'){json(res,404,{error:'OpenRouter credentials are managed by the backend setup helper.'});return;}
     if(url.pathname==='/api/tournament'){
      const previous=table,previousRevision=table?.revision;let league;
      if(d.action==='create'){if(table&&table.game.s.phase!=='over'&&(d.id!==table.id||d.revision!==table.revision))throw Error('The table changed. Review replacement before creating a tournament.');league=Tournament.create(d.options,{id:crypto.randomUUID()});for(let i=0;i<league.roster.length;i+=4){const group=league.roster.slice(i,i+4);if(group.length===1)group.push(league.roster[0]);validateOptions({...league.settings,players:group});new (require('./engine.js').Game)({...league.settings,players:group});}}
      else if(d.action==='next'){if(!table?.tournament||d.id!==table.id||d.revision!==table.revision)throw Error('The table changed. Reopen tournament standings.');if(table.game.s.phase!=='over')throw Error('Finish the current table before advancing.');league=Tournament.next(table.tournament);}
      else throw Error('Unknown tournament action.');
      const available=await models();for(const p of league.roster)if(!['human','heuristic'].includes(p.type)&&!available[p.type]?.models.some(m=>m.id===p.model))throw Error(`Model ${p.model} is unavailable. Refresh connections before continuing.`);
      if(table!==previous||table?.revision!==previousRevision)throw Error('The table changed while checking providers. Reopen tournament standings.');
      const next=new Table(Tournament.options(league),providers,{tournament:league,delay,audit,trophies:trophyData,memories});sharing.reset();memories.interrupt('A tournament table took priority.');table?.dispose();table=next;table.persistFn=save;table.save();if(table.preMatch?.state==='waiting')table.schedule(30);json(res,200,table.status());return;
     }
     if(url.pathname==='/api/table'){
      const available=await models();for(const p of d.players||[])if(MODEL_TYPES.includes(p.type)&&!available[p.type]?.models.some(m=>m.id===p.model))throw Error(`Model ${p.model} is unavailable. Refresh providers and choose an available model.`);
      // Construct and validate before disposing the previous table.
      const next=new Table(d,providers,{delay,audit,trophies:trophyData,memories});sharing.reset();memories.interrupt('A new game took priority.');table?.dispose();table=next;table.persistFn=save;table.save();if(table.preMatch?.state==='waiting')table.schedule(30);json(res,200,table.status());return;
     }
     if(url.pathname==='/api/import'){
      if(d.format!=='rent-reason-ai-table'||d.version!==1)throw Error('Choose an exported AI table save.');
      const next=new Table(null,providers,{saved:d,delay,audit,trophies:trophyData,memories});if(next.game.s.players.length!==next.options.players.length||next.game.s.controllers?.some((c,i)=>c.type!==next.options.players[i].type))throw Error('Saved roster does not match the game.');
      sharing.reset();memories.interrupt('A new game took priority.');table?.dispose();table=next;table.persistFn=save;table.save();if(table.preMatch?.state==='waiting')table.schedule(30);json(res,200,table.status());return;
     }
     if(!table)throw Error('Create an AI table first.');
     if(url.pathname==='/api/start'){sharing.requirePlayers();json(res,200,table.startMatch({id:d.id,revision:d.revision}));return;}
     if(url.pathname==='/api/action'){memories.interrupt('Game action took priority.');table.human(d);json(res,200,table.status(d.after||0));return;}
     if(url.pathname==='/api/language'){json(res,200,table.setLanguage(d.language));return;}
     if(url.pathname==='/api/effort'){json(res,200,table.setEfforts(d));return;}
     if(url.pathname==='/api/profiles'){const s=table.updateProfiles(d);json(res,200,{profilesVersion:s.profilesVersion,socialProfiles:s.socialProfiles,pendingProfileSeats:s.pendingProfileSeats});return;}
     if(url.pathname==='/api/chat'){memories.interrupt('Chat took priority.');const human=table.options.players[0].type==='human';if(!human&&table.game.s.phase!=='over'&&table.preMatch?.state!=='waiting')throw Error('Spectators cannot speak as a player.');table.addChat(human?0:null,d.text,{targets:d.targets||[],topicId:d.topicId||null});json(res,200,{ok:true});return;}
     if(url.pathname==='/api/control'){
      if(d.action==='pause')table.pause();else if(d.action==='run'){sharing.requirePlayers();table.run();}else if(d.action==='step'){sharing.requirePlayers();table.pause('Stepping one AI action.');void table.step();}else throw Error('Unknown table control.');json(res,200,table.status(d.after||0));return;
     }
    }
    json(res,404,{error:'Unknown local API route.'});return;
   }
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
   if(!['/','/index.html'].includes(url.pathname)){res.writeHead(404);res.end();return;}
   const content=fs.readFileSync(path.join(ROOT,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:content);
  }catch(e){if(!res.headersSent)json(res,400,{error:e.message});else res.end();}
 });
 const memoryTimer=setInterval(()=>void memories.pump(table,providers).catch(e=>console.warn('Character reflection:',e.message)),1000);memoryTimer.unref();
 server.on('close',()=>{void sharing.stop(false);clearInterval(memoryTimer);memories.close();table?.dispose();Object.values(providers).forEach(p=>p.close?.());});
 return{server,models,memories,sharing,get table(){return table;}};
}
if(require.main===module){
 const host=createHost();const port=Number(process.env.RENT_REASON_PORT)||8790;
 host.server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is busy. Open http://127.0.0.1:${port} or set RENT_REASON_PORT to another port.`:e.message);process.exitCode=1;});
 host.server.listen(port,'127.0.0.1',()=>console.log(`Rent & Reason AI table: http://127.0.0.1:${host.server.address().port}\nOllama runs locally. Codex uses ChatGPT sign-in; Claude Code uses Claude subscription sign-in. OpenRouter uses your optional API key and credits.\nKeep this Terminal open. Press Control-C to stop. Saved tables resume paused.`));
 for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>{host.server.close();host.server.closeAllConnections();});
}
module.exports={createHost};
