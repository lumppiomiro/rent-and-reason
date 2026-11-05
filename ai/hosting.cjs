'use strict';
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs');
const {spawn}=require('node:child_process');
const secret=()=>crypto.randomBytes(32).toString('hex');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const COOKIE='__Host-rent-reason-guest';
const fail=(message,status=403)=>Object.assign(Error(message),{status});
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let text='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)throw fail('Request too large.',413);text+=chunk;}try{return JSON.parse(text||'{}');}catch{throw fail('Invalid JSON.',400);}}
// This gateway is deliberately separate from the loopback-only administrator API.
// No forwarding headers or client-supplied seat/role ever grant authority.
class InternetHosting{
 constructor({table,html,memories,interrupt=()=>{},spawnImpl=spawn,bin=process.env.RENT_REASON_CLOUDFLARED_BIN||['/opt/homebrew/bin/cloudflared','/usr/local/bin/cloudflared'].find(p=>fs.existsSync(p))||'cloudflared',now=Date.now}){
  Object.assign(this,{table,html,memories,interrupt,spawnImpl,bin,now});this.state='off';this.error=null;this.url=null;this.gateway=null;this.child=null;this.generation=0;this.invites=new Map();this.sessions=new Map();this.buckets=new Map();
 }
 reset(){this.invites.clear();this.sessions.clear();}
 seats(){return(this.table()?.options.players||[]).flatMap((p,seat)=>p.type==='human'&&seat!==0?[{seat,name:p.name,claimed:[...this.sessions.values()].some(s=>s.seat===seat&&s.expires>this.now()),lastSeen:Math.max(0,...[...this.sessions.values()].filter(s=>s.seat===seat).map(s=>s.lastSeen))}]:[]);}
 status(){return{state:this.state,url:this.url,error:this.error,seats:this.seats()};}
 requireReady(){if(this.state!=='ready'||!this.table())throw fail('Start internet hosting and create a table first.',400);}
 invite(seat){this.requireReady();if(!this.seats().some(p=>p.seat===seat))throw fail('Choose a visitor human seat.',400);this.revoke(seat);const value=secret(),expires=this.now()+3600000;this.invites.set(digest(value),{seat,tableId:this.table().id,expires});return{url:this.url+'/#join='+value,expires};}
 revoke(seat){for(const [key,s]of this.invites)if(s.seat===seat)this.invites.delete(key);for(const [key,s]of this.sessions)if(s.seat===seat)this.sessions.delete(key);}
 requirePlayers(){const missing=this.seats().filter(s=>!s.claimed);if(missing.length)throw fail('Invite the other human players before starting: '+missing.map(s=>s.name).join(', '),400);}
 async start(){
  if(this.state==='starting'||this.state==='ready')return this.status();
  if(!this.table())throw fail('Create a game with human visitor seats first.',400);
  if(!this.seats().length)throw fail('Choose Human for another seat in game setup first.',400);
  const stopping=this.stop(false),generation=this.generation;this.state='starting';this.error=null;await stopping;
  if(generation!==this.generation)return this.status();
  const gateway=this.gateway=http.createServer((req,res)=>void this.handle(req,res));
  gateway.requestTimeout=10000;gateway.headersTimeout=10000;gateway.maxHeadersCount=40;gateway.maxConnections=32;
  try{await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(0,'127.0.0.1',resolve);});
   if(generation!==this.generation){gateway.close();gateway.closeAllConnections();return this.status();}
   const address='127.0.0.1:'+gateway.address().port;
   // Only this restricted gateway is tunneled. The administrator server is never exposed.
   const child=this.child=this.spawnImpl(this.bin,['tunnel','--no-autoupdate','--url','http://'+address,'--http-host-header',address],{stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,HOME:process.env.HOME,SystemRoot:process.env.SystemRoot}});
   let output='';const read=chunk=>{if(generation!==this.generation)return;output=(output+chunk.toString()).slice(-16000);const match=output.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com\b/);if(match&&!this.url){this.url=match[0];this.state='ready';clearTimeout(this.startTimer);}};
   child.stdout?.on('data',read);child.stderr?.on('data',read);
   child.once('error',()=>{if(generation===this.generation)this.failed('Could not launch cloudflared. Install it, then retry hosting.');});
   child.once('exit',()=>{if(generation===this.generation)this.failed('The internet tunnel stopped. Retry hosting and send new invites.');});
   this.startTimer=setTimeout(()=>{if(generation===this.generation)this.failed('The tunnel could not connect within 45 seconds. Check internet access and cloudflared configuration.');},45000);this.startTimer.unref();
  }catch{if(generation===this.generation)this.failed('Could not start the visitor server. Retry hosting.');}
  return this.status();
 }
 failed(message){const stopped=this.stop(),generation=this.generation;void stopped.then(()=>{if(generation===this.generation){this.state='error';this.error=message;}});}
 async stop(pause=true){
  this.generation++;clearTimeout(this.startTimer);this.startTimer=null;const child=this.child,gateway=this.gateway;this.child=null;this.gateway=null;this.state='off';this.url=null;this.error=null;this.reset();this.buckets.clear();
  if(pause&&gateway)this.table()?.pause('Internet hosting stopped. Guests need new invitations.');
  if(child){child.kill('SIGTERM');const kill=setTimeout(()=>child.kill('SIGKILL'),2000);kill.unref();child.once('exit',()=>clearTimeout(kill));}
  if(gateway)await new Promise(resolve=>{gateway.close(resolve);gateway.closeAllConnections();});
 }
 limited(key,max,window=60000){const now=this.now();let b=this.buckets.get(key);if(!b||b.until<=now){b={n:0,until:now+window};this.buckets.set(key,b);}if(++b.n>max)throw fail('Too many requests. Try again shortly.',429);}
 session(req){const raw=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1),s=raw&&this.sessions.get(digest(raw));if(!s||s.expires<=this.now()||s.tableId!==this.table()?.id)throw fail('Your invitation or session has expired. Ask the host for a new invite.',401);s.lastSeen=this.now();return s;}
 guestStatus(after,seat){const status=this.table().status(after);return{...status,viewer:{role:'guest',seat},error:status.error?'The host needs to resolve a model connection error.':null,note:status.running?'Table running.':'Waiting for the host.',decisions:[],replyRequests:status.replyRequests.map(r=>({...r,error:r.error?'Reply unavailable.':undefined}))};}
 async handle(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');res.setHeader('X-Frame-Options','DENY');
  try{
   if(!this.gateway||this.state!=='ready')throw fail('Hosting is not ready.',503);
   const expectedHost='127.0.0.1:'+this.gateway.address().port;
   if(req.headers.host!==expectedHost)throw fail('Invalid host.');
   if(req.headers.origin&&req.headers.origin!==this.url)throw fail('Cross-origin access is disabled.');
   this.limited('all',9000); // Globally bounded; never trust an arbitrary forwarded IP.
   const url=new URL(req.url,'http://'+expectedHost);
   if(req.method==='GET'&&['/','/index.html'].includes(url.pathname)){
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");res.setHeader('Content-Type','text/html; charset=utf-8');res.end(this.html());return;
   }
   if(req.headers['sec-fetch-site']==='cross-site')throw fail('Cross-site access is disabled.');
   if(req.method==='POST'){
    if(req.headers.origin!==this.url||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail('A same-origin JSON request is required.');
   }
   if(url.pathname==='/api/join'&&req.method==='POST'){
    this.limited('join',30);const d=await body(req);if(typeof d.invite!=='string'||!(/^[a-f0-9]{64}$/).test(d.invite))throw fail('Invalid or expired invite.',401);
    const key=digest(d.invite),invite=this.invites.get(key);if(!invite||invite.expires<=this.now()||invite.tableId!==this.table()?.id)throw fail('Invalid or expired invite. Ask the host for a new link.',401);
    this.invites.delete(key);const value=secret(),session={seat:invite.seat,tableId:invite.tableId,csrf:secret(),expires:this.now()+86400000,lastSeen:this.now()};this.sessions.set(digest(value),session);
    res.setHeader('Set-Cookie',COOKIE+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400');json(res,200,{ok:true});return;
   }
   const s=this.session(req);this.limited('session:'+s.seat,240);
   if(url.pathname==='/api/info'&&req.method==='GET'){json(res,200,{version:2,localGameHost:true,token:s.csrf,appearance:{pieces:require('../engine.js').PIECES,colors:require('../engine.js').PLAYER_COLORS.map(c=>c[0])},viewer:{role:'guest',seat:s.seat},table:{id:s.tableId},features:{multiplayer:1,ownCharacter:!!this.memories}});return;}
   if(req.headers['x-rent-reason-token']!==s.csrf)throw fail('Refresh the page to reconnect.');
   if(url.pathname==='/api/table'&&req.method==='GET'){json(res,200,this.guestStatus(Number(url.searchParams.get('after'))||0,s.seat));return;}
   if(url.pathname==='/api/character'&&this.memories&&['GET','POST'].includes(req.method)){
    if(req.method==='GET'){json(res,200,this.memories.guestCharacter(this.table(),s.seat));return;}
    this.limited('character:'+s.seat,20);const data=await body(req);
    try{json(res,200,this.memories.updateGuestCharacter(this.table(),s.seat,data));}catch(e){if(e.code)throw fail('The host could not save your character. Try again later.',503);throw fail(e.message,e.status||400);}return;
   }
   if(req.method==='POST'&&['/api/action','/api/chat'].includes(url.pathname)){
    this.limited('moves:'+s.seat,60);const d=await body(req),table=this.table();
    if(url.pathname==='/api/action'){table.human(d,s.seat);this.interrupt('Game action took priority.');json(res,200,this.guestStatus(d.after||0,s.seat));}
    else{table.addChat(s.seat,d.text,{targets:d.targets||[],topicId:d.topicId||null});this.interrupt('Chat took priority.');json(res,200,{ok:true});}return;
   }
   throw fail('This control is available only to the host.');
  }catch(e){if(!res.headersSent)json(res,e.status||400,{error:e.status?e.message:'The move could not be completed. Refresh the board and try again.'});else res.end();}
 }
}
module.exports={InternetHosting};
