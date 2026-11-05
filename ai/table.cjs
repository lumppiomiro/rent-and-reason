'use strict';
const {Game,boardFor,Boards}=require('../engine.js');
const {randomUUID}=require('node:crypto');
const {AgentSession,RULES_HASH}=require('./session.cjs');
const {StrategyPolicy}=require('./policy.cjs');
const S=require('./strategy.cjs');
const Usage=require('../usage.js');
const Trophies=require('../trophies.js');
const MatchData=require('../match-data.js');
const Social=require('./social.cjs');
const Negotiation=require('./negotiation.cjs');
const I18n=require('../fi.js');
const {GameClock}=require('../game-time.js');
const Retry=require('./retry.cjs');
const Memory=require('../character-memory.js');
const Matchup=require('../matchup.js');
const Tournament=require('../tournament.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function validateOptions(options){
 if(!options||!Array.isArray(options.players)||options.players.length<2||options.players.length>4)throw Error('Choose 2–4 seats.');
 options=clone(options);if(options.preMatch!==undefined&&typeof options.preMatch!=='boolean')throw Error('Choose pre-match introductions on or off.');if(options.boardId!==undefined&&!Boards.EDITIONS[options.boardId])throw Error('Unknown board edition.');if(options.language!==undefined&&!['en','fi'].includes(options.language))throw Error('Unknown language.');
 options.players=options.players.map((p,i)=>{
  if(!p||!['human','heuristic','ollama','codex','claude','openrouter','openai','gemini','deepseek','groq','lmstudio','compatible'].includes(p.type))throw Error('Unknown player type.');
  if(['ollama','codex','claude','openrouter','openai','gemini','deepseek','groq','lmstudio','compatible'].includes(p.type)&&(typeof p.model!=='string'||!p.model||p.model.length>150))throw Error('Choose an installed / available model for each AI seat.');
  if(p.learningEnabled!==undefined&&typeof p.learningEnabled!=='boolean')throw Error('Choose learning on or off.');
  if(p.characterId!==undefined&&!Memory.validId(p.characterId))throw Error('Invalid character ID.');
  if(p.piece!==undefined&&!require('../engine.js').PIECES.includes(p.piece))throw Error('Choose a valid playing piece.');if(p.color!==undefined&&!require('../engine.js').PLAYER_COLORS.some(c=>c[0]===p.color))throw Error('Choose a valid player colour.');
  return{...(p.piece?{piece:p.piece}:{}),...(p.color?{color:p.color}:{}),...(p.learningEnabled!==undefined?{learningEnabled:p.learningEnabled}:{}),...(p.characterId?{characterId:p.characterId}:{}),...(p.newCharacter===true?{newCharacter:true}:{}),type:p.type,model:p.model||'',name:String(p.name||['You','Ada','Jasper','Cleo'][i]).slice(0,24),...Social.profile(p),effort:['low','medium','high'].includes(p.effort)?p.effort:'medium'};
 });
 return options;
}
class Table{
 constructor(options,providers,{saved=null,tournament=null,persist=()=>{},audit=null,delay=1800,trophies=()=>Trophies.empty(),memories=null,retryDelays=Retry.DEFAULT_DELAYS,now=()=>Date.now()}={}){
  this.tournament=(saved?.tournament||tournament)?Tournament.validate(saved?.tournament||tournament):null;
  this.preMatch=saved?.preMatch?clone(saved.preMatch):!saved&&options?.preMatch?{version:1,state:'waiting',roster:[]}:null;
  this.retryDelays=retryDelays.slice(0,2).map(n=>Math.max(0,Number(n)||0));this.retryState=saved?.retryState?{...saved.retryState,suspended:true}:null;this.postMatchStarted=!!saved?.postMatchStarted;
  this.memoryStore=memories;this.memoryTrace=Memory.normalizeTrace(saved?.memoryTrace);this.reflectionUsage=Array.isArray(saved?.reflectionUsage)?saved.reflectionUsage:[];
  this.trophiesFn=trophies;this.auditFn=audit;this.auditRun=randomUUID();
  this.providers=providers;this.persistFn=persist;this.delay=delay;this.id=saved?.id||randomUUID();this.options=validateOptions(saved?.options||options);
  this.game=saved?Game.load(saved.game):new Game(this.options);if(this.preMatch&&(!['waiting','started'].includes(this.preMatch.state)||!Array.isArray(this.preMatch.roster)||this.preMatch.state==='waiting'&&(this.game.s.phase!=='roll'||this.game.s.round!==1||this.game.s.props.some(p=>p.owner!==null)||this.game.s.players.some(p=>p.pos!==0))))throw Error('Invalid pre-match state.');this.clock=new GameClock(saved?.timing,{now,legacy:!!saved,finished:this.game.s.phase==='over'});this.revision=saved?.revision||0;this.chat=saved?.chat||[];this.offer=saved?.offer||null;this.sequence=0;this.frames=[];this.running=false;this.thinking=null;this.error=null;this.timer=null;this.disposed=false;this.epoch=0;this.sessions=new Map();this.bidCaps=new Map();this.auctionSerial=saved?.auctionSerial||0;this.manageCount=0;this.chatQueue=saved?.chatQueue||[];this.replyRequests=saved?.replyRequests||[];this.pendingProfiles=new Map();this.profileVersion=saved?.profileVersion||0;this.socialState=saved?.socialState||{casualRound:{}};this.chatLast=false;
  for(const r of this.replyRequests)if(r.state==='answering'){r.state='failed';r.error='Reply interrupted by host restart; tag again to retry.';delete r.contextState;delete r.recentChat;}
  this.chatQueue=this.chatQueue.map(q=>{let r=this.replyRequests.find(r=>r.id===q.id);if(!r){r=q;this.replyRequests.push(r);}Object.assign(r,q,{state:'queued'});return r;});
  if(this.offer&&(typeof this.offer.id!=='string'||!Number.isInteger(this.offer.depth)||this.offer.depth<0||!Negotiation.validMetadata(this.offer)||this.game.validateTrade(this.offer.from,this.offer.to,this.offer.give,this.offer.take,this.offer.giveCash,this.offer.takeCash)))throw Error('Invalid pending trade offer.');
  if(memories)this.options.players=memories.bind(this.options.players.map((p,i)=>({...p,piece:p.piece||this.game.s.players[i].piece,color:p.color||this.game.s.players[i].color})),{legacy:!!saved,preserveProfiles:!!saved});
  if(this.tournament){const expected=Tournament.options(this.tournament).players;if(expected.length!==this.options.players.length||expected.some((p,i)=>p.name!==this.options.players[i].name||p.type!==this.options.players[i].type||p.model&&p.model!==this.options.players[i].model||p.characterId&&p.characterId!==this.options.players[i].characterId))throw Error('Tournament roster does not match the table.');Tournament.bind(this.tournament,this.options.players);}
  this.policy=new StrategyPolicy(saved?.strategyPolicy);this.policy.turn(this.game);
  this.decisions=saved?.decisions||[];this.note=saved?'Restored and paused. Agent context will rebuild from the saved state and private notes.':'Ready. Start the table or step one AI decision.';
  this.options.players.forEach((c,id)=>{if(['ollama','codex','claude','openrouter','openai','gemini','deepseek','groq','lmstudio','compatible'].includes(c.type))this.sessions.set(id,new AgentSession(id,{...c},providers[c.type],saved?.agents?.[id]));});
  for(const [id,session]of this.sessions)this.game.s.controllers[id].personality=session.config.personality;
  this.journal('sessionStart',{rulesVersion:RULES_HASH,restored:Boolean(saved),options:this.options,state:S.publicState(this.game),offer:this.offer,agentPlans:Object.fromEntries([...this.sessions].map(([id,s])=>[id,s.memory])),coverageFromRevision:this.revision});
  this.matchHistory=new MatchData.Tracker(this.game.s,{saved:saved?.matchHistory,complete:!saved,revision:this.revision});this.matchHistory.attach(this.game,()=>this.revision+1);this.historyBefore=MatchData.publicState(this.game.s);
  if(this.preMatch?.state==='waiting'&&!saved)this.prepareMatchup();
  this.record(null,false);this.save();
 }
 prepareMatchup(){
  this.preMatch.roster=Matchup.roster(this.options.players,this.trophiesFn(),seat=>this.memoryStore?.recall(this.options.players,seat,{chat:true}));
  for(const [to]of this.sessions){const q={id:randomUUID(),to,from:null,messageId:null,text:Matchup.invitation,round:1,revision:this.revision,created:Date.now(),state:'queued',kind:'pre-match',automatic:true,contextState:S.publicState(this.game),recentChat:[]};this.chatQueue.push(q);this.replyRequests.push(q);}
  this.options.players.forEach((p,seat)=>{if(p.type==='heuristic')this.addChat(seat,Matchup.greeting(p.name,seat,this.game.s.language),{kind:'pre-match'});});
  this.note='The players are arriving. Start the match whenever you are ready.';
 }
 startMatch({id=this.id,revision=this.revision}={}){
  if(id!==this.id||revision!==this.revision)throw Error('The table changed. Reopen this matchup before starting.');
  if(this.preMatch?.state!=='waiting')return this.status();
  // Abort the social call and discard late replies before allowing any game action.
  this.pause('Starting the match.');this.preMatch.state='started';this.preMatch.startedAt=Date.now();this.preMatch.openingRemarks=Matchup.callbacks(this.chat);const status=this.run();this.save();return status;
 }
 retryFailure(error,{seat,revision,manual=false,model=false}={}){
  if(!model||this.epoch!==this.failureEpoch||this.revision!==revision||!Retry.retryable(error))return false;
  const attempt=this.retryState?.revision===revision&&this.retryState.seat===seat?this.retryState.attempt+1:1;
  if(attempt>this.retryDelays.length)return false;
  this.retryState={seat,revision,attempt,nextAt:Date.now()+this.retryDelays[attempt-1],step:manual,suspended:false,...(/output limit|timed? out|timeout/i.test(error.message)?{effort:'low'}:{})};
  this.error=null;this.note=`Retrying ${this.game.s.players[seat].name}: attempt ${attempt} of ${this.retryDelays.length}.`;this.journal('decisionRetry',{seat,revision,attempt,error:error.message});return true;
 }
 finishGame(){
  if(this.game.s.phase!=='over')return;this.clock.finish();if(this.postMatchStarted)return;this.postMatchStarted=true;
  for(const [to]of this.sessions){const q={id:randomUUID(),to,from:null,messageId:null,openingRemarks:this.preMatch?.openingRemarks||[],text:'The match has just ended. Start the post-match conversation with one short, complete comment in your character voice: react to the result or a verified public highlight. You may address a rival playfully. Do not claim a deal or action occurred without evidence, disclose private plans, or ask another model to wake up. Avoid repeating the previous closing comments.',round:this.game.s.round,revision:this.revision,created:Date.now(),state:'queued',kind:'post-match',automatic:true,contextState:S.publicState(this.game),recentChat:[]};this.chatQueue.push(q);this.replyRequests.push(q);}
  this.replyRequests=this.replyRequests.slice(-24);
 }
 journal(type,data={}){this.auditFn?.({tableId:this.id,runId:this.auditRun,revision:this.revision,round:this.game.s.round,type,data});}
 status(after=0){
  const missed=this.frames.length&&after<this.frames[0].seq-1;
  const metrics=[...this.sessions].map(([id,s])=>({id,type:s.config.type,model:s.config.model,context:s.last?'session + deltas':'snapshot on next decision',...(this.memoryStore?this.memoryStore.metrics(this.id,id,s.metrics,this.reflectionUsage):s.metrics)}));
  const spectator=!this.options.players.some(p=>p.type==='human');
  return{id:this.id,tournament:this.tournament?Tournament.view(this.tournament):null,preMatch:this.preMatch,timing:this.clock.sample(),retry:this.retryState?{seat:this.retryState.seat,attempt:this.retryState.attempt,maxRetries:this.retryDelays.length,nextAt:this.retryState.nextAt,suspended:this.retryState.suspended||false,effort:this.retryState.effort}:null,characterMemoryVersion:this.memoryStore?1:0,characterRoster:this.options.players.map((p,seat)=>({seat,characterId:p.characterId,name:p.name,...(this.memoryStore?{needsAppearanceMigration:!this.memoryStore.data.characters[p.characterId]?.appearanceSaved}:{})})),trophyVersion:1,postMatchChatVersion:1,result:this.trophiesFn().matches.find(m=>m.id===this.id)||Trophies.match(this.game.s,this.options.players,this.id),publicStatus:1,spectator,languageVersion:1,boardVersion:1,socialVersion:1,negotiationVersion:1,profilesVersion:this.profileVersion,socialProfiles:this.options.players.map(p=>Social.profile(p)),profilePresets:{voices:Object.keys(Social.VOICES),chattiness:Object.keys(Social.CHATTINESS)},pendingProfileSeats:[...this.pendingProfiles.keys()],replyRequests:this.replyRequests.slice(-12).map(({id,to,from,messageId,state,created,round,revision,error,retries,nextAt,automatic,kind})=>({id,to,from,messageId,state,created,round,revision,error,retries,nextAt,automatic,kind})),revision:this.revision,sequence:this.sequence,running:this.running,thinking:this.thinking,error:this.error,note:this.note,actor:S.actor(this.game,this.offer),offer:this.offer,chat:this.chat.slice(-50),decisions:spectator?this.decisions.slice(-12):[],metrics,modelUsage:Usage.aggregate(metrics),frames:missed||!after?[]:this.frames.filter(f=>f.seq>after),snapshot:missed||!after?S.publicState(this.game):null};
 }
 record(id,rolled,track=false){if(track&&this.game.s.phase==='over')this.finishGame();if(track){this.matchHistory.observe(this.historyBefore,this.game.s,this.game.events||[],this.revision);}this.historyBefore=MatchData.publicState(this.game.s);this.sequence++;this.frames.push({seq:this.sequence,revision:this.revision,actor:id,rolled,state:S.publicState(this.game),events:clone(this.game.events||[])});if(this.frames.length>300)this.frames.shift();}
 save(){if(this.tournament)Tournament.record(this.tournament,this.game.s,this.id);if(this.memoryStore)this.reflectionUsage=[...new Map([...this.reflectionUsage,...this.memoryStore.jobsFor(this.id)].map(j=>[j.id,j])).values()];this.persistFn({tournament:this.tournament,preMatch:this.preMatch,timing:this.clock.save(),retryState:this.retryState,postMatchStarted:this.postMatchStarted,reflectionUsage:this.reflectionUsage,memoryTrace:this.memoryTrace,matchHistory:this.matchHistory.capture(this.chat,this.options.players,this.game.s,this.revision),format:'rent-reason-ai-table',version:1,id:this.id,audit:this.auditFn?{version:1,tableId:this.id,runId:this.auditRun}:undefined,options:this.options,game:this.game.s,revision:this.revision,chat:this.chat,offer:this.offer,decisions:this.decisions.slice(-100),strategyPolicy:this.policy.save(),auctionSerial:this.auctionSerial,socialState:this.socialState,profileVersion:this.profileVersion,chatQueue:this.chatQueue,replyRequests:this.replyRequests.slice(-24),agents:Object.fromEntries([...this.sessions].map(([id,s])=>[id,s.save()]))});}
 pause(note='Paused.'){this.retryState=null;this.clock.pause();for(const request of this.replyRequests)if(['queued','answering'].includes(request.state)){request.state='cancelled';delete request.contextState;delete request.recentChat;}this.chatQueue=[];this.running=false;this.nextStep=false;clearTimeout(this.timer);this.epoch++;this.abort?.abort();this.thinking=null;this.note=note;this.save();}
 dispose(){this.pause();this.disposed=true;for(const s of this.sessions.values())s.reset();}
 run(){if(this.preMatch?.state==='waiting')return this.startMatch();this.error=null;this.retryState=null;this.running=true;if(this.game.s.phase!=='over')this.clock.resume();this.note='Table running. Human decisions wait for you.';this.schedule(20);return this.status();}
 setLanguage(language){
  if(!['en','fi'].includes(language))throw Error('Unknown language.');
  if(this.thinking||this.inFlight)throw Error('Wait for the current model response before changing language.');
  if(this.game.s.card)this.game.s.card.text=Boards.cardText(this.game.s.card,this.game.s,language);this.game.s.language=language;this.options.language=language;this.revision++;for(const s of this.sessions.values())s.reset();this.record(null,false);this.save();return this.status();
 }
 setEfforts({revision,efforts}){
  if(this.running||this.thinking||this.inFlight)throw Error('Pause the table and wait for the current decision to stop before changing effort.');
  if(revision!==this.revision)throw Error('The table changed. Catch up before changing effort.');
  if(!Array.isArray(efforts)||efforts.length!==this.options.players.length||efforts.some(e=>!['low','medium','high'].includes(e)))throw Error('Choose a valid effort for every seat.');
  let changed=false;const changedPlayers=[];for(const [id,s]of this.sessions){const effort=efforts[id];if(s.config.effort===effort)continue;changed=true;s.reset();s.config.effort=effort;this.options.players[id].effort=effort;this.game.s.controllers[id].effort=effort;changedPlayers.push(this.options.players[id]);}
  if(changed){this.memoryStore?.syncProfiles(changedPlayers,{fields:['effort']});this.revision++;this.note='Thinking effort updated. Resume when ready.';this.record(null,false);this.save();}return this.status();
 }
 applyProfiles(){if(this.inFlight)return;for(const [id,settings]of this.pendingProfiles){const session=this.sessions.get(id);if(session){session.reset();Object.assign(session.config,settings);}this.game.s.controllers[id].personality=settings.personality;}this.pendingProfiles.clear();}
 updateProfiles({version,profiles}){
  if(version!==this.profileVersion)throw Error('Personality settings changed. Reopen the panel before saving.');
  if(!Array.isArray(profiles)||profiles.length!==this.options.players.length)throw Error('Supply a profile for every seat.');
  const next=profiles.map((p,i)=>{if(!p||!['balanced','builder','trader','defensive'].includes(p.personality)||!Object.hasOwn(Social.VOICES,p.voice)||!Object.hasOwn(Social.CHATTINESS,p.chattiness)||typeof p.customVoice!=='string'||p.customVoice.length>180)throw Error('Choose valid personality settings (custom voice: at most 180 characters).');return Social.profile(p,this.options.players[i].type);});
  const changedPlayers=[];next.forEach((p,id)=>{if(this.sessions.has(id)&&JSON.stringify(p)!==JSON.stringify(Social.profile(this.options.players[id]))){Object.assign(this.options.players[id],p);this.pendingProfiles.set(id,p);changedPlayers.push(this.options.players[id]);}});this.profileVersion++;this.applyProfiles();if(changedPlayers.length)this.memoryStore?.syncProfiles(changedPlayers);this.save();return this.status();
 }
 schedule(ms=this.delay){
  clearTimeout(this.timer);if(this.disposed||this.thinking||this.inFlight)return;
  const now=Date.now(),actor=S.actor(this.game,this.offer),human=this.options.players[actor]?.type==='human'&&!this.game.s.players[actor]?.out;
  const chatReady=this.chatQueue.some(q=>!q.nextAt||q.nextAt<=now);
  if(chatReady&&(!this.running||human||!this.chatLast||this.game.s.phase==='over')){this.timer=setTimeout(()=>void this.respondNext(),Math.min(ms,30));return;}
  if(this.retryState&&!this.retryState.suspended&&(this.running||this.retryState.step)){
   if(this.retryState.revision===this.revision&&this.retryState.seat===actor){this.timer=setTimeout(()=>void this.step(),Math.max(0,this.retryState.nextAt-now));return;}this.retryState=null;
  }
  if(this.preMatch?.state!=='waiting'&&this.running&&this.game.s.phase!=='over'&&!human){this.timer=setTimeout(()=>void this.step(),ms);return;}
  if(this.chatQueue.length)this.timer=setTimeout(()=>void this.respondNext(),chatReady?30:Math.max(10,Math.min(...this.chatQueue.map(q=>q.nextAt||now))-now));
 }

 addChat(id,text,{targets=[],kind='speech',replyTo=null,request=null,topicId=null}={}){
  const observer=id===null&&(this.game.s.phase==='over'||this.preMatch?.state==='waiting'),human=observer||this.options.players[id]?.type==='human';
  // Elimination removes game actions, not the human's place in the conversation.
  if(!observer&&(!this.game.s.players[id]||this.game.s.players[id].out&&!human&&this.game.s.phase!=='over'))throw Error('Choose an active player.');const raw=String(text).trim();if(human&&raw.length>Social.CHAT_MAX_CHARS)throw Error('Keep chat messages within 240 characters.');const clean=human?raw:Social.shortLine(raw,Social.CHAT_MAX_CHARS,{complete:true});if(!clean)return;
  if(human)this.memoryStore?.interrupt('Chat took priority.');
  let recipients=[];
  if(human){if(!Array.isArray(targets)||targets.some(n=>!Number.isInteger(n)))throw Error('Choose a valid tagged player.');recipients=[...new Set([...targets,...Social.mentionTargets(clean,this.options.players)])];if(recipients.some(n=>!this.sessions.has(n)||this.game.s.players[n].out&&this.game.s.phase!=='over'))throw Error('Tag an active model player.');for(const q of this.chatQueue.filter(q=>q.automatic&&recipients.includes(q.to)))q.state='cancelled';this.chatQueue=this.chatQueue.filter(q=>q.state!=='cancelled');if(this.chatQueue.length+recipients.length>6||recipients.some(n=>this.chatQueue.filter(q=>q.to===n).length>=2))throw Error('Too many queued replies. Wait for an answer before tagging again.');}
  const message={...(this.preMatch?.state==='waiting'?{stage:'pre-match'}:{}),id:randomUUID(),seat:id,name:observer?'You (observer)':this.game.s.players[id].name,text:clean,round:this.game.s.round,kind,replyTo,...(request?{contextRevision:request.revision,contextRound:request.round}:{}),targets:recipients};this.chat.push(message);this.chat=this.chat.slice(-100);this.journal('chat',{message});
  const topic=this.chat.find(c=>c.id===topicId&&['trade','auction'].includes(c.kind));
  for(const to of recipients){const q={id:randomUUID(),to,from:id,messageId:message.id,text:clean,round:this.game.s.round,revision:this.revision,created:Date.now(),state:'queued',...(this.preMatch?.state==='waiting'?{stage:'pre-match'}:{}),offer:this.offer&&(!topic||topic.offerId===this.offer.id)?clone(this.offer):null,topic:topic?{kind:topic.kind,text:topic.text,active:topic.active,outcome:topic.outcome||null}:null,contextState:S.publicState(this.game),recentChat:this.chat.slice(-5).map(c=>({name:c.name,text:c.text}))};const at=this.chatQueue.findIndex(q=>q.automatic);if(at<0)this.chatQueue.push(q);else this.chatQueue.splice(at,0,q);this.replyRequests.push(q);}
  this.replyRequests=this.replyRequests.slice(-24);this.save();if(recipients.length)this.schedule(20);return message;
 }
 async respondNext(){
  if(this.inFlight||this.thinking||this.disposed||!this.chatQueue.length)return;if(this.memoryStore?.busy){this.schedule(100);return;}this.applyProfiles();const index=this.chatQueue.findIndex(q=>!q.nextAt||q.nextAt<=Date.now());if(index<0){this.schedule();return;}const request=this.chatQueue.splice(index,1)[0];if(this.game.s.players[request.to]?.out&&this.game.s.phase!=='over'){request.state='cancelled';this.save();this.schedule();return;}
  if(request.automatic)request.recentChat=this.chat.slice(-5).map(c=>({name:c.name,text:c.text}));
  const id=request.to,session=this.sessions.get(id),epoch=this.epoch;this.inFlight=true;this.abort=new AbortController();request.state='answering';this.thinking={seat:id,name:this.game.s.players[id].name,provider:session.config.type,purpose:'chat',requestId:request.id,started:Date.now()};
  const snapshot=Object.create(Game.prototype);snapshot.s=clone(request.contextState);snapshot.events=[];this.save();
  try{const say=await session.reply(snapshot,{...request,trophyMemory:this.careerMemory(),longTerm:this.memoryStore?.recall(this.options.players,id,{chat:true,language:snapshot.s.language}),preMatch:this.preMatch?.state==='waiting'?{roster:this.preMatch.roster}:null,finalStandings:this.trophiesFn().matches.find(m=>m.id===this.id)?.entries,onProgress:p=>{if(epoch===this.epoch&&this.thinking?.requestId===request.id)this.thinking.progress=p;}},this.abort.signal);if(epoch!==this.epoch||this.disposed)return;request.state='answered';delete request.error;this.addChat(id,say,{kind:request.kind||'reply',replyTo:request.messageId,request});}
  catch(e){if(epoch===this.epoch&&!this.disposed){request.error=e.message.slice(0,240);if(request.kind!=='pre-match'&&Retry.retryable(e)&&(request.retries||0)<this.retryDelays.length){request.nextAt=Date.now()+this.retryDelays[request.retries||0];request.retries=(request.retries||0)+1;request.state='queued';this.chatQueue.push(request);}else request.state='failed';}}
  finally{this.inFlight=false;this.chatLast=true;if(epoch===this.epoch)this.thinking=null;if(request.state!=='queued'){delete request.contextState;delete request.recentChat;}this.applyProfiles();this.save();this.schedule();}
 }
 careerMemory(){return Trophies.memory(this.trophiesFn(),this.options.players);}
 speechContext(id){const c=Social.profile(this.options.players[id]),important=this.game.s.phase==='auction'||!!this.offer;return{allowed:important||c.chattiness!=='quiet'&&this.socialState.casualRound[id]!==this.game.s.round,maxChars:Social.CHATTINESS[c.chattiness],reason:important?'negotiation: acknowledge the public bid / offer and your interests, without revealing your limit':'react to one notable recent event, or stay quiet',voice:c.voice};}
 publishSpeech(id,decision,phase,offer){const settings=Social.profile(this.options.players[id]),important=phase==='auction'||!!offer||!!decision.action?.trade;if(!decision.say)return;if(!important&&(settings.chattiness==='quiet'||this.socialState.casualRound[id]===this.game.s.round))return;const text=Social.shortLine(decision.say,Social.CHAT_MAX_CHARS,{complete:true});const cap=decision.action?.cap;if(phase==='auction'&&cap!==undefined&&(/\b(?:cap|ceiling|maximum|budget|up to|limit)\b|enintään|katto|maksimi|yläraja|budjet/iu.test(text)||cap!==this.game.s.auction?.bid&&(text.includes('$'+cap)||text.includes('€'+cap)||new RegExp('\\b'+cap+'\\s*(?:€|euro|dollari)').test(text))))return;if(!text||this.chat.slice(-6).some(c=>c.seat===id&&c.text===text))return;this.addChat(id,text);if(!important)this.socialState.casualRound[id]=this.game.s.round;}
 marketMessage(key,text,meta){if(this.game.s.language==='fi'){const labels={brown:'Brown',sky:'Light blue',pink:'Pink',orange:'Orange',red:'Red',yellow:'Yellow',green:'Green',blue:'Dark blue',rail:'Ferries',utility:'Utilities'};text=I18n.translate(text.replace(/\((brown|sky|pink|orange|red|yellow|green|blue|rail|utility)\)/g,(_,g)=>'('+I18n.translate(labels[g],'fi')+')'),'fi');}text=require('../boards.js').moneyText(text,this.game.s);const existing=this.chat.find(c=>c.topicKey===key);if(existing){existing.text=text.slice(0,600);Object.assign(existing,meta);existing.version=(existing.version||0)+1;}else this.chat.push({id:randomUUID(),topicKey:key,seat:null,name:'Table',text:text.slice(0,600),round:this.game.s.round,version:1,...meta});this.chat=this.chat.slice(-100);}
 announceMarket(before,id,action){
  const g=this.game,previous=before.auction,current=g.s.auction;
  if(previous){const b=this.game.board[previous.id],live=current?.id===previous.id?current:null,owner=g.s.props[b.id].owner,payment=g.events.find(e=>e.type==='money'&&e.kind==='purchase'&&e.reason==='Auction: '+b.name),price=payment?Math.abs(payment.changes[0].amount):previous.bid;
   const text=live?`${b.name} (${b.group}) · ${live.high===null?'Opening bid $1':'Public bid $'+live.bid+' by '+g.s.players[live.high].name}${action.id==='pass'?' · '+g.s.players[id].name+' passes':''}.`:`${b.name} (${b.group}) · ${owner===null?'No sale; stays with the bank.':'Sold to '+g.s.players[owner].name+' for $'+price+'.'}`;
   this.marketMessage('auction:'+before.auctionSerial+':'+b.id,text,{kind:'auction',property:b.id,active:!!live,askSeats:g.active.filter(p=>this.sessions.has(p.id)).map(p=>p.id)});
  }
  if(current&&(!previous||current.id!==previous.id)){const b=this.game.board[current.id];this.marketMessage('auction:'+this.auctionSerial+':'+b.id,`${b.name} (${b.group}) is up for auction. Opening bid $1.`,{kind:'auction',property:b.id,active:true,askSeats:g.active.filter(p=>this.sessions.has(p.id)).map(p=>p.id)});}
  if(this.offer&&this.offer.id!==before.offer?.id){const o=this.offer,names=ids=>ids.length?ids.map(n=>this.game.board[n].name+' ('+this.game.board[n].group+')').join(', '):'no deeds';this.marketMessage('offer:'+o.id,`${g.s.players[o.from].name} ${(o.depth||0)>0?'counteroffers':'offers'} ${names(o.give)} + $${o.giveCash} for ${names(o.take)} + $${o.takeCash} from ${g.s.players[o.to].name}.`,{kind:'trade',counter:(o.depth||0)>0,offerId:o.id,offer:clone(o),active:true,askSeats:[o.from,o.to].filter(n=>this.sessions.has(n))});}
  if(before.offer&&before.offer.id!==this.offer?.id){const entry=this.chat.find(c=>c.offerId===before.offer.id);if(entry){entry.active=false;entry.outcome=action.id==='accept'?'Accepted':this.offer?'Countered':'Declined';entry.version=(entry.version||0)+1;}}
 }
 insights(){if(this.options.players.some(p=>p.type==='human'))throw Error('AI insights are available only in games with no human seat.');return{revision:this.revision,round:this.game.s.round,decisions:this.decisions.slice(-18).map(d=>({...d,action:d.action.startsWith('cap:')?'Authorize auction limit $'+d.action.slice(4):d.action})),plans:[...this.sessions].map(([seat,s])=>({seat,name:this.game.s.players[seat].name,plan:Social.cleanPlan(s.memory,this.game,seat)}))};}
 choiceReport(id){
  if(this.preMatch?.state==='waiting')return{available:[],blocked:[]};
  const automatic=this.options.players[id].type!=='human',available=[],blocked=[];
  const actions=S.legalActions(this.game,id,{offer:this.offer,allowTrade:!automatic||this.policy.canPropose(this.game,id)});
  for(const action of actions){const reason=automatic?this.policy.actionReason(this.game,id,action,{offer:this.offer}):'';if(reason)blocked.push({action,reason});else available.push(action);}
  return{available,blocked};
 }
 choices(id){return this.choiceReport(id).available;}

 commit(id,a,decision={}){
  if(this.preMatch?.state==='waiting')throw Error('Start the match before playing.');
  this.clock.resume();const g=this.game,phase=g.s.phase,oldAuction=g.s.auction?.id,learningBefore=this.memoryStore?MatchData.publicState(g.s):null;
  if(this.options.players[id].type!=='human'){const reason=this.policy.actionReason(g,id,a,{offer:this.offer});if(reason)throw Error(reason);}
  this.journal('actionStart',{seat:id,phase,offer:this.offer,state:S.publicState(g),action:a,rationale:decision.rationale||'',automatic:this.options.players[id].type!=='human'});
  const before={props:g.s.props.map(p=>({...p})),offer:this.offer,auction:g.s.auction?clone(g.s.auction):null,auctionSerial:this.auctionSerial};g.events=[];
  if(this.offer){
   const offer=this.offer;if(id!==offer.to)throw Error('Only the recipient can answer this offer.');if(a.id==='counter'||a.counter){const error=g.validateTrade(a.trade?.from,a.trade?.to,a.trade?.give,a.trade?.take,a.trade?.giveCash,a.trade?.takeCash)||(this.options.players[id].type==='human'?(a.trade.from!==id||a.trade.to!==offer.from?'Counter the player who made this offer.':''):Negotiation.counterError(offer,id,a.trade));if(error)throw Error(error);}this.offer=null;
   if(a.id==='accept'){
    const r=g.executeTrade(offer.from,offer.to,offer.give,offer.take,offer.giveCash,offer.takeCash);if(!r.ok)throw Error(r.text);
    if(g.s.phase==='debt'&&g.s.players[g.s.debt.from].cash>=g.s.debt.amount)g.settle();
   }else if(a.id==='counter'||a.counter){this.offer={...a.trade,id:randomUUID(),depth:(offer.depth||0)+1,counterSeats:[...new Set([...Negotiation.counterSeats(offer),id])],previousId:offer.id};g.log(`${g.s.players[id].name} makes a counteroffer.`);}else g.log(`${g.s.players[id].name} declines the trade.`);
  }else if(a.trade){
   const t=a.trade,error=g.validateTrade(t.from,t.to,t.give,t.take,t.giveCash,t.takeCash);if(error)throw Error(error);
   this.offer={...t,id:randomUUID(),depth:0,counterSeats:[]};delete this.offer.report;g.log(`${g.s.players[id].name} proposes a trade to ${g.s.players[t.to].name}.`);
  }else{
   if(a.cap!==undefined)this.bidCaps.set(`${this.auctionSerial}:${id}`,a.cap);
   if(!S.apply(g,id,a))throw Error('That action is no longer available.');
  }
  if(phase!=='auction'&&g.s.phase==='auction'||oldAuction!==undefined&&g.s.auction&&oldAuction!==g.s.auction.id){this.auctionSerial++;this.bidCaps.clear();}
  if(phase==='end'&&a.id==='end')this.manageCount=0;else if(['roll','end'].includes(phase))this.manageCount++;
  this.policy.observe(g,id,a,before);if(learningBefore)Memory.observe(this.memoryTrace,learningBefore,g,g.events,id,a,this.revision+1,S.risk(g,id));
  if(!this.running)this.clock.pause();this.revision++;this.chatLast=false;this.announceMarket(before,id,a);this.publishSpeech(id,{...decision,action:a},phase,before.offer);
  if(decision.rationale)this.decisions.push({seat:id,round:g.s.round,action:a.id,rationale:decision.rationale});this.decisions=this.decisions.slice(-100);
  this.note=`${g.s.players[id].name}: ${a.cap!==undefined?'places a bid.':a.id==='pass'?'passes.':a.id==='accept'?'accepts the trade.':a.id==='reject'?'declines the trade.':a.counter?'makes a counteroffer.':a.trade?'proposes a trade.':a.label}`;this.record(id,a.id==='roll',true);this.save();
  try{this.journal('actionComplete',{seat:id,action:a,offer:this.offer,state:S.publicState(g),events:g.events,rationale:decision.rationale||''});}catch(error){this.pause('Audit journal unavailable. The completed action was saved; retry after fixing local storage.');throw error;}
 }
 async step(){
  if(this.preMatch?.state==='waiting')return;
  if(this.memoryStore?.busy){this.schedule(100);return;}
  if(this.inFlight){if(!this.thinking)this.nextStep=true;return;}if(this.thinking||this.disposed||this.game.s.phase==='over')return;
  const id=S.actor(this.game,this.offer);if(this.retryState&&(this.retryState.seat!==id||this.retryState.revision!==this.revision))this.retryState=null;const config=this.options.players[id];if(config.type==='human'&&!this.game.s.players[id].out){this.note='Waiting for your decision.';return;}
  this.applyProfiles();this.clock.resume();this.inFlight=true;const epoch=this.epoch,revision=this.revision;this.failureEpoch=epoch;let modelCall=false;this.abort=new AbortController();this.thinking={seat:id,name:this.game.s.players[id].name,provider:config.type,started:Date.now()};this.error=null;
  try{
   const choices=this.choiceReport(id);let actions=choices.available,decision;
   if(!actions.length)throw Error('No legal action available.');
   // Guard against endless property management. This is visible to the agent in its choices.
   if(this.manageCount>=18&&!this.offer&&['roll','end'].includes(this.game.s.phase)){choices.blocked.push(...actions.filter(a=>!['roll','end'].includes(a.id)).map(action=>({action,reason:'Per-turn management limit reached.'})));actions=actions.filter(a=>['roll','end'].includes(a.id));}
   this.journal('decisionStart',{seat:id,provider:config.type,model:config.model,effort:config.effort,rulesVersion:RULES_HASH,profile:config,strategy:this.policy.context(this.game,id),risk:S.risk(this.game,id),state:S.publicState(this.game),offer:this.offer,actions,blocked:choices.blocked});
   let cap=this.bidCaps.get(`${this.auctionSerial}:${id}`);if(cap!==undefined&&cap<this.game.s.auction?.bid+1&&!actions.some(a=>a.id==='pass')){this.bidCaps.delete(`${this.auctionSerial}:${id}`);cap=undefined;}
   if(this.game.s.phase==='auction'&&!this.offer&&cap!==undefined){
    const min=this.game.s.auction.bid+1;decision={action:cap>=min?{id:'cap:'+cap,label:`Continue bidding within the authorized limit`,cap}:actions.find(a=>a.id==='pass')};
   }else if(actions.length===1&&['roll','end','settle','decline','pass'].includes(actions[0].id))decision={action:actions[0],rationale:'Only one legal choice; executed without a model call.'};
   else if(config.type==='heuristic')decision={action:actions.slice().sort((a,b)=>b.score-a.score)[0],rationale:'Programmatic strategy: weighs set value, survival reserve and current legal choices.'};
   else{modelCall=true;decision=await this.sessions.get(id).decide(this.game,actions,{revision,retryEffort:this.retryState?.effort,audit:(type,data)=>this.journal(type,{seat:id,...data}),chat:this.chat,offer:this.offer,allowTrade:this.policy.canPropose(this.game,id),strategy:this.policy.context(this.game,id),career:this.careerMemory(),longTerm:this.memoryStore?.recall(this.options.players,id,{phase:this.game.s.phase,offer:!!this.offer,actions,language:this.game.s.language,boardId:this.game.s.boardId||'lantern-harbor',rules:this.game.s.rules}),longTermKey:this.memoryStore?JSON.stringify([this.options.players[id].characterId,...[this.memoryStore.data.characters[this.options.players[id].characterId]].flatMap(c=>[c.epoch,c.enabled,c.lessons])]):'',speech:this.speechContext(id),onProgress:p=>{if(epoch===this.epoch&&revision===this.revision&&this.thinking)this.thinking.progress={...p,updated:Date.now()};},validateTrade:t=>this.policy.actionReason(this.game,id,{id:'custom:proposal',trade:t,counter:!!this.offer},{offer:this.offer})},this.abort.signal);}
   if(this.disposed||epoch!==this.epoch||revision!==this.revision)return;
   modelCall=false;this.commit(id,decision.action,decision);this.retryState=null;
  }catch(e){if(epoch===this.epoch&&!this.disposed){if(this.retryFailure(e,{seat:id,revision,manual:!this.running,model:modelCall})){this.save();}else{const exhausted=!!this.retryState;this.retryState=null;this.running=false;try{this.journal('decisionError',{seat:id,error:e.message});}catch{}this.error=`${this.game.s.players[id].name}: ${e.message}`;this.note=exhausted?'Paused after automatic retries. Review the provider error, then use Run / retry.':'Paused. Review the provider error, then use Run / retry.';this.save();}}}
  finally{this.inFlight=false;if(!this.running||this.game.s.phase==='over')this.clock.pause();if(epoch===this.epoch)this.thinking=null;this.applyProfiles();this.save();const again=this.nextStep;this.nextStep=false;if(again&&!this.disposed)void this.step();else this.schedule();}
 }
 human({revision,action,amount,trade,offerId},seat=0){
  if(this.preMatch?.state==='waiting')throw Error('Start the match before playing.');
  if(revision!==this.revision)throw Error('The table changed. Wait for playback to catch up and try again.');
  const id=S.actor(this.game,this.offer);if(this.options.players[id]?.type!=='human'||this.thinking&&this.thinking.purpose!=='chat')throw Error('Wait for the human seat.');
  if(id!==seat)throw Error('It is another player’s turn. You can control only your own seat.');
  if(offerId!==undefined&&this.offer?.id!==offerId)throw Error('This offer has changed. Review the latest terms.');
  let a=this.choices(id).find(a=>a.id===action);
  if(action==='bid'&&this.game.s.phase==='auction'&&Number.isSafeInteger(amount)&&amount>this.game.s.auction.bid&&amount<=this.game.s.players[id].cash){a={id:'cap:'+amount,label:`Bid $${amount}`,cap:amount}; // Exact human bid, no remembered auto-bidding.
   this.journal('actionStart',{seat:id,action:{id:'bid',amount},state:S.publicState(this.game),offer:this.offer});
   const before={auction:this.game.s.auction?clone(this.game.s.auction):null,auctionSerial:this.auctionSerial,offer:this.offer};this.game.events=[];if(!this.game.bid(amount))throw Error('Invalid bid.');this.revision++;this.chatLast=false;this.announceMarket(before,id,{id:'bid'});this.record(id,false,true);this.save();try{this.journal('actionComplete',{seat:id,action:{id:'bid',amount},state:S.publicState(this.game),events:this.game.events});}catch(error){this.pause('Audit journal unavailable. The bid was saved.');throw error;}this.schedule();return;
  }
  if(action==='propose'&&!this.offer&&this.game.canManage(id)){
   if(!trade||trade.from!==id)throw Error('Invalid trade proposer.');
   const t={from:id,to:trade.to,give:trade.give,take:trade.take,giveCash:trade.giveCash,takeCash:trade.takeCash};
   const error=this.game.validateTrade(t.from,t.to,t.give,t.take,t.giveCash,t.takeCash);if(error)throw Error(error);a={id:'trade:human',label:'Propose a trade',trade:t};
  }
  if(action==='counter-propose'&&this.offer){
   if(!trade||trade.from!==id||trade.to!==this.offer.from)throw Error('Counter the player who made this offer.');
   const t={from:id,to:trade.to,give:trade.give,take:trade.take,giveCash:trade.giveCash,takeCash:trade.takeCash};
   const error=this.game.validateTrade(t.from,t.to,t.give,t.take,t.giveCash,t.takeCash);if(error)throw Error(error);a={id:'counter:human',label:'Make an edited counteroffer',trade:t,counter:true};
  }
  if(!a)throw Error('This action is not currently legal.');this.commit(id,a);this.schedule();
 }
}
module.exports={Table,validateOptions};
