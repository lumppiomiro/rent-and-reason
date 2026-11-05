/* The game table presentation. All card and layout state stays in this browser. */
let handView='owned',handSignature='',handIds=[],deedReaderSource=null,deedReaderIds=[],deedReaderClosing=false;
document.body.classList.add('game-table');
function fitGameHand(){
 const host=$('property-hand');if(!host)return;
 const count=host.querySelectorAll('.hand-deed').length,layout=Tabletop.handLayout(count,host.clientWidth,host.clientHeight);
 host.style.setProperty('--hand-columns',layout.columns);host.style.setProperty('--hand-width',layout.width+'px');host.style.setProperty('--hand-gap',layout.gap+'px');
}
const handResizeObserver=new ResizeObserver(fitGameHand);
let observedHand=null;
function renderGameHand(){
 const s=game.s,seat=s.players[rackSeat]?rackSeat:mySeat(),groups=Tabletop.rack(s,seat),owned=game.own(seat),complete=groups.filter(g=>g.complete&&B.some(b=>b.group===g.group&&b.workshop));
 const order=Object.keys(Tabletop.GROUP_NAMES),rank=b=>order.indexOf(b.group)-(handView==='owned'&&complete.some(g=>g.group===b.group)?100:0);
 const cards=B.filter(b=>b.price&&(handView==='all'||s.props[b.id].owner===seat)).sort((a,b)=>rank(a)-rank(b)||a.id-b.id);
 handIds=cards.map(b=>b.id);
 const tradeAllowed=seat===mySeat()&&game.canManage(mySeat())&&(!remote||isMyTurn());
 const signature=JSON.stringify([s.boardId,uiLanguage,seat,handView,s.props,s.workshops,s.landmarks,tradeAllowed,s.players.map(p=>p.name)]);
 const panel=$('portfolio-panel');
 if(signature===handSignature&&$('property-hand')){panel.querySelectorAll('.hand-deed').forEach(el=>{const on=Number(el.dataset.card)===selected;el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});return;}
 const old=new Map([...panel.querySelectorAll('.hand-deed')].map(el=>[Number(el.dataset.card),el.getBoundingClientRect()]));
 const active=document.activeElement,focusCard=active?.closest?.('.hand-deed')?.dataset.card,focusId=panel.contains(active)?active.id:null;
 handSignature=signature;
 panel.innerHTML=`<div class="panel-title"><h2>${handView==='all'?'Title deeds':seat===mySeat()&&!s.players[seat].bot?'Your deeds':esc(s.players[seat].name)+'’s deeds'} <span class="count-badge">${cards.length}</span></h2><button class="small quiet" data-action="trade" ${tradeAllowed?'':'disabled'}>Trade ↗</button></div><div class="hand-tools"><div class="hand-tabs" aria-label="Property collection"><button data-hand-view="owned" aria-pressed="${handView==='owned'}">Owned</button><button data-hand-view="all" aria-pressed="${handView==='all'}">All cards</button></div><select id="rack-player" aria-label="Property rack player">${s.players.map(p=>`<option value="${p.id}" ${p.id===seat?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><div id="property-hand" class="property-hand">${cards.map(b=>`<button class="hand-deed ${selected===b.id?'selected':''}" data-card="${b.id}" aria-label="Read ${esc(b.name)} title deed" aria-pressed="${selected===b.id}">${View.card(b,s.props[b.id].mortgaged)}</button>`).join('')||'<p class="empty-hand">Your first property starts the collection.</p>'}</div><div class="hand-caption">${handView==='owned'&&complete.length?`<span class="hand-set" style="--set-color:${complete[0].color}">${esc(complete[0].name)} · Full set</span>`:'<span>Select a card for a closer look.</span>'}<span class="hand-bank">Bank: ${s.workshops} workshops · ${s.landmarks} landmarks</span></div>`;
 fitGameHand();
 if(observedHand!==$('property-hand')){handResizeObserver.disconnect();observedHand=$('property-hand');handResizeObserver.observe(observedHand);}
 if(motion)for(const el of panel.querySelectorAll('.hand-deed')){
  const before=old.get(Number(el.dataset.card)),now=el.getBoundingClientRect();if(!now.width)continue;
  el.animate(before?[{transform:`translate(${before.left-now.left}px,${before.top-now.top}px) scale(${before.width/now.width})`},{transform:'none'}]:[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});
 }
 if(focusCard)panel.querySelector(`[data-card="${focusCard}"]`)?.focus({preventScroll:true});else if(focusId)$(focusId)?.focus({preventScroll:true});
}
function syncTurnActivity(){
 const panel=$('turn-panel');if(!panel||busy)return;
 if(remote){let transport=$('turn-host-control');if(!transport){transport=document.createElement('div');transport.id='turn-host-control';transport.className='turn-host-control';transport.innerHTML='<span></span><button></button>';panel.appendChild(transport);}const playing=remote.status.running||remote.status.thinking||(remote.status.retry&&!remote.status.retry.suspended);transport.querySelector('span').textContent=playing?'Table running':game.s.phase==='over'?'Match complete':'Table paused';const button=transport.querySelector('button');button.dataset.action=playing?'ai-pause':'ai-run';button.textContent=playing?'Pause':'Run / retry';button.classList.toggle('guest-hidden',isGuest());}
 const thinking=remote?.status.thinking,retry=remote?.status.retry,classic=!remote&&game.player.bot&&!modal&&game.s.phase!=='over';
 const active=!!thinking||!!(retry&&!retry.suspended)||classic;
 panel.classList.toggle('model-acting',active);panel.setAttribute('aria-busy',String(active));
 let node=$('turn-activity');
 if(!active){node?.remove();return;}
 if(!node){node=document.createElement('div');node.id='turn-activity';node.className='turn-activity';node.setAttribute('role','status');node.innerHTML='<div class="turn-activity-copy"><span></span><time></time></div><div class="animation-progress" aria-hidden="true"><span></span></div>';panel.querySelector('.turn-description')?.after(node);}
 const phase={preparing:'Preparing',reasoning:'Thinking',answering:'Writing a decision',retrying:'Retrying'}[thinking?.progress?.phase]||'Thinking';
 const label=thinking?(thinking.purpose==='chat'?thinking.name+' is replying':thinking.name+' · '+phase):retry&&!retry.suspended?'Retrying '+game.s.players[retry.seat]?.name:game.player.name+' is deciding';
 const text=node.querySelector('.turn-activity-copy span');if(text.textContent!==label)text.textContent=label;
 node.querySelector('time').textContent=thinking?Math.max(0,Math.floor((Date.now()-thinking.started)/1000))+'s':retry&&!retry.suspended?Math.max(0,Math.ceil((retry.nextAt-Date.now())/1000))+'s':'';
}
function syncGameTable(){
 const edition=Boards.EDITIONS[game.s.boardId||'lantern-harbor'];$('table-label').textContent=(uiLanguage==='fi'?edition.nameFi:edition.name)+' · Round '+game.s.round;
 const clock=$('game-time');if(clock&&clock.parentElement!==$('table-clock-home'))$('table-clock-home').appendChild(clock);
 const save=$('save-status'),home=document.querySelector('.game-save-note');if(save&&home&&!home.contains(save)){home.textContent='';home.appendChild(save);}
 syncTurnActivity();fitGameHand();
}
function tableControls(open,restoreFocus=true){
 $('game-controls').hidden=!open;document.body.classList.toggle('table-controls-open',open);document.querySelector('[data-table-ui="controls"]').setAttribute('aria-expanded',String(open));
 if(!open&&restoreFocus)document.querySelector('[data-table-ui="controls"]').focus({preventScroll:true});
}
function deedReadingContent(id){
 const b=B[id],pr=game.s.props[id],owner=pr.owner===null?null:game.s.players[pr.owner],group=owner?Tabletop.rack(game.s,owner.id).find(g=>g.group===b.group):null,rent=b.type==='utility'?(owner&&game.rent(id)===0?money(0):group?.owned===2?'10×':'4×'):money(owner?game.rent(id):b.rent?.[0]||25);
 return `<div class="modal-header"><span class="eyebrow">The property card</span><button class="small quiet" data-action="close" aria-label="Close title deed">✕</button></div><div class="deed-reading-layout"><div class="deed-reading-card">${View.card(b,pr.mortgaged)}</div><section class="deed-reading-notes"><span class="eyebrow">Title deed</span><h2 id="modal-title">${esc(b.name)}</h2><p><i class="ownership-dot" style="background:${owner?playerColor(owner):'#8b957e'}"></i>${owner?esc(owner.name)+'’s property':'Available from the bank'}</p><dl><div><dt>${pr.mortgaged?'Mortgaged':b.type==='utility'?'Rent × dice':owner?'Current rent':'Base rent'}</dt><dd>${pr.mortgaged?money(0):rent}</dd></div><div><dt>Deed value</dt><dd>${money(b.price)}</dd></div>${b.workshop?`<div><dt>Workshop cost</dt><dd>${money(b.workshop)}</dd></div>`:''}</dl><p class="deed-reading-context">${pr.mortgaged?'No rent is collected while this property is mortgaged.':owner?.inJail&&game.s.rules.noRentInJail?'Owner is in Permit Review · no rent due.':group?.complete&&b.type==='street'?pr.level?(pr.level===5?'Landmark':pr.level+' workshops')+' · Full set':'Full set · Base rent is doubled.':b.type==='utility'?'Rent depends on the dice roll.':'Read the card for the full rent schedule.'}</p><button class="deed-reading-back" data-action="close">Back to the board</button><div class="deed-reading-nav"><button data-table-ui="deed-previous" aria-label="Previous title deed">←</button><span>${deedReaderIds.indexOf(id)+1} / ${deedReaderIds.length}</span><button data-table-ui="deed-next" aria-label="Next title deed">→</button></div></section></div>`;
}
function openDeedReader(id=selected,source=null){
 if(!B[id]?.price||deedReaderClosing)return;
 source=source||$('portfolio-panel').querySelector(`[data-card="${id}"]`)||$('deed-panel').querySelector('.deed-preview');
 const origin=source?.getBoundingClientRect();deedReaderSource=source;deedReaderIds=handIds.includes(id)?[...handIds]:B.filter(b=>b.price).map(b=>b.id);
 selected=id;board();deed();renderPropertyRack();
 openModal('deed',deedReadingContent(id));const dialog=$('modal-root').querySelector('.modal');dialog.classList.add('deed-reading-modal');
 if(motion){const card=dialog.querySelector('.deed-reading-card .property-card'),target=card.getBoundingClientRect();card.animate(origin?[{transform:`translate(${origin.left-target.left}px,${origin.top-target.top}px) scale(${origin.width/target.width},${origin.height/target.height})`},{transform:'none'}]:[{opacity:.4,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:330,easing:'cubic-bezier(.2,.75,.2,1)'});dialog.querySelector('.deed-reading-notes').animate([{opacity:0},{opacity:1}],{duration:180,delay:110,fill:'backwards'});}
}
function browseDeedReader(direction){
 if(modal!=='deed'||deedReaderClosing)return;const active=document.activeElement?.dataset.tableUi;
 selected=deedReaderIds[(deedReaderIds.indexOf(selected)+direction+deedReaderIds.length)%deedReaderIds.length];board();deed();renderPropertyRack();deedReaderSource=$('portfolio-panel').querySelector(`[data-card="${selected}"]`);
 const dialog=$('modal-root').querySelector('.modal');dialog.innerHTML=deedReadingContent(selected);if(active)dialog.querySelector(`[data-table-ui="${active}"]`)?.focus({preventScroll:true});
 if(motion)dialog.querySelector('.deed-reading-layout').animate([{opacity:.4,transform:`translateX(${direction*8}px)`},{opacity:1,transform:'none'}],{duration:180,easing:'ease-out'});
}
async function putDeedBack(){
 if(modal!=='deed'||deedReaderClosing)return;deedReaderClosing=true;
 const card=$('modal-root').querySelector('.deed-reading-card .property-card'),source=deedReaderSource?.isConnected?deedReaderSource:null,dialog=$('modal-root').querySelector('.modal');
 try{if(motion&&card){const current=card.getBoundingClientRect();card.getAnimations().forEach(a=>a.cancel());const base=card.getBoundingClientRect(),to=source?.getBoundingClientRect(),transform=r=>`translate(${r.left-base.left}px,${r.top-base.top}px) scale(${r.width/base.width},${r.height/base.height})`;await card.animate(to?[{transform:transform(current)},{transform:transform(to)}]:[{opacity:1},{opacity:0,transform:'translateY(6px)'}],{duration:220,fill:'forwards',easing:'cubic-bezier(.4,0,.3,1)'}).finished.catch(()=>{});}if(modal!=='deed'||!dialog.isConnected)return;closeModal();render(false);const target=source?.isConnected?source:$('deed-panel').querySelector('.deed-preview');target?.focus({preventScroll:true});}finally{deedReaderClosing=false;}
}
document.addEventListener('click',e=>{
 const control=e.target.closest('[data-table-ui]');if(control){const action=control.dataset.tableUi;if(action==='controls')tableControls($('game-controls').hidden);if(action==='controls-close')tableControls(false);if(action==='deed-previous')browseDeedReader(-1);if(action==='deed-next')browseDeedReader(1);}
 const view=e.target.closest('[data-hand-view]');if(view&&handView!==view.dataset.handView){handView=view.dataset.handView;renderPropertyRack();}
 if(!$('game-controls').hidden&&!e.target.closest('#game-controls,[data-table-ui="controls"]'))tableControls(false,false);
 const menuAction=e.target.closest('#game-controls [data-action]');if(menuAction&&!['sound','ai-run','ai-pause','ai-catchup','ai-step'].includes(menuAction.dataset.action))tableControls(false,false);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('game-controls').hidden){e.preventDefault();tableControls(false);}if(modal==='deed'&&['ArrowLeft','ArrowRight'].includes(e.key)&&!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)){e.preventDefault();browseDeedReader(e.key==='ArrowLeft'?-1:1);}});
for(const event of ['pointerover','focusin'])document.addEventListener(event,e=>{const card=e.target.closest('.hand-deed');if(card)$('board').querySelector(`[data-space="${card.dataset.card}"]`)?.classList.add('hand-hover');});
for(const event of ['pointerout','focusout'])document.addEventListener(event,e=>{const card=e.target.closest('.hand-deed');if(card&&!card.contains(e.relatedTarget))$('board').querySelector(`[data-space="${card.dataset.card}"]`)?.classList.remove('hand-hover');});
RentReasonI18n.add({'Base rent':'Perusvuokra','Rent × dice':'Vuokra × nopat','Owner is in Permit Review · no rent due.':'Omistaja on vankilassa · vuokraa ei peritä.','Table controls':'Pöydän asetukset','Close table controls':'Sulje pöydän asetukset','Owned':'Omat','Select a card for a closer look.':'Valitse kortti lähempää tarkastelua varten.','Your first property starts the collection.':'Ensimmäinen tontti aloittaa kokoelmasi.','Property collection':'Tonttikokoelma','Previous title deed':'Edellinen omistuskortti','Next title deed':'Seuraava omistuskortti','Current rent':'Nykyinen vuokra','Deed value':'Tontin arvo','Workshop cost':'Talon hinta','Full set · Base rent is doubled.':'Koko väriryhmä · Perusvuokra on kaksinkertainen.','Read the card for the full rent schedule.':'Kortissa näkyvät kaikki vuokrat.','New messages':'Uusia viestejä','Latest messages':'Uusimmat viestit','Table conversation':'Pöydän keskustelu'});
