/* Bounded character notebooks. Historical facts never replace the live engine. */
(function(root){
'use strict';
const T=root.RentReasonTrophies||(typeof require==='function'?require('./trophies.js'):null);
const M=root.RentReason||(typeof require==='function'?require('./engine.js'):null);
const LIMITS=Object.freeze({lessons:5,moments:2,recent:8,evidence:12,packetBytes:2100,chatBytes:900,waitingJobs:24,jobs:128});
const LESSONS=Object.freeze({
 reserve:{tag:'liquidity',text:'My past investments sometimes left cash below the next-roll exposure. Check the post-investment reserve before buying or building.',fi:'Aiemmat sijoitukseni jättivät joskus käteisen seuraavan heiton riskin alle. Tarkista sijoituksen jälkeinen kassavara ennen ostamista tai rakentamista.'},
 trade:{tag:'trade',text:'A past deal unlocked a rival’s colour set. Compare both players’ immediate development options and cash after fees before accepting.',fi:'Aiempi kauppa avasi vastustajalle väriryhmän. Vertaa molempien välittömiä rakennusmahdollisuuksia ja kuluista jäävää käteistä ennen hyväksymistä.'},
 finance:{tag:'finance',text:'I have paid mortgage interest by reversing financing within one round. Require a concrete new benefit before reversing a mortgage decision.',fi:'Olen maksanut kiinnityskorkoja peruessani rahoitusratkaisuja saman kierroksen aikana. Vaadi konkreettinen uusi hyöty ennen päätöksen peruuttamista.'},
 development:{tag:'building',text:'I finished a past game with cash and an undeveloped complete set. Compare a funded building project before buying unrelated deeds.',fi:'Päätin aiemman pelin käteiseen ja rakentamattomaan täyteen väriryhmään. Vertaa rahoitettua rakennushanketta ennen irrallisten korttien ostoa.'},
 auction:{tag:'auction',text:'I previously spent more than a deed’s printed price at auction. Recheck set value and the reserve at the actual public price; ignore sunk bids.',fi:'Maksoin aiemmin huutokaupassa kortin painettua hintaa enemmän. Tarkista ryhmän arvo ja kassavara todellisen hinnan perusteella; unohda aiemmat tarjoukset.'}
});
const clean=(s,n=160)=>String(s??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,n),copy=x=>JSON.parse(JSON.stringify(x));
const validId=id=>typeof id==='string'&&/^char-[a-z0-9-]{16,64}$/.test(id);
function legacyId(key){let a=2166136261,b=333555777;for(const c of key){a=Math.imul(a^c.codePointAt(0),16777619);b=Math.imul(b^c.codePointAt(0),2246822519);}return'char-legacy-'+(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
const uuid=()=>root.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
const empty=()=>({version:1,revision:0,characters:{},processed:[],jobs:[]});
const TYPES=['human','heuristic','ollama','codex','claude','openrouter','openai','gemini','deepseek','groq','lmstudio','compatible'];
function definition(input={},base={}){
 const p={...base,...input},name=clean(p.name,24),type=p.type||'heuristic';
 if(!name||String(p.name).trim().length>24)throw Error('Give the character a name of up to 24 characters.');
 if(!TYPES.includes(type))throw Error('Choose a valid character controller.');
 const model=type==='human'||type==='heuristic'?'':clean(p.model,150);
 if(!['human','heuristic'].includes(type)&&(!model||String(p.model).trim().length>150))throw Error('Choose or enter a model for this character.');
 const piece=p.piece||'comet',color=p.color||M.PLAYER_COLORS[0][0],effort=p.effort||'low',personality=p.personality||'balanced',voice=p.voice||'natural',chattiness=p.chattiness||'normal',customVoice=p.customVoice??'';
 if(!M.PIECES.includes(piece))throw Error('Choose a valid playing piece.');if(!M.PLAYER_COLORS.some(c=>c[0]===color))throw Error('Choose a valid player colour.');
 if(!['low','medium','high'].includes(effort)||!['balanced','builder','trader','defensive'].includes(personality)||!['natural','witty','friendly','dramatic','competitive','deadpan'].includes(voice)||!['quiet','normal','lively'].includes(chattiness)||typeof customVoice!=='string'||customVoice.length>180)throw Error('Choose valid character personality settings.');
 if(p.learningEnabled!==undefined&&typeof p.learningEnabled!=='boolean')throw Error('Choose learning on or off.');
 return{name,type,model,piece,color,effort,personality,voice,chattiness,customVoice:customVoice.trim(),learningEnabled:type!=='human'&&p.learningEnabled!==false};
}
function configuration(c){return{name:c.name,type:c.kind==='human'?'human':c.backend.type,model:c.backend.model,...c.profile,learningEnabled:c.enabled};}
function edit(data,{action,characterId,profile,revision}){
 if(!['create','profile','appearance'].includes(action))throw Error('Unknown character action.');
 if(revision!==undefined&&revision!==data.revision)throw Error('Characters changed. Reopen the character before saving.');
 const old=data.characters[characterId];if(action!=='create'&&!old)throw Error('Character not found.');
 if(!profile||typeof profile!=='object'||Array.isArray(profile))throw Error('Supply character settings.');
 const fields=action==='appearance'?Object.fromEntries(['piece','color'].filter(k=>profile[k]!==undefined).map(k=>[k,profile[k]])):profile;
 const next=definition(fields,old?configuration(old):{});
 if(old&&action!=='create'&&(old.kind==='human')!==(next.type==='human'))throw Error('Create a new character to switch between human and bot.');
 const previousEnabled=old?.enabled,c=character(data,{...next,...(action==='create'?{newCharacter:true}:{})},{id:action==='create'?null:characterId});if(previousEnabled!==undefined&&previousEnabled!==c.enabled)c.epoch++;data.revision++;return c;
}
function character(data,config,{id=null}={}){
 const key=T.identity(config,{name:config.name,bot:config.type!=='human'}).key;
 id=id||(config.newCharacter?'char-'+uuid():config.characterId||legacyId(key));
 if(!validId(id))throw Error('Invalid character ID.');
 let c=data.characters[id];if(!c){c={id,name:clean(config.name||'Player',24),kind:config.type==='human'?'human':'bot',aliases:[],backend:{type:config.type,model:clean(config.model)},profile:{},enabled:config.type!=='human',epoch:0,stats:{games:0,gold:0,silver:0,bronze:0},lessons:[],moments:[],recent:[],encounters:{},lastReflection:null};data.characters[id]=c;}
 c.name=clean(config.name||c.name,24);if(typeof config.learningEnabled==='boolean')c.enabled=config.learningEnabled&&c.kind!=='human';c.backend={type:config.type||c.backend.type,model:clean(config.model)};
 if(config.piece!==undefined&&config.color!==undefined)c.appearanceSaved=true;
 c.aliases=[...new Set([...c.aliases,key])].slice(-12);
 for(const k of ['personality','voice','chattiness','customVoice','piece','color','effort'])if(config[k]!==undefined)c.profile[k]=clean(config[k],k==='customVoice'?180:32);
 return c;
}
function bind(data,players,{legacy=false,preserveProfiles=false}={}){
 const used=new Set();return players.map((p,i)=>{let id=p.characterId;if(id&&!data.characters[id]&&!legacy)throw Error('Character not found. Reopen setup.');if(!id&&!p.newCharacter){const key=T.identity(p,{name:p.name,bot:p.type!=='human'}).key;id=legacyId(key);if(used.has(id))id=legacyId(key+'#'+i);}
  if(id&&used.has(id))throw Error('Choose a different character for each seat.');let c=preserveProfiles&&id&&data.characters[id];if(c){for(const k of ['piece','color','effort'])if(c.profile[k]===undefined&&p[k]!==undefined)c.profile[k]=p[k];}else c=character(data,{...p,...(!id?{newCharacter:true}:{})},{id});used.add(c.id);return{...p,characterId:c.id};});
}
const bytes=s=>typeof TextEncoder!=='undefined'?new TextEncoder().encode(typeof s==='string'?s:JSON.stringify(s)).length:Buffer.byteLength(typeof s==='string'?s:JSON.stringify(s),'utf8');
function trimPacket(p,budget){for(const k of ['moments','privateLessons','rivalries'])while(bytes(p)>budget&&p[k]?.length)p[k].pop();while(bytes(p)>budget&&p.players?.length)p.players.pop();if(bytes(p)>budget)return{historical:true};return p;}
function packet(data,players,seat,{chat=false,phase='roll',offer=false,actions=[],language='en',boardId='lantern-harbor',rules={}}={}){
 const own=data.characters[players[seat]?.characterId],enabled=own?.enabled,ids=new Set(players.map(p=>p.characterId));
 const result={historical:true,careerBasis:'character across models',players:players.map((p,i)=>{const c=data.characters[p.characterId];return{seat:i,name:clean(p.name,24),games:c?.stats.games||0,podium:[c?.stats.gold||0,c?.stats.silver||0,c?.stats.bronze||0]};}),rivalries:[],moments:[]};
 if(own){for(let i=0;i<players.length;i++){const r=own.encounters[players[i].characterId];if(i!==seat&&r)result.rivalries.push({seat:i,games:r.games,ahead:r.ahead,behind:r.behind});}
  result.moments=own.moments.filter(m=>!m.opponent||ids.has(m.opponent)).slice(0,chat?1:2).map(m=>({match:m.matchId,board:m.boardId,kind:m.kind,round:m.round,...(m.opponent?{opponentSeat:players.findIndex(p=>p.characterId===m.opponent)}:{}),...(m.amount!==undefined?{amount:m.amount,currency:M.Boards.currency(m.boardId||'lantern-harbor')}:{}),...(m.place?{place:m.place}:{})}));
  if(!chat&&enabled){const tags=new Set(['liquidity']);if(offer||actions.some(a=>a.trade))tags.add('trade');if(phase==='auction')tags.add('auction');if(actions.some(a=>/^(build|project)/.test(a.id)))tags.add('building');if(actions.some(a=>/mortgage/.test(a.id)))tags.add('finance');result.privateLessons=own.lessons.filter(l=>(l.pinned||own.stats.games-l.lastGame<=10)&&tags.has(LESSONS[l.key]?.tag)).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.support-a.support||b.lastGame-a.lastGame).slice(0,3).map(l=>({tag:LESSONS[l.key].tag,lesson:language==='fi'?LESSONS[l.key].fi:LESSONS[l.key].text,...(l.personal&&l.personal.language===language&&l.personal.boardId===boardId&&l.personal.rulesKey===JSON.stringify(rules)?{personalLesson:l.personal.text}:{}),evidenceGames:l.support,confidence:l.support>1?'repeated':'tentative'}));}
 }
 return trimPacket(result,chat?LIMITS.chatBytes:LIMITS.packetBytes);
}
function addEvidence(trace,seat,e){trace.rows??={};const rows=trace.rows[seat]??=[];if(rows.some(r=>r.id===e.id))return;rows.push(e);rows.sort((a,b)=>b.priority-a.priority||b.revision-a.revision);trace.rows[seat]=rows.slice(0,LIMITS.evidence);}
function observe(trace,before,g,events,seat,action,revision,risk){
 const s=g.s,base={round:s.round,revision,boardId:s.boardId||'lantern-harbor'},put=(id,kind,key,details,priority=2)=>addEvidence(trace,id,{...base,id:'r'+revision+':'+kind+':'+id,kind,key,details,priority});
 if(before.players[seat]&&s.players[seat]&&/^(?:build|project|buy|cap:)/.test(action.id)&&risk&&s.players[seat].cash<risk.worstNextRollCost&&s.players[seat].cash<before.players[seat].cash)put(seat,'investment-exposure','reserve',{cashAfter:s.players[seat].cash,worstNextRollCost:risk.worstNextRollCost,approximate:true},4);
 trace.finance??={};for(const b of g.board.filter(b=>b.price)){const a=before.props[b.id],p=s.props[b.id];if(a.owner===p.owner&&p.owner!==null&&a.mortgaged!==p.mortgaged){const k=p.owner+':'+b.id,old=trace.finance[k];if(old&&old.round===s.round&&old.mortgaged!==p.mortgaged)put(p.owner,'mortgage-reversal','finance',{property:b.id,interest:Math.ceil(b.price/20),intentUnknown:true},3);trace.finance[k]={round:s.round,mortgaged:p.mortgaged};}}
 for(const e of events||[]){if(e.presentationOnly)continue;
  if(e.type==='trade')for(const id of [e.from,e.to]){const other=id===e.from?e.to:e.from,groups=g.board.filter(b=>b.workshop).map(b=>b.group);const completed=[...new Set(groups)].filter(group=>{const bs=g.board.filter(b=>b.group===group);return!bs.every(b=>before.props[b.id].owner===other)&&bs.every(b=>s.props[b.id].owner===other);});if(completed.length)put(id,'rival-set-trade','trade',{opponent:other,groups:completed},5);}
  if(e.type==='money'&&e.kind==='purchase'&&/Auction:/.test(e.reason||'')&&before.auction){const b=g.board[before.auction.id];for(const change of e.changes||[])if(change.amount<0&&-change.amount>b.price)put(change.player,'auction-premium','auction',{property:b.id,paid:-change.amount,printedPrice:b.price},2);}
  if(e.type==='money'&&e.kind==='rent'){for(const change of e.changes||[])if(change.amount<0)put(change.player,'rent-paid',null,{amount:-change.amount,to:e.changes.find(c=>c.amount>0)?.player??null},Math.min(4,Math.floor(-change.amount/300)));}
 }
}
function sanitizeEvidence(e,seat){
 const kinds={'investment-exposure':'reserve','mortgage-reversal':'finance','rival-set-trade':'trade','auction-premium':'auction','rent-paid':null,'undeveloped-set':'development','match-statistics':null};
 if(!e||!Object.hasOwn(kinds,e.kind)||!Number.isSafeInteger(e.revision)||e.revision<0||!Number.isSafeInteger(e.round)||e.round<1)return null;
 const details={};for(const key of ['cashAfter','worstNextRollCost','property','interest','opponent','amount','to','paid','printedPrice','cash','rentPaid','rentReceived','buildingSpend','trades'])if(Number.isFinite(e.details?.[key])&&e.details[key]>=0&&e.details[key]<=1e9)details[key]=e.details[key];
 for(const key of ['approximate','intentUnknown','opportunityNotProven'])if(e.details?.[key]===true)details[key]=true;
 if(Array.isArray(e.details?.groups))details.groups=e.details.groups.filter(g=>Object.hasOwn(M.GROUPS,g)).slice(0,8);
 if(['complete','partial'].includes(e.details?.coverage))details.coverage=e.details.coverage;
 return{id:(e.id?.startsWith('final:')?'final':'r'+e.revision)+':'+e.kind+':'+seat,kind:e.kind,key:kinds[e.kind],round:e.round,revision:e.revision,boardId:Object.hasOwn(M.Boards.EDITIONS,e.boardId)?e.boardId:'lantern-harbor',details,priority:Math.max(0,Math.min(5,Number(e.priority)||0))};
}
function normalizeTrace(raw={}){const out={version:1,rows:{},finance:{}};for(let i=0;i<4;i++)out.rows[i]=(Array.isArray(raw.rows?.[i])?raw.rows[i]:[]).map(e=>sanitizeEvidence(e,i)).filter(Boolean).slice(0,LIMITS.evidence);for(const [key,e]of Object.entries(raw.finance||{}).slice(0,160))if(/^[0-3]:[0-9]{1,2}$/.test(key)&&Number.isSafeInteger(e?.round)&&e.round>0&&typeof e.mortgaged==='boolean')out.finance[key]={round:e.round,mortgaged:e.mortgaged};return out;}
function finishEvidence(saved,seat){const s=saved.game,rows=normalizeTrace(saved.memoryTrace).rows[seat],stats=saved.matchHistory?.seats?.[seat],own=s.players[seat];
 const put=(kind,key,details,priority)=>rows.push({id:'final:'+kind+':'+seat,kind,key,details,priority,round:s.round,revision:saved.revision,boardId:s.boardId||'lantern-harbor'});
 const board=M.boardFor(s),undeveloped=[...new Set(board.filter(b=>b.workshop).map(b=>b.group))].filter(group=>board.filter(b=>b.group===group).every(b=>s.props[b.id].owner===seat&&!s.props[b.id].mortgaged&&s.props[b.id].level===0));
 if(undeveloped.length&&own.cash>=600)put('undeveloped-set','development',{groups:undeveloped,cash:own.cash,opportunityNotProven:true},3);
 if(stats)put('match-statistics',null,{rentPaid:stats.rentPaid,rentReceived:stats.rentReceived,buildingSpend:stats.buildingSpend,trades:stats.trades,coverage:saved.matchHistory.coverage?.complete?'complete':'partial'},1);
 return rows.sort((a,b)=>b.priority-a.priority||b.revision-a.revision).slice(0,LIMITS.evidence);
}
function record(data,saved,summary,{backfill=false}={}){
 if(!summary||data.processed.includes(summary.id))return false;
 const configs=saved?.options?.players;let bound,ids;if(configs){bound=bind(data,configs.map(({learningEnabled,newCharacter,...p})=>p),{legacy:true,preserveProfiles:true});ids=new Map(bound.map((p,i)=>[i,p.characterId]));}else{bound=[];ids=new Map();for(const e of summary.entries){const id=e.characterId||legacyId(T.identity(e,{name:e.name,bot:e.type!=='human'}).key),c=data.characters[id]||character(data,e,{id});bound[e.seat]={...e,characterId:c.id};ids.set(e.seat,c.id);}}
 for(const entry of summary.entries){const c=data.characters[ids.get(entry.seat)];if(!c)continue;c.stats.games++;if(entry.place&&entry.place<=3)c.stats[['gold','silver','bronze'][entry.place-1]]++;c.recent.unshift({matchId:summary.id,boardId:summary.boardId||'lantern-harbor',place:entry.place,round:summary.round||null});c.recent=c.recent.slice(0,LIMITS.recent);
  for(const other of summary.entries.filter(e=>e.seat!==entry.seat)){const id=ids.get(other.seat);if(!id)continue;const r=c.encounters[id]??={games:0,ahead:0,behind:0,lastMatch:null};r.games++;if(entry.place&&other.place){r.ahead+=Number(entry.place<other.place);r.behind+=Number(entry.place>other.place);}r.lastMatch=summary.id;}
  c.moments.unshift({kind:'finish',matchId:summary.id,boardId:summary.boardId||'lantern-harbor',round:summary.round||null,place:entry.place});c.moments=c.moments.slice(0,LIMITS.moments);
  if(saved?.matchHistory?.biggestRent){const rent=saved.matchHistory.biggestRent;if(rent.from===entry.seat||rent.to===entry.seat){c.moments.unshift({kind:rent.from===entry.seat?'paid-rent':'received-rent',matchId:summary.id,boardId:summary.boardId||'lantern-harbor',round:rent.round,amount:rent.amount,opponent:ids.get(rent.from===entry.seat?rent.to:rent.from)});c.moments=c.moments.slice(0,LIMITS.moments);}}
  if(!backfill&&c.enabled&&['ollama','codex','claude','openrouter','openai','gemini','deepseek','groq','lmstudio','compatible'].includes(bound[entry.seat]?.type)){const p=bound[entry.seat],evidence=finishEvidence(saved,entry.seat);data.jobs.push({id:summary.id+':'+c.id,matchId:summary.id,characterId:c.id,seat:entry.seat,type:p.type,model:p.model,language:saved.game.language||'en',boardId:saved.game.boardId||'lantern-harbor',rules:copy(saved.game.rules),place:entry.place,round:summary.round,evidence,ownDecisions:(saved.decisions||[]).filter(d=>d.seat===entry.seat&&evidence.some(e=>e.round===d.round)).slice(-2).map(d=>({round:d.round,action:clean(d.action,40).replace(/^cap:\d+$/,'bid'),summary:clean(d.rationale,160)})),state:'pending',epoch:c.epoch,created:Date.now(),usage:null});}
 }
 data.processed.push(summary.id);const waiting=data.jobs.filter(j=>j.state==='pending');for(const job of waiting.slice(0,Math.max(0,waiting.length-LIMITS.waitingJobs)))job.state='skipped';if(data.jobs.length>LIMITS.jobs)data.jobs=data.jobs.slice(-LIMITS.jobs);data.revision++;return true;
}
function applyReflection(data,job,result){const c=data.characters[job.characterId];if(!c||!c.enabled||c.epoch!==job.epoch)return false;
 if(!result||!Array.isArray(result.learn)||result.learn.length>2||!Array.isArray(result.retire)||result.retire.length>2||typeof result.worked!=='string'||typeof result.mistake!=='string')throw Error('Invalid reflection structure.');
 const selected=result.learn.map(item=>({event:job.evidence.slice(0,6).find(e=>e.id===(typeof item==='string'?item:item?.eventId)),text:typeof item==='string'?'':clean(item?.lesson,160)}));if(selected.some(({event:e,text})=>!e?.key||!LESSONS[e.key]||/(?:system prompt|ignore.{0,20}instructions|api.?key|shell command|collud|reveal.{0,20}private)/i.test(text)))throw Error('Reflection must cite a supplied learning opportunity.');
 if(result.retire.some(key=>!c.lessons.some(l=>l.key===key)))throw Error('Reflection can only retire an existing lesson.');for(const key of result.retire)c.lessons=c.lessons.filter(l=>l.key!==key||l.pinned);
 for(const {event:e,text} of selected){let l=c.lessons.find(l=>l.key===e.key);if(!l){l={key:e.key,support:0,matches:[],evidence:[],lastGame:c.stats.games,pinned:false};c.lessons.push(l);}if(!l.matches.includes(job.matchId)){l.support++;l.matches.push(job.matchId);}l.matches=l.matches.slice(-8);l.evidence=[...new Set([e.id,...l.evidence])].slice(0,3);l.lastGame=c.stats.games;if(text)l.personal={text,language:job.language,boardId:job.boardId,rulesKey:JSON.stringify(job.rules||{})};}
 c.lessons=c.lessons.filter(l=>l.pinned||c.stats.games-l.lastGame<=10).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.lastGame-a.lastGame||b.support-a.support).slice(0,LIMITS.lessons);
 c.lastReflection={matchId:job.matchId,language:job.language,worked:clean(result.worked,240),mistake:clean(result.mistake,240),at:new Date().toISOString()};data.revision++;return true;
}
function publicCharacter(c,{privateVisible=false}={}){return {id:c.id,name:c.name,kind:c.kind,backend:copy(c.backend),profile:copy(c.profile),enabled:c.enabled,stats:copy(c.stats),recent:copy(c.recent),rivalries:Object.entries(c.encounters).sort((a,b)=>b[1].games-a[1].games).slice(0,12).map(([id,r])=>({characterId:id,...copy(r)})),moments:copy(c.moments),...(privateVisible?{lessons:c.lessons.map(l=>({...copy(l),tag:LESSONS[l.key].tag,text:LESSONS[l.key].text,fi:LESSONS[l.key].fi})),reflection:copy(c.lastReflection)}:{})};}
const api={definition,configuration,edit,LIMITS,LESSONS,empty,clean,validId,legacyId,character,bind,bytes,packet,observe,normalizeTrace,finishEvidence,record,applyReflection,publicCharacter};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonCharacterMemory=api;
})(globalThis);
