/* Seat identity comes from the authenticated server session, never the URL. */
let visitorMode=typeof location!=='undefined'&&location.protocol==='https:';
let hostingState=null,hostingBusy=false,hostingInvites=new Map(),joining=false;
const isGuest=()=>visitorMode||aiHost?.viewer?.role==='guest';
const mySeat=()=>aiHost?.viewer?.seat??0;
const isMyTurn=()=>!!remote&&remote.status.actor===mySeat()&&!game.s.players[mySeat()]?.bot;
const hostOnlyActions=new Set(['home','new','ai-setup','notebooks','trophies','import','export','edition','workshop-rules','ai-run','ai-pause','ai-step','ai-personalities','ai-effort','ai-audit','ai-insights','tournament','network-open']);
function applyNetworkPermissions(){
 document.body.classList.toggle('visitor',isGuest());
 for(const b of document.querySelectorAll('[data-action]'))if(hostOnlyActions.has(b.dataset.action))b.classList.toggle('guest-hidden',isGuest());
 for(const b of document.querySelectorAll('[data-matchup="start"],[data-matchup="home"]'))b.classList.toggle('guest-hidden',isGuest());
 const hostButton=document.querySelector('header [data-action="network-open"]');if(hostButton)hostButton.classList.toggle('hidden',!aiHost?.features?.internetHosting||isGuest());
 if(isGuest()){
  const ownButton=document.querySelector('header [data-action="pieces"]');if(ownButton)ownButton.textContent='My character';
  const label=document.querySelector('.offline');if(label)label.textContent='Private online table · '+(game.s.players[mySeat()]?.name||'Visitor');
  const local=document.querySelector('.ai-local');if(local)local.textContent='GUEST · SEAT '+(mySeat()+1);
  const footer=document.querySelector('.matchup-footer p');if(footer)footer.textContent='Your seat is reserved. The host starts the match when everyone has joined.';
 }
}
async function refreshHosting(){
 if(modal!=='hosting'||hostingBusy)return;
 try{hostingState=await api('hosting');renderHosting();}catch(e){const error=$('hosting-error');if(error)error.textContent=e.message;}
}
function renderHosting(){
 if(modal!=='hosting')return;const h=hostingState||{state:'off',seats:[]},on=h.state==='ready',starting=h.state==='starting';
 const root=$('hosting-body');root.innerHTML=`<p>Your computer runs the game and AI players. Friends join in a browser using their own private invitation.</p><div class="hosting-status" role="status"><b>${on?'Internet hosting is on':starting?'Connecting the secure tunnel…':h.state==='error'?'Hosting needs attention':'Internet hosting is off'}</b><p>${on?'Keep this computer awake and the launcher running.':starting?'This usually takes a few seconds.':h.error||'Choose Human for your friends in game setup, then turn on hosting.'}</p></div>${!on&&!starting?'<button class="primary full" data-action="network-start">Start internet hosting</button>':'<button class="quiet full" data-action="network-stop">Stop hosting & disconnect guests</button>'}<div class="hosting-seats">${h.seats.map(p=>{const invite=hostingInvites.get(p.seat),valid=invite&&invite.expires>Date.now()&&invite.url.startsWith((h.url||'')+'/');return `<article><div><b>${esc(p.name)}</b><small>Seat ${p.seat+1} · ${p.claimed?(Date.now()-p.lastSeen<90000?'Joined':'Connection idle · seat reserved'):'Waiting for an invitation'}</small></div>${on?`<button class="small" data-action="network-invite:${p.seat}">${p.claimed?'Disconnect & reinvite':'Create invite'}</button>${p.claimed||valid?`<button class="small quiet" data-action="network-revoke:${p.seat}">Revoke access</button>`:''}`:''}${valid?`<label>Private invite · expires in one hour<input readonly data-invite-seat="${p.seat}" value="${esc(invite.url)}" aria-label="Private invite for ${esc(p.name)}"></label><button class="small" data-action="network-copy:${p.seat}">Copy invite</button>`:''}</article>`;}).join('')}</div><p class="modal-note">Each invite works once and controls only its assigned seat. Browser refresh reconnects for up to 24 hours. Revoke access to remove a guest. Stopping hosting, restarting the launcher or replacing/importing a game invalidates every invite and guest session. If someone disconnects, their turn waits for them; the host can pause or send a new invite.</p><details><summary>Hosting setup</summary><p>Install Cloudflare’s <a href="https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/" target="_blank" rel="noreferrer">cloudflared tunnel client</a> once. On a Mac with Homebrew: <code>brew install cloudflared</code>. Then restart the game launcher.</p><p>Only the visitor gateway is shared over HTTPS. Your administrator controls, saves, private AI notes and provider credentials stay on your computer. The tunnel uses Cloudflare’s temporary service and needs internet. No router port forwarding or account is required.</p></details>`;
}
async function networkAction(action){
 if(action==='network-join'){await joinOnlineGame();return;}
 if(action==='network-character'){await openGuestCharacter();return;}
 if(action==='network-character-save'){await saveGuestCharacter();return;}
 if(isGuest())return;
 if(!aiHost?.features?.internetHosting){toast('Open the updated AI launcher to host an online game.');return;}
 if(action==='network-open'){
  openModal('hosting','<div class="modal-header"><span class="eyebrow">PLAY WITH FRIENDS</span><button class="small quiet" data-action="close">✕</button></div><h2 id="modal-title">Invite friends.</h2><div id="hosting-body"></div><p id="hosting-error" class="feedback" role="alert"></p>');await refreshHosting();return;
 }
 if(hostingBusy)return;hostingBusy=true;
 try{
  const [kind,value]=action.split(':'),seat=Number(value);
  if(kind==='network-start'){hostingState=await api('hosting',{action:'start'});hostingInvites.clear();}
  if(kind==='network-stop'){hostingState=await api('hosting',{action:'stop'});hostingInvites.clear();}
  if(kind==='network-invite'){hostingInvites.set(seat,await api('hosting',{action:'invite',seat}));hostingState=await api('hosting');}
  if(kind==='network-revoke'){await api('hosting',{action:'revoke',seat});hostingInvites.delete(seat);hostingState=await api('hosting');}
  if(kind==='network-copy'){const link=hostingInvites.get(seat)?.url;if(link){try{await navigator.clipboard.writeText(link);toast('Private invite copied.');}catch{const field=document.querySelector(`[data-invite-seat="${seat}"]`);field?.focus();field?.select();toast('Select and copy the invitation link.');}}}
  renderHosting();
 }catch(e){playCue('error');if($('hosting-error'))$('hosting-error').textContent=e.message;else toast(e.message);}finally{hostingBusy=false;}
}
let guestCharacter=null,guestCharacterSaving=false;
async function openGuestCharacter(){
 if(!isGuest()||!remote)return;
 if(!aiHost.features?.ownCharacter){toast('Your host needs to restart the updated AI launcher to enable character editing.');return;}
 try{
  guestCharacter=await api('character');const c=guestCharacter.character;
  openModal('guest-character',`<div class="modal-header"><span class="eyebrow">YOUR CHARACTER · SEAT ${mySeat()+1}</span><button class="small quiet" data-action="close">✕</button></div><h2 id="modal-title">My character.</h2><p>Save your name and look for future games. This match keeps its current names, pieces and colours.</p><form id="guest-character-form"><label class="field">Character name<input id="guest-character-name" maxlength="24" required value="${esc(c.name)}"></label><label class="field">Playing piece<select id="guest-character-piece">${optionList(Art.pieces,c.profile.piece)}</select></label><label class="field">Player colour<select id="guest-character-color">${optionList(RentReason.PLAYER_COLORS,c.profile.color)}</select></label><p id="guest-character-error" class="feedback" role="alert"></p><button type="submit" class="primary full">Save my character</button><button type="button" class="quiet full" data-action="network-character">Reload saved character</button></form>`);
 }catch(e){toast(e.message);}
}
async function saveGuestCharacter(){
 if(!isGuest()||!guestCharacter||guestCharacterSaving||modal!=='guest-character')return;
 const form=$('guest-character-form');if(!form.reportValidity())return;
 guestCharacterSaving=true;const button=form.querySelector('[type="submit"]');button.disabled=true;
 try{guestCharacter=await api('character',{characterId:guestCharacter.character.id,revision:guestCharacter.revision,profile:{name:$('guest-character-name').value,piece:$('guest-character-piece').value,color:$('guest-character-color').value}});toast('Your character is saved for future games.');closeModal();render(false);}
 catch(e){if($('guest-character-error'))$('guest-character-error').textContent=e.message;}finally{guestCharacterSaving=false;if(button.isConnected)button.disabled=false;}
}
document.addEventListener('submit',e=>{if(e.target.id==='guest-character-form'){e.preventDefault();void saveGuestCharacter();}});
let pendingInvitation=null;
function showOnlineJoin(message=''){
 visitorMode=true;document.body.classList.add('joining-online');applyNetworkPermissions();
 openModal('online-join',`<div class="eyebrow">A PRIVATE TABLE</div><h2 id="modal-title">Join your friend’s game.</h2><p>The host runs the game and AI players. Your invitation reserves your own human seat.</p><p id="join-error" class="feedback" role="alert">${esc(message)}</p>${pendingInvitation?'<button class="primary full" data-action="network-join">Join game →</button>':'<p>Open the private invitation link your host sent you. If you already joined in this browser, refresh to reconnect.</p>'}`);
}
async function joinOnlineGame(){
 if(joining||!pendingInvitation)return;joining=true;
 try{const r=await fetch('/api/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invite:pendingInvitation})});const d=await r.json();if(!r.ok)throw Error(d.error);pendingInvitation=null;await connectOnlineGuest();}
 catch(e){playCue('error');showOnlineJoin(e.message);}finally{joining=false;}
}
async function connectOnlineGuest(){
 const r=await fetch('/api/info');if(!r.ok){const d=await r.json();throw Error(d.error||'Unable to reconnect.');}aiHost=await r.json();if(aiHost.viewer?.role!=='guest')throw Error('This address is not a visitor gateway.');
 setRemote(await api('table'));document.body.classList.remove('joining-online');applyNetworkPermissions();toast('You joined as '+game.s.players[mySeat()].name+'.');
}
