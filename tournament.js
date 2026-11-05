/* A saved league is carried with its current table. No model calls or game actions. */
(function(root){
'use strict';
const M=root.RentReason||(typeof require==='function'?require('./engine.js'):null);
const T=root.RentReasonTrophies||(typeof require==='function'?require('./trophies.js'):null);
const copy=x=>JSON.parse(JSON.stringify(x)),POINTS=[4,2,1,0];
function schedule(count,rounds){
 const encounters=Array.from({length:count},()=>Array(count).fill(0)),sizes=Array.from({length:count},()=>Array(5).fill(0)),seats=Array.from({length:count},()=>Array(4).fill(0)),fixtures=[];
 let seed=83177;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const tables=Math.ceil(count/4),lengths=Array.from({length:tables},(_,i)=>Math.floor(count/tables)+(i<count%tables?1:0));
 for(let round=1;round<=rounds;round++){
  let best,bestCost=Infinity;
  for(let attempt=0;attempt<160;attempt++){
   const order=Array.from({length:count},(_,i)=>i);for(let i=count-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
   let offset=0,cost=0;const groups=lengths.map(n=>{const group=order.slice(offset,offset+=n);for(let i=0;i<n;i++){cost+=sizes[group[i]][n]*3;for(let j=0;j<i;j++)cost+=encounters[group[i]][group[j]]*20;}return group;});
   if(cost<bestCost){best=groups;bestCost=cost;}
  }
  for(const group of best){
   const ordered=[];while(group.length){const seat=ordered.length;group.sort((a,b)=>seats[a][seat]-seats[b][seat]||a-b);ordered.push(group.shift());}
   ordered.forEach((p,i)=>{seats[p][i]++;sizes[p][ordered.length]++;for(const q of ordered)if(p!==q)encounters[p][q]++;});
   fixtures.push({round,entrants:ordered,result:null});
  }
 }
 return fixtures;
}
function create(options,{id='league-'+Date.now().toString(36)}={}){
 const n=options?.players?.length,rounds=options?.leagueRounds??3;
 if(!Number.isInteger(n)||n<4||n>16)throw Error('Choose 4–16 tournament entrants.');
 if(!Number.isInteger(rounds)||rounds<1||rounds>10)throw Error('Choose 1–10 league rounds.');
 const roster=copy(options.players),characters=new Set();
 for(const p of roster){if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>24)throw Error('Give every entrant a name of up to 24 characters.');if(p.characterId){if(characters.has(p.characterId))throw Error('Choose a different character for each entrant.');characters.add(p.characterId);}}
 const settings=copy(options);delete settings.players;delete settings.leagueRounds;delete settings.tournament;
 const fixtures=schedule(n,rounds);for(const f of fixtures)f.entrants.sort((a,b)=>Number(roster[b].type==='human')-Number(roster[a].type==='human'));
 return {version:1,id,rounds,roster,settings,current:0,fixtures};
}
function validate(value){
 if(!value||value.version!==1||typeof value.id!=='string'||value.id.length>100)throw Error('Invalid tournament save.');
 const t=copy(value),fresh=create({...t.settings,players:t.roster,leagueRounds:t.rounds},{id:t.id});
 if(!Number.isInteger(t.current)||t.current<0||t.current>=fresh.fixtures.length||!Array.isArray(t.fixtures)||t.fixtures.length!==fresh.fixtures.length)throw Error('Invalid tournament schedule.');
 t.fixtures.forEach((f,i)=>{
  const expected=fresh.fixtures[i];if(f.round!==expected.round||JSON.stringify(f.entrants)!==JSON.stringify(expected.entrants))throw Error('Invalid tournament schedule.');
  if(i<t.current&&!f.result||i>t.current&&f.result)throw Error('Invalid tournament progress.');
  if(f.result){const r=f.result;if(typeof r.matchId!=='string'||r.matchId.length>160||!Array.isArray(r.entries)||r.entries.length!==f.entrants.length||r.entries.some((e,j)=>e.entrant!==f.entrants[j]||!Number.isInteger(e.place)||e.place<1||e.place>f.entrants.length)||!r.entries.some(e=>e.place===1))throw Error('Invalid tournament result.');const sorted=r.entries.map(e=>e.place).sort((a,b)=>a-b);for(let j=0;j<sorted.length;j++)if(sorted[j]!==sorted[j-1]&&sorted[j]!==j+1)throw Error('Invalid tied placements.');const awarded=points(r.entries);if(r.entries.some((e,j)=>e.points!==awarded[j]))throw Error('Invalid tournament points.');}
 });
 return t;
}
function options(t){const f=t.fixtures[t.current];return {...copy(t.settings),preMatch:true,players:f.entrants.map(i=>copy(t.roster[i]))};}
function bind(t,players){t.fixtures[t.current].entrants.forEach((entrant,seat)=>{if(players[seat].characterId)t.roster[entrant].characterId=players[seat].characterId;delete t.roster[entrant].newCharacter;});}
function points(entries){return entries.map(e=>{const tied=entries.filter(p=>p.place===e.place).length;return POINTS.slice(e.place-1,e.place-1+tied).reduce((n,p)=>n+p,0)/tied;});}
function record(t,state,matchId){
 const fixture=t.fixtures[t.current];if(state.phase!=='over'||fixture.result)return false;
 const standings=T.standings(state),survivors=standings.filter(e=>!e.out);
 // The engine picks one winner at a round cap; the league shares equal net worth.
 for(const e of survivors)e.place=1+survivors.filter(p=>p.netWorth>e.netWorth).length;
 const entries=fixture.entrants.map((entrant,seat)=>({entrant,place:standings.find(e=>e.seat===seat)?.place}));
 if(entries.some(e=>!Number.isInteger(e.place)))throw Error('Tournament result has missing placements.');
 const awarded=points(entries);entries.forEach((e,i)=>e.points=awarded[i]);fixture.result={matchId,entries};return true;
}
function next(value){const t=validate(value);if(!t.fixtures[t.current].result)throw Error('Finish the current table before advancing.');if(t.current===t.fixtures.length-1)throw Error('The tournament is complete.');t.current++;return t;}
function standings(t){
 const rows=t.roster.map((p,entrant)=>({entrant,name:p.name,piece:p.piece,color:p.color,games:0,points:0,wins:0}));
 for(const f of t.fixtures)for(const e of f.result?.entries||[]){const row=rows[e.entrant];row.games++;row.points+=e.points;if(e.place===1)row.wins++;}
 rows.sort((a,b)=>b.points-a.points||b.wins-a.wins||a.entrant-b.entrant);let rank=1;
 return rows.map((r,i)=>{if(i&&(r.points!==rows[i-1].points||r.wins!==rows[i-1].wins))rank=i+1;return {...r,rank};});
}
function view(t){return {version:1,id:t.id,rounds:t.rounds,current:t.current,complete:t.current===t.fixtures.length-1&&!!t.fixtures[t.current].result,standings:standings(t),fixtures:copy(t.fixtures)};}
const api={create,validate,schedule,options,bind,record,next,standings,view};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonTournament=api;
})(globalThis);
