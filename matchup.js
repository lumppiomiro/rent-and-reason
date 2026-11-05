/* Public matchup facts shared by the host and the offline table. */
(function(root){
'use strict';
const T=root.RentReasonTrophies||(typeof require==='function'?require('./trophies.js'):null);
function roster(players,cabinet,recall=()=>null){
 const career=T.memory(cabinet,players),last=(cabinet?.matches||[]).slice().sort((a,b)=>String(b.finishedAt).localeCompare(String(a.finishedAt)))[0];
 return players.map((p,seat)=>{const packet=recall(seat),c=packet?.players?.find(c=>c.seat===seat),fallback=career[seat],who=T.identity(p,p),wins=last?.entries.filter(e=>e.place===1)||[],champion=wins.some(e=>p.characterId?e.characterId===p.characterId:e.key===who.key);
 return{seat,name:p.name,type:p.type,model:p.model||'',games:c?.games??fallback.games,podium:c?.podium||[fallback.gold,fallback.silver,fallback.bronze],basis:c?'character':'model',defendingChampion:champion,rivalries:(packet?.rivalries||[]).filter(r=>r.seat!==seat&&players[r.seat]&&r.games>0).slice(0,3).map(({seat,games,ahead,behind})=>({seat,games,ahead,behind}))};});
}
function greeting(name,seat,language='en'){return language==='fi'?['Nopat valmiiksi. Katsotaan, kuka rakentaa ensimmäisen hotellin.','Onnea peliin kaikille! Minulla on jo hyvä tunne tästä pöydästä.','Hyvä kauppa voi muuttaa kaiken. Tavataan neuvottelupöydässä.'][seat%3]:['Dice at the ready. Let’s see who builds the first landmark.','Good luck, everyone! I have a good feeling about this table.','One good deal can change everything. See you at the negotiating table.'][seat%3];}
const invitation='Before the first roll, greet today’s opponents in one short, complete line in your character voice. You may react playfully to verified public career records or today’s board and house rules. This match has NOT started: nobody owns deeds or has made deals. Do not invent rivalries, promise collusion, reveal private strategy or bidding limits, or summon another model. Respond to earlier introductions if useful; avoid repeating them.';
function callbacks(chat){return(chat||[]).filter(c=>c.kind==='pre-match'||c.stage==='pre-match'&&c.kind==='reply').slice(0,4).map(({seat,name,text})=>({seat,name,text:String(text).slice(0,240)}));}
const api={roster,greeting,invitation,callbacks};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonMatchup=api;
})(globalThis);
