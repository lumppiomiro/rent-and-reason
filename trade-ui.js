/* Board-side trade workspace. Included in the application closure. */
let tradeState=null,seenOffers=new Set(),tradeChatOpen=false;
function restoreTradeChat(){document.body.classList.remove('trading-discussion');if($('chat-panel')?.classList.contains('trade-chat'))moveTableChat($('right-panels'));}
function tradeCards(owner,chosen,locked){
 return game.own(owner).map(b=>{const pr=game.s.props[b.id],developed=b.workshop&&game.group(b.group).some(x=>game.s.props[x.id].level),checked=chosen.has(b.id);return `<article class="trade-deed-item ${checked?'chosen':''}"><label class="trade-deed"><input type="checkbox" data-trade-property="${b.id}" data-trade-side="${owner===mySeat()?'give':'take'}" aria-label="Select ${esc(b.name)}" ${checked?'checked':''} ${locked||developed?'disabled':''}>${View.card(b,pr.mortgaged)}<span class="trade-card-caption">${checked?'Included in offer':developed?'Buildings must be sold first':'Select property'}</span></label><button class="small quiet trade-peek" data-trade-inspect="${b.id}">View deed ↗</button></article>`;}).join('')||'<p class="empty">No properties owned.</p>';
}
function openTrade({other=null,offer=null,mode=null}={}){
 if(remote&&!isMyTurn())return;
 if($('auction-panel'))closeAuctionView();const partners=game.active.filter(p=>p.id!==mySeat());if(!partners.length)return;
 if(modal&&modal!=='trade')closeModal();
 other??=offer?(offer.from===mySeat()?offer.to:offer.from):partners[0].id;
 const fromHuman=offer?.from===mySeat();
 tradeState={other,offer,mode:mode||(offer?'incoming':'compose'),give:new Set(offer?(fromHuman?offer.give:offer.take):[]),take:new Set(offer?(fromHuman?offer.take:offer.give):[]),giveCash:offer?(fromHuman?offer.giveCash:offer.takeCash):0,takeCash:offer?(fromHuman?offer.takeCash:offer.giveCash):0};
 modal='trade';clearTimeout(timer);document.body.classList.add('trading');$('modal-root').innerHTML='';
 let panel=$('trade-panel');if(!panel){panel=document.createElement('section');panel.id='trade-panel';panel.className='panel trade-workspace';panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','trade-title');document.querySelector('main').appendChild(panel);}
 drawTrade();board();
}
function drawTrade(){
 const t=tradeState;if(!t)return;const p=game.s.players[mySeat()],q=game.s.players[t.other],locked=t.mode==='incoming';
 $('trade-panel').innerHTML=`<div class="trade-heading"><div><span class="eyebrow">${locked?((t.offer.depth||0)>0?'Incoming counteroffer':'Incoming offer'):t.mode==='counter'?'Make a counteroffer':'Negotiate at the table'}</span><h2 id="trade-title">${esc(p.name)} <span>↔</span> ${esc(q.name)}</h2></div><button class="small quiet" data-action="trade-close" aria-label="Close trade workspace">✕</button></div><p class="trade-map-note">The board stays visible. Click a space or “View deed” to inspect it. Both players’ holdings are marked in their colors.</p>${t.offer?'':`<label class="trade-partner">Trade with <select id="trade-bot" aria-label="Trade partner">${game.active.filter(x=>x.id!==mySeat()).map(x=>`<option value="${x.id}" ${x.id===q.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`}<div class="trade-columns"><section><div class="trade-player" style="--participant:${playerColor(p)}"><b>${esc(p.name)} gives</b><span>${money(p.cash)} available · ${game.own(mySeat()).length} deeds</span></div><label class="trade-cash">Cash <input id="give-cash" type="number" min="0" max="${p.cash}" step="1" value="${t.giveCash}" ${locked?'readonly':''}></label><div class="trade-card-list">${tradeCards(mySeat(),t.give,locked)}</div></section><section><div class="trade-player" style="--participant:${playerColor(q)}"><b>${esc(q.name)} gives</b><span>${money(q.cash)} available · ${game.own(q.id).length} deeds</span></div><label class="trade-cash">Cash <input id="take-cash" type="number" min="0" max="${q.cash}" step="1" value="${t.takeCash}" ${locked?'readonly':''}></label><div class="trade-card-list">${tradeCards(q.id,t.take,locked)}</div></section></div><div id="trade-difference"></div><div id="trade-summary" class="trade-summary"></div><div id="trade-feedback" class="feedback" role="status"></div><div class="trade-buttons">${remote?.status.socialVersion&&socialSeats().includes(q.id)?`<button class="quiet" data-action="trade-talk">${tradeChatOpen?'Hide discussion':'Discuss @'+esc(q.name)}</button>`:''}${locked?'<button class="primary" data-action="trade-accept">Accept offer</button><button data-action="trade-counter">Edit counteroffer</button><button class="quiet" data-action="trade-reject">Decline</button>':`<button class="primary" data-action="trade-submit">${t.mode==='counter'?'Send counteroffer':'Propose trade'} →</button><button class="quiet" data-action="trade-close">Back to board</button>`}</div><p class="trade-fine">Mortgages stay with deeds; recipients pay transfer interest. Properties with buildings are shown for reference and cannot be included.</p><div id="trade-inspection" class="trade-inspection hidden"></div>`;
 if(tradeChatOpen&&remote?.status.socialVersion){const opening=!$('chat-panel').classList.contains('trade-chat');moveTableChat(document.querySelector('main'),'trade');document.body.classList.add('trading-discussion');if(opening)$('ai-chat-target').value=String(q.id);}else restoreTradeChat();
 updateTradeSummary();
}
function updateTradeSummary(){
 if(!tradeState||!$('trade-summary'))return;
 const t=tradeState;const groups=RentReasonExperience.tradeGroups(game,mySeat(),t.other,[...t.give],[...t.take]);
 $('trade-summary').innerHTML=`<span>You give <b>${t.give.size} deed${t.give.size===1?'':'s'} + ${money(t.giveCash)}</b></span><span>You receive <b>${t.take.size} deed${t.take.size===1?'':'s'} + ${money(t.takeCash)}</b></span>${groups.map(x=>`<strong class="trade-rent-reason">${esc(x.name)} gains a ${esc(x.group==='sky'?'light blue':x.group)} rent-reason.</strong>`).join('')}`;
 const comparison=t.mode==='counter'?t.offer:previousOffer(t.offer),current=t.mode==='counter'?{from:mySeat(),to:t.other,give:[...t.give],take:[...t.take],giveCash:t.giveCash,takeCash:t.takeCash}:t.offer;if($('trade-difference'))$('trade-difference').innerHTML=tradeDifferenceMarkup(comparison,current);
 board();
}
function closeTrade(){restoreTradeChat();tradeChatOpen=false;tradeState=null;$('trade-panel')?.remove();document.body.classList.remove('trading');if(modal==='trade')modal=null;board();schedule();}
function inspectTrade(id){
 selected=id;board();const b=B[id];if(!b?.price)return;const pr=game.s.props[id];const host=$('trade-inspection');host.classList.remove('hidden');host.innerHTML=`<div class="trade-inspect-header"><b>${esc(b.name)}</b><button class="small quiet" data-action="trade-peek-close">✕</button></div>${View.card(b,pr.mortgaged)}<small>${pr.owner===null?'Bank':esc(game.s.players[pr.owner].name)} owns this · ${money(b.price)}</small>`;
}
async function tradeAction(action){
 if(action==='trade-close'){closeTrade();return;}
 if(action==='trade-peek-close'){$('trade-inspection')?.classList.add('hidden');return;}
 const t=tradeState;if(!t)return;
 if(action==='trade-talk'){tradeChatOpen=!tradeChatOpen;drawTrade();if(tradeChatOpen)$('ai-message').focus({preventScroll:true});return;}
 if(action==='trade-counter'){t.mode='counter';drawTrade();return;}
 if(action==='trade-reject'){
  if(remote){if(await remoteAction('reject',{offerId:t.offer.id})){closeTrade();void drainAi();}}else closeTrade();return;
 }
 if(action==='trade-accept'){
  if(remote){if(await remoteAction('accept',{offerId:t.offer.id})){closeTrade();void drainAi();}}
  else{const o=t.offer;closeTrade();await perform(()=>{const r=game.executeTrade(o.from,o.to,o.give,o.take,o.giveCash,o.takeCash);if(!r.ok)toast(r.text);});}return;
 }
 if(action==='trade-submit'){
  if(!$('give-cash').reportValidity()||!$('take-cash').reportValidity())return;
  t.giveCash=Number($('give-cash').value);t.takeCash=Number($('take-cash').value);
  const proposal={from:mySeat(),to:t.other,give:[...t.give],take:[...t.take],giveCash:t.giveCash,takeCash:t.takeCash};
  const error=game.validateTrade(proposal.from,proposal.to,proposal.give,proposal.take,proposal.giveCash,proposal.takeCash);if(error){$('trade-feedback').textContent=error;return;}
  if(remote){if(await remoteAction(t.mode==='counter'?'counter-propose':'propose',{trade:proposal,...(t.offer?{offerId:t.offer.id}:{})})){closeTrade();void drainAi();}return;}
  let result;await perform(()=>{result=game.trade(t.other,proposal.give,proposal.take,proposal.giveCash,proposal.takeCash);});
  if(result.ok){closeTrade();toast(result.text);return;}
  const other=t.other,incoming=game.tradeValue(other,proposal.give)+proposal.giveCash,outgoing=game.tradeValue(other,proposal.take,true)+proposal.takeCash;
  const extra=Math.max(10,Math.ceil((outgoing*(game.s.difficulty==='relaxed'?.88:1.08)-incoming)/10)*10);
  const offer={previous:{...proposal},id:'classic-counter-'+Date.now(),from:other,to:0,give:proposal.take,take:proposal.give,giveCash:proposal.takeCash,takeCash:proposal.giveCash+extra,depth:1};
  if(!game.validateTrade(offer.from,offer.to,offer.give,offer.take,offer.giveCash,offer.takeCash)){playCue('offer');openTrade({offer});toast(game.s.players[other].name+' made a counteroffer.');}else{drawTrade();$('trade-feedback').textContent=result.text;}
 }
}
function maybeOpenOffer(){
 const o=remote?.status.offer;if(!o||o.to!==mySeat()||game.s.players[mySeat()].bot||seenOffers.has(o.id)||busy||cardWait||modal||remote.applied!==remote.latest)return;
 seenOffers.add(o.id);openTrade({offer:o});
}
document.addEventListener('change',e=>{
 const t=tradeState;if(!t)return;
 if(e.target.id==='trade-bot'){openTrade({other:Number(e.target.value)});return;}
 if(e.target.dataset.tradeProperty!==undefined){const set=t[e.target.dataset.tradeSide],id=Number(e.target.dataset.tradeProperty);e.target.checked?set.add(id):set.delete(id);e.target.closest('.trade-deed-item').classList.toggle('chosen',e.target.checked);updateTradeSummary();}
});
document.addEventListener('input',e=>{if(tradeState&&['give-cash','take-cash'].includes(e.target.id)){tradeState[e.target.id==='give-cash'?'giveCash':'takeCash']=Number(e.target.value);updateTradeSummary();}});
