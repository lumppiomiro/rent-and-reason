/* Included inside the application closure by build.mjs. */
const AI_HOST_UPDATE='The AI launcher is running an older version. In its Terminal window, press Control-C, reopen Play Rent & Reason.command, then refresh this page. Your autosaved game will resume paused.';
function supportsOpenRouter(){return aiHost?.providers?.includes('openrouter')===true;}
let soundConnectionLost=false;
let aiHost=null,remote=null,aiQueue=[],aiDraining=false,aiPolling=false,providerInfo=null;
async function api(route,data){
 if(typeof lobbyPreview!=='undefined'&&lobbyPreview){if(data!==undefined)throw Error('This preview never changes the ongoing game.');const key=route.split('?')[0];if(key==='match')return lobbyPreview.archives?.[new URLSearchParams(route.split('?')[1]).get('id')];if(!(key in lobbyPreview))throw Error('This preview is read-only. Use the live table for this action.');return structuredClone(lobbyPreview[key]);}
 if(!aiHost)throw Error('Start the AI launcher first.');
 const r=await fetch('/api/'+route,{method:data===undefined?'GET':'POST',headers:{'X-Rent-Reason-Token':aiHost.token,...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});
 const d=await r.json();if(!r.ok){
  let message=d.error||'Host request failed.';
  const profiles=[data?.profile,...(Array.isArray(data?.players)?data.players:[])].filter(Boolean);
  if(typeof RentReason!=='undefined'&&((message==='Choose a valid playing piece.'||message==='Choose a valid piece.')&&profiles.some(p=>RentReason.PIECES.includes(p.piece))||message==='Choose a valid player colour.'&&profiles.some(p=>RentReason.PLAYER_COLORS.some(c=>c[0]===p.color))))message='The browser has newer pieces or colours than the running host. Pause the game, run Play Rent & Reason.command, then retry saving. Your current game and saved characters are preserved.';
  throw Object.assign(Error(message),{status:r.status});
 }return d;
}
function remoteView(s,events=[]){const g=Object.create(Game.prototype);g.s=s;g.events=events;return g;}
function setRemote(status){
 soundConnectionLost=false;
 const keepLobby=modal==='lobby';
 if(tableStats&&remote?.id===status.id&&status.revision>remote.revision&&tableStatsKey===status.id){tableStats.hasGaps=true;savePref('tabletop-stats-'+status.id,JSON.stringify(tableStats));}
 if(remote?.id===status.id&&status.revision<remote.revision){savePref('tabletop-stats-'+status.id,'null');tableStatsKey='';tableStats=null;}
 if(remote?.id!==status.id||status.revision<remote.revision)unseenBankruptcies=[];
 if(remote?.id!==status.id){lastTradeReceipt=null;tableStatsKey='';resultsSeen=null;rackSeat=mySeat();rackHover=null;offerArchive.clear();}
 document.body.classList.add('ai-connected');
 remote={id:status.id,received:status.sequence,applied:status.sequence,revision:status.revision,status,latest:status.sequence};aiQueue=[];
 animationEpoch++;continueCard();busy=false;game=remoteView(status.snapshot);displayPositions=[];displayBalances=[];displayOut=[];lastReceipt=null;$('token-layer').innerHTML='';firstRun=false;closeModal();render(false);renderAi();if(status.preMatch?.state==='waiting')showMatchup();else if(keepLobby)renderLobby();
}
async function pollAi(){
 if(!remote||aiPolling)return;aiPolling=true;
 try{const status=await api('table?after='+remote.received);if(!status||status.id!==remote.id){if(status)setRemote(await api('table'));return;}
  if(soundConnectionLost){playCue('connection');soundConnectionLost=false;}Feedback.notificationCues(remote.status,status,mySeat()).forEach(cue=>playCue(cue));
  remote.status=status;remote.latest=status.sequence;
  if(status.snapshot){setRemote(status);return;}
  for(const f of status.frames)if(f.seq>remote.received){aiQueue.push(f);remote.received=f.seq;}
  renderAi();void drainAi();
 }catch(e){if(!soundConnectionLost){playCue('error');soundConnectionLost=true;}if(isGuest()&&e.status===401){remote=null;aiHost=null;showOnlineJoin(e.message);return;}$('ai-status')&&($('ai-status').textContent='Host disconnected. Keep the AI launcher running. '+e.message);}finally{aiPolling=false;}
}
async function drainAi(){
 if(aiDraining||busy||modal||!remote)return;aiDraining=true;
 try{while(aiQueue.length&&remote&&!modal){const f=aiQueue.shift();await perform(()=>{game=remoteView(f.state,Experience.withTradeReceipts(game.s,f.state,f.events));remote.applied=f.seq;remote.revision=f.revision;},f.rolled);}}
 finally{aiDraining=false;if(remote)renderAi();}
}
function tradeText(t){const names=ids=>ids.length?ids.map(i=>B[i].name).join(', '):'no property';return`${game.s.players[t.from].name} ${(t.depth||0)>0?'counteroffers':'offers'} ${names(t.give)} + ${money(t.giveCash)} for ${names(t.take)} + ${money(t.takeCash)}.`;}
function renderAi(){
 if(typeof syncTournament==='function')syncTournament();
 let panel=$('ai-panel');if(!panel){panel=document.createElement('section');panel.id='ai-panel';panel.className='panel ai-panel';$('table-host-controls').appendChild(panel);}
 if(!remote){panel.innerHTML='';panel.classList.add('hidden');return;}panel.classList.remove('hidden');
 if(!$('ai-status'))panel.innerHTML=`<div class="panel-title"><h2>AI table</h2><span class="ai-local">LOCAL HOST</span></div><p id="ai-status" role="status"></p><div id="ai-error" role="alert"></div><div class="ai-transport"><button class="small" data-action="ai-run">Run / retry</button><button class="small" data-action="ai-pause">Pause</button><button class="small quiet" data-action="ai-catchup">Catch up</button></div><details class="ai-table-settings"><summary>Table controls <small>Personalities · usage · setup</small></summary><div class="ai-controls"><button class="small" data-action="ai-step">Step</button><button class="small quiet" data-action="usage">Tokens & €</button><button class="small quiet" data-action="ai-setup">New table</button><button class="small quiet" data-action="ai-audit">Export audit</button></div></details><div id="ai-offer"></div>`;
 const chatPanel=$('chat-panel');chatPanel.classList.remove('hidden');if(!$('ai-chat'))chatPanel.innerHTML=`<div class="panel-title"><h2>Player chat</h2><button class="small quiet" data-action="usage">Usage ↗</button></div><div id="ai-chat" class="ai-chat" role="log"></div><button id="chat-latest" class="chat-latest" type="button" hidden>New messages ↓</button><div id="ai-reply-status" class="ai-reply-status"></div><div id="ai-compose" class="ai-compose"><select id="ai-chat-target" aria-label="Chat reply target"><option value="">Table chat</option></select><input id="ai-message" maxlength="240" placeholder="Talk to the table…" aria-label="Message to game players"><button class="small" data-action="ai-send">Send</button></div>`;
 if(!busy)[...panel.querySelectorAll('button'),...chatPanel.querySelectorAll('button')].forEach(b=>b.disabled=false);
 const s=remote.status;if(s.offer)offerArchive.set(s.offer.id,structuredClone(s.offer));if(offerArchive.size>30)offerArchive.delete(offerArchive.keys().next().value);
 const spectator=s.spectator??game.s.controllers.every(c=>c.type!=='human'),publicNote=s.publicStatus||spectator?s.note:'',backlog=Math.max(0,s.sequence-remote.applied),wait=s.actor!==null?game.s.players[s.actor]?.name:'';
 if(!panel.querySelector('[data-action="ai-personalities"]')){const b=document.createElement('button');b.className='small quiet';b.dataset.action='ai-personalities';b.textContent='AI personalities';panel.querySelector('.ai-controls').appendChild(b);}
 panel.querySelector('[data-action="ai-personalities"]').disabled=!s.socialVersion;
 if(!panel.querySelector('[data-action="ai-insights"]')){const b=document.createElement('button');b.className='small quiet';b.dataset.action='ai-insights';b.textContent='AI insights';panel.querySelector('.ai-controls').appendChild(b);}panel.querySelector('[data-action="ai-insights"]').classList.toggle('hidden',!spectator);panel.querySelector('[data-action="ai-insights"]').disabled=!s.publicStatus;
 const progress=s.thinking?.progress,elapsed=s.thinking?Math.max(0,Math.floor((Date.now()-s.thinking.started)/1000)):0;
 if(!panel.querySelector('[data-action="ai-effort"]')){const b=document.createElement('button');b.className='small quiet';b.dataset.action='ai-effort';b.textContent='Thinking effort';panel.querySelector('.ai-controls').appendChild(b);}
 panel.querySelector('[data-action="ai-effort"]').disabled=!!(busy||s.running||s.thinking||backlog);
 const stage={preparing:'preparing model / context',reasoning:'reasoning',answering:'writing a decision',retrying:'retrying incomplete output'}[progress?.phase]||'thinking';
 const generated=(progress?.reasoningCharacters||0)+(progress?.answerCharacters||0);
 const retrying=s.retry&&!s.retry.suspended;
 const activity=s.thinking?`${s.thinking.name} · ${s.thinking.provider} · ${s.thinking.purpose==='chat'?(s.replyRequests?.find(r=>r.id===s.thinking.requestId)?.automatic?(s.preMatch?.state==='waiting'?'Making an entrance · ':'Opening the post-match conversation · '):'replying to a tag · '):''}${stage} · ${elapsed}s${s.thinking.purpose==='chat'?' / 60s limit':['ollama','openrouter','openai','gemini','deepseek','groq','lmstudio','compatible'].includes(s.thinking.provider)?' / 180s limit':''}${generated?' · '+generated.toLocaleString()+' characters generated':''}${progress?.call>1?' · analysis / repair call '+progress.call:''}${progress?.attempt>1?' · retry '+progress.attempt:''}`:retrying?`Automatic retry ${s.retry.attempt} of ${s.retry.maxRetries} · ${game.s.players[s.retry.seat]?.name} · Retry in ${Math.max(0,Math.ceil((s.retry.nextAt-Date.now())/1000))}s`:game.s.phase==='over'?'Match complete · chat remains open':s.running?`Running${wait?' · '+wait+' to act':''}`:'Paused';
 $('ai-status').textContent=activity+(backlog?` · ${backlog} actions in playback`:'')+(s.thinking||retrying||!publicNote||publicNote==='Paused.'?'':'. '+publicNote);
 $('ai-error').textContent=s.error||'';
 panel.querySelector('[data-action="ai-run"]').disabled=s.running;panel.querySelector('[data-action="ai-pause"]').disabled=!s.running&&!s.thinking&&!retrying;panel.querySelector('[data-action="ai-step"]').disabled=!!s.thinking||s.running||!!retrying;
 renderSocialChat(s);syncMatchup();syncTurnActivity();
 const human=!game.s.players[mySeat()].bot;$('ai-compose').classList.toggle('hidden',!human&&game.s.phase!=='over');
 $('ai-offer').innerHTML=s.offer?`<div class="ai-offer"><b>${(s.offer.depth||0)>0?'Trade counteroffer':'Trade proposal'}</b><p>${esc(tradeText(s.offer))}</p>${s.offer.to===mySeat()&&human?'<button data-action="ai-review">Review / counteroffer ↗</button>':'<small>Waiting for the recipient’s decision.</small>'}</div>`:'';
 if(!busy&&s.offer)$('turn-panel').querySelector('.actions').innerHTML='';
 if(backlog||!human||!isMyTurn()||s.offer){for(const b of document.querySelectorAll('#deed-panel .deed-actions button,#portfolio-panel [data-action="trade"],#turn-panel .actions button'))b.disabled=true;}
 applyNetworkPermissions();$('save-status').textContent=isGuest()?'Connected as '+game.s.players[mySeat()].name+' · saved by host':'AI table autosaved by local host';syncDiceInteraction();renderUsageTotals();syncAuctionView();queueMicrotask(maybeOpenOffer);
}
function providerModels(type){return(providerInfo?.[type]?.models||[]).filter(m=>type!=='openrouter'||RentReasonModelCompatibility.visible(m));}
function providerModelLabel(type,model){const name=model.name||model.id,pricing=model.pricing;return type==='openrouter'&&Number.isFinite(pricing?.input)&&Number.isFinite(pricing?.output)?`${name} · $${pricing.input.toFixed(3)} / $${pricing.output.toFixed(3)} per 1M in/out`:name;}
function optionList(items,selected){return items.map(([v,label])=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(label)}</option>`).join('');}
async function aiSetup(){openLobbySetup(firstRun);}

function drawAiSetup(preserve=false){
 const fields=preserve?[...$('ai-setup-body').querySelectorAll('input[id],select[id],textarea[id]')].filter(el=>el.type!=='password').map(el=>({id:el.id,value:el.value,checked:el.checked})):[];
 const openProfiles=preserve?[...$('ai-setup-body').querySelectorAll('details[id]')].filter(el=>el.open).map(el=>el.id):[];
 $('provider-loading').innerHTML=`<span class="provider-pill ${providerInfo.ollama.available?'ready':''}">Ollama ${providerInfo.ollama.available?'connected':'unavailable'}</span> <span class="provider-pill ${providerInfo.codex.available?'ready':''}">Codex ${providerInfo.codex.available?'ChatGPT sign-in':'unavailable'}</span> <span class="provider-pill ${providerInfo.claude?.available?'ready':''}">Claude Code ${providerInfo.claude?.available?'subscription sign-in':'unavailable'}</span> <span class="provider-pill ${providerInfo.openrouter?.available?'ready':''}">OpenRouter ${!supportsOpenRouter()?'restart launcher':providerInfo.openrouter?.available?(providerModels('openrouter').length+' models'):providerInfo.openrouter?.configuration?.configured?'check connection':'backend not configured'}</span>`;
 const defaults=remote?game.s.controllers:null;
 $('ai-setup-body').innerHTML=`<p class="modal-note">Choose Human for you and your friends, or use only AI seats to watch. Models make strategic decisions; code checks legality and computes risk. Ollama is local. Codex and Claude Code use subscription sign-ins. OpenRouter uses API credits and requires internet. Its picker hides batch jobs, media generators, specialist-only models and duplicate aliases.</p>${openRouterConnectionNotice()}<div class="field"><label for="ai-seats">NUMBER OF PLAYERS</label><select id="ai-seats">${optionList([['2','2 players'],['3','3 players'],['4','4 players']],String(game.s.players.length))}</select></div>${editionFields('ai',game.s)}<div class="ai-roster">${[0,1,2,3].map(i=>{const c=defaults?.[i]?{...defaults[i],...(remote.status.socialProfiles?.[i]||{})}:{type:i===0?'human':providerInfo.ollama.available?'ollama':'heuristic',personality:['balanced','builder','trader','defensive'][i],effort:'medium'};return`<fieldset class="ai-seat" data-seat="${i}" style="align-content:start;align-self:start"><legend>SEAT ${i+1}</legend><input id="ai-name-${i}" maxlength="24" aria-label="Seat ${i+1} name" value="${esc(game.s.players[i]?.name||['You','Ada','Jasper','Cleo'][i])}"><select id="ai-type-${i}" data-ai-type="${i}" aria-label="Seat ${i+1} controller">${optionList([...[['human','Human']],['heuristic','Programmatic bot'],...RentReason.PROVIDERS.CHOICES],c.type)}</select><select id="ai-model-${i}" data-currency-literal aria-label="Seat ${i+1} model"></select><div class="field-row"><select id="ai-personality-${i}" aria-label="Seat ${i+1} personality">${optionList([['balanced','Balanced'],['builder','Builder'],['trader','Negotiator'],['defensive','Defensive']],c.personality)}</select><select id="ai-effort-${i}" aria-label="Seat ${i+1} thinking effort">${optionList([['low','Low effort'],['medium','Medium effort'],['high','High effort']],c.effort)}</select></div>${setupPersonalityEditor(i,c)}</fieldset>`;}).join('')}</div><div class="field-row"><div class="field"><label for="ai-cash">STARTING CASH / PLAYER</label><input id="ai-cash" type="number" min="0" max="1000000" step="1" value="${game.s.startingCash}" required></div><div class="field"><label for="ai-rounds">GAME LENGTH</label><select id="ai-rounds">${optionList([['0','Last player standing'],['30','30 rounds'],['60','60 rounds']],String(game.s.roundLimit||0))}</select></div></div><fieldset class="workshop-rules-setup"><legend>HOUSE RULES</legend>${[['bankruptToBank','Bank keeps bankrupt properties'],['taxesToParking','Taxes fund Common Green'],['doubleGo','Land on Harbor Gate for $400'],['noRentInJail','No rent during permit review']].map(([key,label])=>`<label class="workshop-rule-option"><input type="checkbox" id="ai-rule-${key}" ${game.s.rules[key]?'checked':''}><span>${label}</span></label>`).join('')}</fieldset><details class="ai-diagnostics"><summary>Provider connection details</summary><p>Ollama: ${esc(providerInfo.ollama.error||'Installed local models discovered on 127.0.0.1:11434.')}</p><p>Codex: ${esc(providerInfo.codex.error||'Official app-server, ChatGPT subscription authentication. No API-key fallback.')}</p><p>Claude Code: ${esc(providerInfo.claude?.error||'Official CLI subscription sign-in. Model aliases resolve through your account; access depends on your plan.')}</p><p>OpenRouter: ${esc(providerInfo.openrouter?.error||(providerModels('openrouter').length+' compatible models. Credentials are managed by the backend.'))}</p><p>Start Ollama, run <code>codex login</code>, or install the <a href="https://code.claude.com/docs/en/setup" target="_blank" rel="noreferrer">official Claude Code CLI</a> and run <code>claude auth login</code>, then refresh providers. One model call runs at a time to control memory use. First local inference can take a while.</p></details><div id="ai-setup-error" class="feedback" role="alert"></div><button class="primary full" data-action="ai-create">Create table →</button><button class="quiet full" data-action="ai-refresh">Refresh providers</button><p class="modal-note">Creating a table replaces the host autosave. Export the current table first to keep it. Private agent notes are included in exports. Each session caches stable rules, uses state deltas, and periodically rebuilds compact context.</p>`;
 for(const f of fields){const el=$(f.id);if(el){el.value=f.value;if(el.type==='checkbox')el.checked=f.checked;}}
 for(let i=0;i<4;i++)aiModels(i,fields.find(f=>f.id==='ai-model-'+i)?.value||defaults?.[i]?.model);for(const id of openProfiles)if($(id))$(id).open=true;syncPersonalityPresetMenus();aiSeatCount();
}
function openRouterConnectionNotice(){
 if(!supportsOpenRouter())return `<p class="feedback" role="alert">${AI_HOST_UPDATE}</p>`;
 const info=providerInfo.openrouter;
 return info?.available?'':`<p class="feedback" role="alert">OpenRouter: ${esc(info?.error||'No compatible models were found. Use Refresh providers to reload the backend connection.')}</p>`;
}
function aiModels(i,selected){const type=$('ai-type-'+i).value,select=$('ai-model-'+i),models=providerModels(type);select.innerHTML=models.length?optionList(models.map(m=>[m.id,providerModelLabel(type,m)]),selected||models.find(m=>m.id==='gpt-oss:20b'||m.isDefault)?.id||models[0].id):'<option value="">'+(['human','heuristic'].includes(type)?'No model needed':'No models available')+'</option>';select.disabled=['human','heuristic'].includes(type);$('ai-effort-'+i).disabled=select.disabled||!!RentReason.PROVIDERS.API[type];if($('ai-profile-'+i))$('ai-profile-'+i).classList.toggle('hidden',select.disabled);}
function aiSeatCount(){const n=Number($('ai-seats').value);document.querySelectorAll('.ai-seat').forEach((el,i)=>el.classList.toggle('hidden',i>=n));}
function effortDialog(){
 if(!remote||busy||remote.status.running||remote.status.thinking||remote.applied!==remote.latest){toast('Pause the table and catch up before changing effort.');return;}
 openModal('ai-effort',`<div class="modal-header"><span class="eyebrow">Your existing table</span><button class="small quiet" data-action="close">✕</button></div><h2 id="modal-title">Thinking effort.</h2><p>Low is quicker. On Qwen and Gemma models it switches optional thinking off. GPT-OSS uses its low reasoning level. Medium and High keep thinking enabled.</p>${game.s.controllers.map((c,i)=>['ollama','codex','claude','openrouter','openai','gemini','deepseek','groq','lmstudio','compatible'].includes(c.type)?`<div class="field"><label for="seat-effort-${i}">${esc(game.s.players[i].name)} · ${esc(c.model)}</label><select id="seat-effort-${i}" ${RentReason.PROVIDERS.API[c.type]?'disabled title="Uses provider reasoning defaults"':''}>${optionList([['low','Low · quick'],['medium','Medium'],['high','High']],c.effort)}</select></div>`:'').join('')}<div id="ai-setup-error" class="feedback" role="alert"></div><button class="primary full" data-action="ai-effort-save">Save effort</button>`);
}
async function aiAction(action){
 try{
  if(personalityPresetAction(action))return;
  if(action==='ai-insights'){await insightsDialog();return;}
  if(action==='ai-personalities'){personalityDialog();return;}
  if(action==='ai-profiles-save'){const profiles=remote.status.socialProfiles.map((p,id)=>$('social-voice-'+id)?readPersonality('live',id):p);const result=await api('profiles',{version:profileDialogVersion,profiles});Object.assign(remote.status,result);closeModal();renderAi();toast('Personalities saved. Active calls finish with their current profile.');return;}
  if(action==='ai-effort'){effortDialog();return;}
  if(action==='ai-effort-save'){const efforts=game.s.controllers.map((c,i)=>$('seat-effort-'+i)?.value||c.effort||'medium');setRemote(await api('effort',{revision:remote.revision,efforts}));toast('Thinking effort saved. Press Run / retry when ready.');return;}
  if(action==='ai-setup'){await aiSetup();return;}
  if(action==='ai-refresh'){providerInfo=await api('providers?refresh=1');drawAiSetup(true);return;}
  if(action==='ai-create'){
   if(!$('ai-cash').reportValidity())return;const players=Array.from({length:Number($('ai-seats').value)},(_,i)=>({name:$('ai-name-'+i).value,type:$('ai-type-'+i).value,model:$('ai-model-'+i).value,...readPersonality('setup',i),effort:$('ai-effort-'+i).value}));
   if(players.some(p=>p.type==='openrouter')&&!supportsOpenRouter())throw Error(AI_HOST_UPDATE);

   if($('ai-rule-noRentInJail')?.checked&&!aiHost.features?.noRentInJail)throw Error('This rule needs the updated AI host. Relaunch the AI launcher after finishing your current game.');
   const status=await api('table',{preMatch:true,players,boardId:$('ai-board').value,language:$('ai-language').value,startingCash:Number($('ai-cash').value),roundLimit:Number($('ai-rounds').value),rules:Object.fromEntries(['bankruptToBank','taxesToParking','doubleGo','noRentInJail'].map(k=>[k,$('ai-rule-'+k)?.checked??false]))});
   setRemote(status);toast('Your matchup is ready.');return;
  }
  if(!remote)return;
  if(action==='ai-audit'){
   const response=await fetch('/api/audit',{headers:{'X-Rent-Reason-Token':aiHost.token}});if(!response.ok)throw Error((await response.json()).error||'Unable to export audit.');
   const blob=await response.blob(),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='rent-reason-audit-round-'+game.s.round+'.jsonl';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Full local audit exported, including model decisions and game analysis.');return;
  }
  if(action==='ai-catchup'){if(!isGuest())await api('control',{action:'pause'});continueCard();await apiCatchup();return;}
  if(['ai-run','ai-pause','ai-step'].includes(action)){await api('control',{action:action.slice(3),after:remote.received});await pollAi();return;}
  if(action==='ai-review'){if(remote.status.offer)openTrade({offer:remote.status.offer});return;}
  if(action==='ai-accept'||action==='ai-reject'){await remoteAction(action==='ai-accept'?'accept':'reject');return;}
  if(action==='ai-send'){const input=$('ai-message');const target=$('ai-chat-target')?.value,targets=target==='all'?socialSeats():target!==''&&target!==undefined?[Number(target)]:[];await api('chat',{text:input.value,targets,topicId:chatTopicId});input.value='';chatTopicId=null;$('ai-chat-target')&&($('ai-chat-target').value='');await pollAi();}
 }catch(e){playCue('error');if($('ai-setup-error'))$('ai-setup-error').textContent=e.message;else toast(e.message);}
}
async function apiCatchup(){
 while(busy)await delay(50);setRemote(await api('table'));toast(isGuest()?'Caught up to the latest table state.':'Paused at the latest table state.');
}
async function remoteAction(action,extra={}){
 if(!remote)return false;if(!isMyTurn()){toast('Wait for your seat to act.');return false;}if(busy||remote.applied!==remote.latest){toast('Wait for playback, or use Catch up.');return false;}
 try{await api('action',{revision:remote.revision,action,after:remote.received,...extra});await pollAi();return true;}catch(e){playCue('error');toast(e.message);return false;}
}
async function initAi(){
 if(typeof lobbyPreview!=='undefined'&&lobbyPreview){aiHost=lobbyPreview.info;providerInfo=lobbyPreview.providers;if(lobbyPreview.table)setRemote(structuredClone(lobbyPreview.table));void readLobbyHistory();return;}
 const local=location.protocol==='http:'&&location.hostname==='127.0.0.1';
 if(!local&&location.protocol!=='https:')return;
 if(!local){
  const fragment=new URLSearchParams(location.hash.slice(1));pendingInvitation=fragment.get('join');
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  if(pendingInvitation)showOnlineJoin();else try{await connectOnlineGuest();}catch(e){showOnlineJoin(e.message);}
 }else try{
  const r=await fetch('/api/info');if(!r.ok)return;const info=await r.json();if(!info.localGameHost&&!info.subscriptionOnly)return;aiHost=info;
  const status=await api('table');if(status)setRemote(status);else openLobbyHome();if(modal==='lobby')void readLobbyHistory();applyNetworkPermissions();
 }catch{/* A plain HTTP preview can still run the classic offline game. */}
 setInterval(()=>{if(aiHost)void pollAi();if(modal==='hosting')void refreshHosting();},1000);
}
document.addEventListener('change',e=>{if(e.target.dataset.aiType!==undefined)aiModels(Number(e.target.dataset.aiType));if(e.target.id==='ai-seats')aiSeatCount();});
document.addEventListener('keydown',e=>{if(e.target.id==='ai-message'&&e.key==='Enter'){e.preventDefault();void aiAction('ai-send');}});
