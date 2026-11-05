/* A live play-time label; stored time excludes pauses and closed-host intervals. */
const GameTime=RentReasonGameTime;
let classicClock=null,classicClockGame=null;
function syncGameClock(){if(!game)return;if(remote){renderGameClock();return;}if(classicClockGame!==game){classicClockGame=game;classicClock=new GameTime.GameClock(game.s.timing,{legacy:!game.s.timing&&(game.s.round>1||game.s.props.some(p=>p.owner!==null)||game.s.players.some(p=>p.pos!==0)),finished:game.s.phase==='over'});}if(game.s.phase==='over')classicClock.finish();else if(!document.hidden&&!modal&&classicClock.data.startedAt)classicClock.resume();saveClassicClock();renderGameClock();}
function saveClassicClock(){if(!remote&&classicClock&&classicClockGame===game)game.s.timing=classicClock.save();}
function pauseClassicClock(){if(!remote&&classicClock){classicClock.pause();saveClassicClock();}}
function resumeClassicClock(){if(!remote&&classicClock&&!document.hidden&&game.s.phase!=='over'&&classicClock.data.startedAt){classicClock.resume();saveClassicClock();}}
function renderGameClock(){if(!game)return;let node=$('game-time');if(!node){node=document.createElement('span');node.id='game-time';node.className='game-time';node.setAttribute('role','timer');node.setAttribute('aria-live','off');document.querySelector('.board-footer')?.appendChild(node);}const t=remote?.status.timing||classicClock?.sample();if(!t||t.coverage==='unrecorded'||!t.startedAt){node.textContent=t?.coverage==='unrecorded'?'Play time: not recorded':'Play time: 0:00';return;}const elapsed=t.playedMs+(remote&&t.running?Math.max(0,Date.now()-t.sampledAt):0);node.textContent='Play time: '+GameTime.format(elapsed)+(t.coverage==='partial'?' · partial':'');node.title='Excludes pauses and time while the game host is closed.';}
setInterval(()=>renderGameClock(),1000);
setInterval(()=>{if(!remote&&classicClock?.data.startedAt){saveClassicClock();persist();}},15000);
document.addEventListener('click',e=>{if(remote||!classicClock||!e.target.closest('[data-action="roll"],#dice-tray'))return;if(game.s.phase==='roll'&&!modal&&!game.player.bot)classicClock.resume();},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseClassicClock();else resumeClassicClock();});
globalThis.addEventListener('beforeunload',()=>{pauseClassicClock();if(!remote&&game)persist();});
