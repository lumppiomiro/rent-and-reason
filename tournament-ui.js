/* Tournament controls reuse the player editor and each game's waiting room. */
let tournamentPending=false,tournamentRendered='';
function syncTournament(){if(modal!=='lobby'||lobbyView!=='tournament')return;const t=tournamentView(),key=t?JSON.stringify([t.id,t.current,t.fixtures.map(f=>!!f.result)]):'';if(key!==tournamentRendered){tournamentRendered=key;renderLobby();}}
function tournamentView(){return remote?.status.tournament||(!remote&&game.s.tournament?RentReasonTournament.view(game.s.tournament):null);}
function openTournament(){if(isGuest())return;lobbyView='tournament';lobbyError='';renderLobby(true);}
function tournamentSetupRules(){return `<div class="tournament-scoring"><label>League rounds<select id="lobby-league-rounds">${optionList(Array.from({length:10},(_,i)=>[String(i+1),String(i+1)]),String(lobbyDraft.leagueRounds))}</select></label><p>Every entrant plays once per league round, at tables of 2–4. Opponents and seats rotate. Placements earn 4 / 2 / 1 / 0 points; tied places share the points. Overall ties use wins, then share the rank.</p><small>${Math.ceil(lobbyDraft.count/4)*lobbyDraft.leagueRounds} games in this tournament. Each table has its own game length.</small></div>`;}
function tournamentHTML(){
 const t=tournamentView();
 if(!t)return `<section class="tournament-intro"><span class="eyebrow">MORE RIVALS. ONE LEAGUE.</span><h1 id="modal-title">${uiLanguage==='fi'?'':'The '}<em>tournament.</em></h1><p>Bring 4–16 characters to a league of rotating tables. Build a lead, meet new opponents, and return for the next round.</p><div class="tournament-features"><article><b>Everyone plays.</b><p>Every entrant gets one game per league round. Tables hold up to four players.</p></article><article><b>Every finish counts.</b><p>Score 4 / 2 / 1 / 0 points by placement. Tied places share points; total wins break league ties.</p></article><article><b>Take your time.</b><p>Progress stays with the current game’s autosave and export. Start each next table when you’re ready.</p></article></div><button class="primary" data-lobby="tournament:setup">Set up the tournament →</button></section>`;
 const fixture=t.fixtures[t.current],rows=t.standings,leaders=rows.filter(p=>p.rank===1),done=t.fixtures.filter(f=>f.result).length;
 return `<section class="tournament-page"><div class="lobby-page-heading"><span class="eyebrow">THE LEAGUE TABLE</span><h1 id="modal-title">${t.complete?'The final standings.':'The tournament.'}</h1><p>${t.complete?`${leaders.map(p=>'<span data-no-translate>'+esc(p.name)+'</span>').join(' & ')} · ${lobbyText(leaders.length>1?'Joint champions':'Tournament champion')}`:`${lobbyText('League round')} ${fixture.round} / ${t.rounds} · ${done} / ${t.fixtures.length} ${lobbyText('games complete')}`}</p></div><div class="tournament-progress"><span style="width:${done/t.fixtures.length*100}%"></span></div><div class="tournament-layout"><section class="tournament-standings"><h2>Standings</h2><div class="tournament-table-scroll"><table><thead><tr><th scope="col">Place</th><th scope="col">Entrant</th><th scope="col">Played</th><th scope="col">Wins</th><th scope="col">Points</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${p.rank}</td><th scope="row"><span data-no-translate>${esc(p.name)}</span></th><td>${p.games}</td><td>${p.wins}</td><td><strong>${Number(p.points.toFixed(2))}</strong></td></tr>`).join('')}</tbody></table></div><p>Points decide the league. Wins break ties; equal points and wins share a rank. Standings are provisional until every table is finished.</p><p>Progress travels with the current game. Export it before creating another game.</p></section><aside class="tournament-current"><span class="eyebrow">${t.complete?'TOURNAMENT COMPLETE':'CURRENT TABLE'}</span><h2>${lobbyText('Table')} ${t.current+1}</h2><p>${fixture.entrants.map(id=>`<span data-no-translate>${esc(rows.find(p=>p.entrant===id).name)}</span>`).join(' · ')}</p>${t.complete?'<p>The league has its champions. Every completed table also counts toward character careers.</p>':fixture.result?`<button class="primary full" data-lobby="tournament:next" ${tournamentPending?'disabled':''}>Next table →</button>`:'<button class="primary full" data-lobby="resume">Return to current table →</button>'}<button class="quiet full" data-lobby="export">Export save</button><button class="quiet full" data-lobby="tournament:setup">Set up another tournament</button></aside></div><section class="tournament-fixtures"><h2>Schedule & results</h2>${Array.from({length:t.rounds},(_,i)=>`<details ${i+1===fixture.round?'open':''}><summary>${lobbyText('League round')} ${i+1}</summary>${t.fixtures.map((f,index)=>f.round===i+1?`<article class="${index===t.current?'current':''}"><b>${lobbyText('Table')} ${index+1}</b><span>${f.entrants.map(id=>{const p=rows.find(p=>p.entrant===id),result=f.result?.entries.find(e=>e.entrant===id);return `<span><span data-no-translate>${esc(p.name)}</span>${result?` <small>(${result.points} ${lobbyText('pts')})</small>`:''}</span>`;}).join(' · ')}</span><small>${lobbyText(f.result?'Completed':index===t.current?'Current':'Upcoming')}</small></article>`:'').join('')}</details>`).join('')}</section><p id="lobby-error" role="alert">${esc(lobbyText(lobbyError))}</p></section>`;
}
function tournamentSetup(){
 lobbyDraft=Lobby.draft({},[]);lobbyDraft.tournament=true;lobbyDraft.leagueRounds=3;lobbyDraft.count=8;lobbyDraft.language=uiLanguage;lobbyDraft.roundLimit=30;
 const names=['You','Ada','Jasper','Cleo','Felix','Iris','Oscar','Nova','Leo','Maya','Finn','Ruby','Hugo','Luna','Max','Eden'];
 lobbyDraft.players=Array.from({length:16},(_,i)=>({...lobbyDraft.players[i%4],name:names[i],piece:RentReason.PIECES[i],color:RentReason.PLAYER_COLORS[i][0],type:i===0?'human':'heuristic',newCharacter:true}));
 lobbyView='setup';lobbyError='';renderLobby(true);void loadNotebookCatalog();if(aiHost)void lobbyLoadProviders();
}
function tournamentLaunchClassic(league){
 const options=RentReasonTournament.options(league);resetTabletopHistory();game=new Game(options);game.s.tournament=league;
 options.players.forEach((p,i)=>{if(p.characterId)game.s.controllers[i].characterId=p.characterId;});
 appearancePrefs.classic={};savePref('appearances',JSON.stringify(appearancePrefs));animationEpoch++;displayPositions=[];displayBalances=[];displayOut=[];lastReceipt=null;lastTradeReceipt=null;$('token-layer').innerHTML='';selected=39;firstRun=false;prepareClassicMatchup(options);closeModal();render();showMatchup();
}
async function tournamentCreate(){
 if(tournamentPending)return;const error=Lobby.validate(lobbyDraft,{host:!!aiHost,providers:providerInfo||{}});if(error){lobbyShowError(error);return;}
 if(lobbyPreview){lobbyShowError('Tournament creation is disabled in this read-only preview.');return;}
 if(aiHost&&!aiHost.features?.tournament){lobbyShowError('Tournament mode needs the updated AI host. Finish or pause your game, then relaunch the AI launcher.');return;}
 if(!firstRun&&game.s.phase!=='over'&&!$('lobby-replace')?.checked){lobbyShowError('Confirm replacement or export your current game first.');return;}
 tournamentPending=true;lobbyCreating=true;
 try{
  const options=Lobby.options(lobbyDraft);
  if(aiHost){const status=await api('tournament',{action:'create',options,...(remote?{id:remote.id,revision:remote.revision}:{})});closeModal();setRemote(status);}
  else{prepareClassicCharacters(options);tournamentLaunchClassic(RentReasonTournament.create(options));}
  lobbyDraft=null;lobbyError='';toast('The tournament is ready.');
 }catch(e){lobbyShowError(e.message);}finally{tournamentPending=false;lobbyCreating=false;if(modal==='lobby')renderLobby();}
}
async function tournamentAction(action){
 if(action==='setup'){tournamentSetup();return;}if(action!=='next'||tournamentPending||isGuest())return;
 if(lobbyPreview){lobbyShowError('Tournament controls are disabled in this read-only preview.');return;}
 tournamentPending=true;renderLobby();
 try{
  if(remote){const status=await api('tournament',{action:'next',id:remote.id,revision:remote.revision});closeModal();setRemote(status);}
  else{if(game.s.phase!=='over')throw Error('Finish the current table before advancing.');tournamentLaunchClassic(RentReasonTournament.next(game.s.tournament));}
 }catch(e){lobbyShowError(e.message);}finally{tournamentPending=false;if(modal==='lobby')renderLobby();}
}
