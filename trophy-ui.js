/* Persistent public careers, separate from a table's private agent notes. */
const Trophies=RentReasonTrophies;
let trophyCabinet=Trophies.empty(),trophyResultSignature='';

let classicMatchGame=null,classicMatchTracker=null,classicArchivePending=false;
function classicHistory(){
 if(remote)return null;
 if(classicMatchGame!==game){classicMatchGame=game;const s=game.s,complete=s.round===1&&s.phase==='roll'&&s.props.every(p=>p.owner===null)&&s.players.every(p=>p.cash===s.startingCash&&p.pos===0);classicMatchTracker=new RentReasonMatchData.Tracker(s,{saved:s.matchHistory,complete,revision:s.matchHistory?.lastRevision||0});classicMatchTracker.attach(game);}
 return classicMatchTracker;
}
function persistClassicHistory(){const tracker=classicHistory();if(tracker)game.s.matchHistory=tracker.capture(game.s.preMatch?.chat||[],game.s.players.map(p=>({...game.s.controllers?.[p.id],type:game.s.controllers?.[p.id]?.type||(p.bot?'heuristic':'human'),name:p.name})),game.s,tracker.data.lastRevision);}
function localArchive(mode,id,data){return new Promise((resolve,reject)=>{
 const request=indexedDB.open('offline-rent-reason-matches',1);request.onupgradeneeded=()=>request.result.createObjectStore('matches',{keyPath:'id'});request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('matches',mode),store=tx.objectStore('matches'),op=data?store.put(data):store.get(id);let value;op.onsuccess=()=>value=op.result;tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};};
});}
async function viewArchivedMatch(id){try{const archive=remote?await api('match?id='+encodeURIComponent(id)):await localArchive('readonly',id);if(!archive)throw Error('No board snapshot was saved for this older match.');RentReasonMatchViewer.open(archive);}catch(e){toast('Could not open the archive: '+e.message);}}

function localCabinet(){try{const data=JSON.parse(pref('trophy-cabinet-v1','null'));return data?.version===1&&Array.isArray(data.matches)&&data.matches.every(Trophies.valid)?data:Trophies.empty();}catch{return Trophies.empty();}}
function currentStandings(){
 const observed=Trophies.standings(game.s);
 const recorded=remote?.status.result?.entries||[];
 return observed.map(e=>{const saved=recorded.find(r=>r.seat===e.seat);return {...e,place:saved?.place??e.place,eliminatedRound:saved?.eliminatedRound??e.eliminatedRound};}).sort((a,b)=>(a.place??99)-(b.place??99)||a.seat-b.seat);
}
function syncTrophyRecord(){
 if(game.s.phase!=='over'||remote||classicArchivePending)return;
 persistClassicHistory();const record=Trophies.match(game.s,game.s.controllers||[],tableStatsKey),signature=JSON.stringify([record.entries,record.id,game.s.matchHistory.lastRevision]);
 if(signature===trophyResultSignature)return;
 const saved={id:record.id,revision:game.s.matchHistory.lastRevision,game:game.s,options:{players:game.s.players.map(p=>({...game.s.controllers?.[p.id],type:p.bot?'heuristic':'human',name:p.name}))},matchHistory:game.s.matchHistory,chat:[],agents:{}};
 if(typeof recordClassicNotebook==='function')recordClassicNotebook(saved,record);
 const archive=RentReasonMatchData.archive(saved,record),meta={version:1,bytes:new Blob([JSON.stringify(archive)]).size,snapshots:archive.snapshots.length,statistics:archive.statistics.coverage.complete?'complete':'partial'};
 trophyCabinet=Trophies.upsert(localCabinet(),record);savePref('trophy-cabinet-v1',JSON.stringify(trophyCabinet));classicArchivePending=true;
 void localArchive('readwrite',record.id,archive).then(()=>{trophyResultSignature=signature;trophyCabinet=Trophies.upsert(localCabinet(),{...record,archive:meta});savePref('trophy-cabinet-v1',JSON.stringify(trophyCabinet));}).catch(e=>{trophyResultSignature=signature;toast('Ranking saved, but the board archive could not be stored: '+e.message);}).finally(()=>{classicArchivePending=false;});
}

function trophyCup(){return '<svg viewBox="0 0 80 80" aria-hidden="true"><path d="M23 10h34v18c0 18-11 24-17 24S23 46 23 28zM23 17H10v7c0 13 9 17 18 17M57 17h13v7c0 13-9 17-18 17M40 52v14M26 70h28" fill="#e9c46a" stroke="#876224" stroke-width="4" stroke-linejoin="round"/><path d="m40 19 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" fill="#fff6cb" stroke="none"/></svg>';}
// Legacy trophy entry points now open the unified character and career page.
async function trophyDialog(){await openNotebooks();}
function postMatchChat(){closeModal();$('chat-panel').scrollIntoView({block:'nearest'});scrollChatToBottom();$('ai-message')?.focus({preventScroll:true});}
function exportTrophies(){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(trophyCabinet,null,2)],{type:'application/json'}));a.href=url;a.download='rent-reason-trophy-cabinet.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
