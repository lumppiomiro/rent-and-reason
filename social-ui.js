/* Included inside the app closure. Chat controls never execute game moves. */
let chatTopicId=null,profileDialogVersion=0;
let observedSocialChat=null,chatPinned=true,chatUnread=0;
// Chat is shared by the normal table, auction and trade workspaces. Its home
// must not depend on host controls, which live in a separate header drawer.
function moveTableChat(home,mode=null){
 const panel=$('chat-panel');if(!panel||!home)return;
 const chat=$('ai-chat'),top=chat?.scrollTop,active=document.activeElement,restoreFocus=panel.contains(active);
 panel.classList.toggle('auction-chat',mode==='auction');panel.classList.toggle('trade-chat',mode==='trade');
 if(panel.parentElement===home)return;
 home.appendChild(panel);
 if(chat)chat.scrollTop=chatPinned?chat.scrollHeight:top;
 if(restoreFocus)active.focus({preventScroll:true});
}
function scrollChatToBottom(){const chat=$('ai-chat');if(!chat)return;chatPinned=true;chatUnread=0;const latest=$('chat-latest');if(latest)latest.hidden=true;chat.scrollTop=chat.scrollHeight;requestAnimationFrame(()=>{if(chat.isConnected&&chatPinned)chat.scrollTop=chat.scrollHeight;});}
const chatResizeObserver=new ResizeObserver(()=>{if(chatPinned)scrollChatToBottom();});
async function insightsDialog(){
 if(!remote?.status.spectator)return;const data=await api('insights');
 openModal('ai-insights',`<div class="modal-header"><span class="eyebrow">Observer view · round ${data.round}</span><button class="small quiet" data-action="close">✕</button></div><h2 id="modal-title">AI decision summaries.</h2><p>Short explanations and strategy plans from existing decisions. Opening this view makes no model calls.</p><div class="ai-insight-plans">${data.plans.map(p=>`<article style="--speaker:${playerColor(game.s.players[p.seat])}"><b>${esc(p.name)}</b><p>${esc(p.plan||'No plan recorded yet.')}</p></article>`).join('')}</div><h3>Recent decisions</h3>${data.decisions.slice().reverse().map(d=>`<article class="ai-insight-decision" style="--speaker:${playerColor(game.s.players[d.seat])}"><b>${esc(game.s.players[d.seat].name)} · round ${d.round}</b><small>${esc(d.action)}</small><p>${esc(d.rationale)}</p></article>`).join('')||'<p>No decisions yet.</p>'}<p class="modal-note">Available only when no human seat is playing. This shows concise decision explanations, not raw internal reasoning.</p>`,true);
}
function socialSeats(){return(game.s.controllers||[]).flatMap((c,id)=>['ollama','codex','claude','openrouter','openai','gemini','deepseek','groq','lmstudio','compatible'].includes(c.type)&&(!game.s.players[id].out||game.s.phase==='over')?[id]:[]);}
function chatMarkup(c){
 const colour=c.seat===null?'#65705c':playerColor(game.s.players[c.seat]),speaker=esc(c.name),text=esc(c.text);
 if(['auction','trade'].includes(c.kind)){
  const asks=(c.askSeats||[]).filter(id=>socialSeats().includes(id));const review=c.kind==='trade'&&remote.status.offer?.id===c.offerId&&remote.status.offer.to===mySeat()&&!game.s.players[mySeat()].bot;
  return `<article class="chat-market" style="--speaker:${colour}"><header><b>${c.kind==='auction'?'Auction desk':c.counter?'Trade counteroffer':'Trade proposal'}</b><small>${c.outcome?esc(c.outcome):c.active?'Live':'Finished'}</small></header><span>${text}</span><div class="chat-market-actions">${review?'<button class="small" data-action="ai-review">Review offer</button>':''}${!game.s.players[mySeat()].bot?asks.map(id=>`<button class="small quiet" data-chat-discuss="${esc(c.id)}" data-chat-seat="${id}">Ask @${esc(game.s.players[id].name)}</button>`).join(''):''}</div></article>`;
 }
 return `<p class="chat-${esc(c.kind||'speech')}" style="--speaker:${colour}"><b><i></i>${speaker}${c.kind==='reply'?'<small>↳ tagged reply</small>':c.kind==='post-match'?'<small>Post-match opener</small>':c.kind==='pre-match'?'<small>Entrance</small>':''}</b>${c.targets?.length?`<small class="chat-audience">to ${c.targets.map(id=>'@'+esc(game.s.players[id]?.name||'player')).join(', ')}</small>`:''}<span data-speech>${text}</span>${c.kind==='reply'&&c.contextRound?`<small class="chat-context">${c.stage==='pre-match'?'Before the first roll':'About the position in round '+c.contextRound}</small>`:''}</p>`;
}
function renderSocialChat(s){
 const chat=$('ai-chat'),signature=s.chat.map(c=>c.id+':'+(c.version||0)+':'+playerColor(game.s.players[c.seat])).join();
 if(observedSocialChat!==chat){chatResizeObserver.disconnect();observedSocialChat=chat;chatPinned=true;chatUnread=0;chatResizeObserver.observe(chat);chat.addEventListener('scroll',()=>{chatPinned=chat.scrollHeight-chat.clientHeight-chat.scrollTop<40;if(chatPinned){chatUnread=0;if($('chat-latest'))$('chat-latest').hidden=true;}},{passive:true});}
 if(chat.dataset.signature!==signature){
  const follow=chatPinned,top=chat.scrollTop,known=new Map([...chat.querySelectorAll('[data-chat-id]')].map(node=>[node.dataset.chatId,node]));let incoming=0;
  chat.dataset.signature=signature;
  if(!s.chat.length)chat.innerHTML='<p class="empty">Talk at the table, or tag a model to ask for a reply.</p>';
  else{
   chat.querySelector('.empty')?.remove();const live=new Set(s.chat.map(c=>String(c.id)));
   for(const [id,node]of known)if(!live.has(id))node.remove();
   s.chat.forEach((c,index)=>{const id=String(c.id),markup=chatMarkup(c);let node=known.get(id);if(!node||node._chatMarkup!==markup){const template=document.createElement('template');template.innerHTML=markup;const next=template.content.firstElementChild;next.dataset.chatId=id;next._chatMarkup=markup;if(node)node.replaceWith(next);else incoming++;node=next;}if(chat.children[index]!==node)chat.insertBefore(node,chat.children[index]||null);});
  }
  if(follow)scrollChatToBottom();else{chat.scrollTop=top;chatUnread+=incoming;const latest=$('chat-latest');if(latest){latest.hidden=!chatUnread;latest.textContent=I18n.translate('New messages',uiLanguage)+' · '+chatUnread+' ↓';}}
 }
 const chatHeading=$('chat-panel').querySelector('h2');if(chatHeading)chatHeading.textContent=game.s.phase==='over'?'Post-match chat':'Player chat';
 const input=$('ai-message');if(input)input.placeholder=game.s.phase==='over'?'Talk about the match…':'Talk to the table…';
 const target=$('ai-chat-target');if(target){const seats=socialSeats(),sig=seats.map(id=>id+game.s.players[id].name).join();if(target.dataset.signature!==sig){const selected=target.value;target.innerHTML='<option value="">Table chat</option>'+seats.map(id=>`<option value="${id}">@${esc(game.s.players[id].name)} · seat ${id+1}</option>`).join('')+(seats.length>1?'<option value="all">@all models</option>':'');target.value=selected;target.dataset.signature=sig;}target.disabled=!s.socialVersion;}
 const status=$('ai-reply-status');if(status){const pending=(s.replyRequests||[]).filter(r=>['queued','answering'].includes(r.state)),latest=s.replyRequests?.at(-1);status.textContent=pending.length?pending.map(r=>(r.state==='answering'?'Answering: ':r.retries?'Retrying: ':'Queued: ')+'@'+game.s.players[r.to]?.name).join(' · '):latest?.state==='failed'?'Reply failed: '+latest.error:s.socialVersion?(game.s.phase==='over'?'Tag a player to continue the post-match conversation.':'Only explicit tags request an extra reply call.'):'Reload the updated host to enable tags and personalities.';}
}
function personalityDialog(){
 if(!remote?.status.socialVersion){toast('This needs the updated AI host. Your current game can be restored after its next restart.');return;}
 profileDialogVersion=remote.status.profilesVersion;
 openModal('personalities',`<div class="modal-header"><span class="eyebrow">The people at your table</span><button class="small quiet" data-action="close">✕</button></div><h2 id="modal-title">AI personalities.</h2><p>Strategy controls how they play. Voice and chattiness control how they talk. Changes apply between calls; the game keeps running.</p>${socialSeats().map(id=>`<fieldset class="social-profile"><legend>${esc(game.s.players[id].name)}</legend>${personalityFields('live',id,remote.status.socialProfiles[id],game.s.players[id].name)}</fieldset>`).join('')}<div id="ai-setup-error" class="feedback" role="alert"></div><button class="primary full" data-action="ai-profiles-save">Apply to this game</button><p class="modal-note">Normal/lively voices get at most one routine comment per round. Bids and negotiations can get short additional lines. Tagged replies use a separate compact session and appear in token totals.</p>`,true);
}
function draftDiscussion(messageId,seat){
 const c=remote?.status.chat.find(c=>c.id===messageId),input=$('ai-message');if(!c||!input||!socialSeats().includes(seat))return;
 chatTopicId=messageId;$('ai-chat-target').value=String(seat);input.value=c.kind==='auction'?`What's your take on the auction for ${B[c.property].name}?`:'What would make this offer work for you?';input.focus();
}
document.addEventListener('click',e=>{if(e.target.closest('#chat-latest')){scrollChatToBottom();return;}const ask=e.target.closest('[data-chat-discuss]');if(ask)draftDiscussion(ask.dataset.chatDiscuss,Number(ask.dataset.chatSeat));});
document.addEventListener('input',e=>{if(e.target.id==='ai-message')chatTopicId=null;});
