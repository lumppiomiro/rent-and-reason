/* Setup drafts are separate from game state until the final Create action. */
(function(root){
'use strict';
const M=root.RentReason||(typeof require==='function'?require('./engine.js'):null);
function draft(state={},controllers=[]){
 const defaults=['You','Ada','Jasper','Cleo'],pieces=['comet','acorn','lantern','sail'];
 return {step:0,seat:0,mode:'play',count:state.players?.length||4,boardId:state.boardId||'lantern-harbor',language:state.language||'en',startingCash:state.startingCash??1500,roundLimit:state.roundLimit||0,difficulty:state.difficulty||'standard',rules:{...M.DEFAULT_RULES,...state.rules},players:Array.from({length:4},(_,i)=>({name:state.players?.[i]?.name||defaults[i],...(controllers[i]?.characterId?{characterId:controllers[i].characterId}:{}),...(controllers[i]?.learningEnabled!==undefined?{learningEnabled:controllers[i].learningEnabled}:{}),type:controllers[i]?.type||(i===0?'human':'heuristic'),model:controllers[i]?.model||'',piece:state.players?.[i]?.piece||pieces[i],color:state.players?.[i]?.color||M.PLAYER_COLORS[i][0],personality:controllers[i]?.personality||['balanced','builder','trader','defensive'][i],effort:controllers[i]?.effort||'low',voice:controllers[i]?.voice||'natural',chattiness:controllers[i]?.chattiness||'normal',customVoice:controllers[i]?.customVoice||''}))};
}
function validate(d,{host=false,providers={}}={}){
 if(!M.Boards.EDITIONS[d.boardId]||!['en','fi'].includes(d.language))return 'Choose a valid board and language.';
 if(d.tournament){if(!Number.isInteger(d.count)||d.count<4||d.count>16)return 'Choose 4–16 tournament entrants.';if(!Number.isInteger(d.leagueRounds)||d.leagueRounds<1||d.leagueRounds>10)return 'Choose 1–10 league rounds.';}else if(!Number.isInteger(d.count)||d.count<2||d.count>4)return 'Choose 2–4 players.';
 if(!Number.isInteger(d.startingCash)||d.startingCash<0||d.startingCash>1000000)return 'Starting cash must be a whole amount between 0 and 1,000,000.';
 const ps=d.players.slice(0,d.count),used=new Set(),colors=new Set(),characters=new Set();
 for(const p of ps){
  if(p.characterId){if(characters.has(p.characterId))return 'Choose a different character for each seat.';characters.add(p.characterId);}
  if(!p.name.trim())return 'Give every player a name.';
  if(!M.PIECES.includes(p.piece))return 'Choose a playing piece for every player.';
  if(!M.isLogoPiece(p.piece)&&used.has(p.piece))return 'Choose a different badge for each player.';used.add(p.piece);
  if(!M.PLAYER_COLORS.some(c=>c[0]===p.color)||colors.has(p.color))return 'Choose a different colour for each player.';colors.add(p.color);
  if(!['human','heuristic','ollama','codex','claude','openrouter','openai','gemini','deepseek','groq','lmstudio','compatible'].includes(p.type))return 'Choose a controller for every player.';
  if(p.type==='human'&&d.mode!=='play')return 'Watch mode cannot contain human seats.';
  if(p.type==='human'&&p!==ps[0]&&!host)return 'Open the AI launcher to host multiple human players.';
  if(!['human','heuristic'].includes(p.type)){
   if(!host)return 'Open the AI launcher to use model players.';
   if(!providers[p.type]?.available)return 'One of the selected model providers is unavailable.';
   if(!(providers[p.type].models||[]).some(m=>m.id===p.model))return 'Choose an available model for every AI player.';
  }
 }
 if(d.mode==='play'&&ps[0].type!=='human')return 'Choose a human in the first seat, or switch to Watch.';
 return '';
}
function options(d){return {...(d.tournament?{leagueRounds:d.leagueRounds}:{}),boardId:d.boardId,language:d.language,startingCash:d.startingCash,roundLimit:d.roundLimit,difficulty:d.difficulty,rules:{...d.rules},players:d.players.slice(0,d.count).map(({_characterApplied,_pieceManual,...p})=>({...p,name:p.name.trim()}))};}
const api={draft,validate,options};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonLobby=api;
})(globalThis);
