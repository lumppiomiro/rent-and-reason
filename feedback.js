/* Local presentation helpers, a bundled dice recording, and soft synthesized cues. */
(function(root){
'use strict';
const MAX_MASTER_GAIN=0.45;
// The build embeds assets/audio/dice-roll.mp3 so file:// and shared games stay offline.
const DICE_SAMPLE_BASE64=/* DICE_SAMPLE */'';
const SOUNDS={dice:'Dice roll',step:'Piece movement',moneyIn:'Receiving money',moneyOut:'Paying money',transfer:'Money transfer',bankrupt:'Bankruptcy',card:'Drawing cards',jail:'Going to Permit Review',purchase:'Buying property',build:'Building a workshop or landmark',set:'Completing a colour set',trade:'Completing a trade',auctionOpen:'Auction opening',auctionBid:'Auction bid',auctionWin:'Auction won',finish:'Game finished',turn:'Your turn',message:'Direct messages',offer:'Trade offers',connection:'Connection restored',error:'Connection or action problem'};
const CHANNELS={effects:'Game effects',notifications:'Notifications',ambience:'Clubhouse ambience',music:'Game music'};
const MUSIC={title:'After Hours at the Table',bpm:78,bars:16};
// Original, offline lounge composition: warm electric keys, round bass and brushes.
// Render once when enabled; circular tails make the musical loop continuous.
function createMusicBuffer(ctx,{sampleRate=22050}={}){
 const beat=60/MUSIC.bpm,duration=MUSIC.bars*4*beat,length=Math.round(duration*sampleRate),buffer=ctx.createBuffer(2,length,sampleRate),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
 const chords=[[60,64,67,71,74],[57,60,64,67,71],[53,57,60,64,67],[55,59,64,65,69],[52,55,59,62,67],[57,61,64,67,71],[50,53,57,60,64],[55,59,62,65,69],[60,64,67,71,74],[52,55,59,62,67],[53,57,60,64,67],[53,56,60,62,67],[60,64,67,71,74],[57,61,64,67,71],[50,53,57,60,64],[55,59,62,65,69]];
 const roots=[36,33,29,31,28,33,26,31,36,28,29,29,36,33,26,31];
 let seed=73021;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 function tone(at,midi,seconds,level,pan=0,bass=false){const start=Math.round(at*sampleRate),count=Math.round(seconds*sampleRate),omega=2*Math.PI*440*Math.pow(2,(midi-69)/12)/sampleRate,decay=Math.exp(-1/(sampleRate*(bass?.38:1.05))),attack=sampleRate*(bass?.012:.025),l=Math.sqrt((1-pan)/2),r=Math.sqrt((1+pan)/2);let envelope=level;
  for(let i=0;i<count;i++){const phase=omega*i,body=bass?Math.sin(phase)+.2*Math.sin(phase*2):Math.sin(phase)+.23*Math.sin(phase*2.003)+.055*Math.sin(phase*3.997),end=Math.min(1,(count-i)/(sampleRate*.12)),sample=body*envelope*Math.min(1,i/attack)*end,index=(start+i)%length;left[index]+=sample*l;right[index]+=sample*r;envelope*=decay;}
 }
 function brush(at,level,pan){const start=Math.round(at*sampleRate),count=Math.round(sampleRate*.13);let previous=0;for(let i=0;i<count;i++){const noise=random()*2-1,sample=(noise-previous)*Math.exp(-i/(sampleRate*.025))*level*Math.min(1,i/(sampleRate*.004)),index=(start+i)%length;previous=noise;left[index]+=sample*(1-pan)*.5;right[index]+=sample*(1+pan)*.5;}}
 const melody=[[76,79],[74,71],[72,76],[74,71],[71,67],[73,76],[69,72],[71,74]];
 for(let bar=0;bar<MUSIC.bars;bar++){const start=bar*4*beat,chord=chords[bar];chord.forEach((note,i)=>tone(start+i*.018,note,3.8,.105+(i===0?.015:0),-.22));
  // Leave space between phrases; the second half changes the chord colours.
  if(bar%2===1)chord.slice(1,4).forEach((note,i)=>tone(start+beat*2.55+i*.02,note,2.6,.045,-.12));
  tone(start+.012,roots[bar],1.35,.22,0,true);tone(start+beat*2.06,roots[bar]+(bar%2?7:12),1.05,.14,0,true);
  for(const step of [1,2.5,3])brush(start+beat*step,.012,step===1?-.35:.35);
  if(bar%2===0){const phrase=melody[bar/2];tone(start+beat*1.6,phrase[0],1.6,.065,.27);tone(start+beat*2.75,phrase[1],1.8,.052,.2);}
 }
 let peak=0;for(let i=0;i<length;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));const scale=peak ? .65/peak : 1;
 for(let i=0;i<length;i++){left[i]*=scale;right[i]*=scale;}return buffer;
}
const NOTIFICATIONS=new Set(['turn','message','offer','connection','error']);
const COOLDOWNS={step:.13,card:.15,auctionBid:.2,turn:1,message:1,offer:1,error:3,connection:2};
const paper=(at=0,level=.14,duration=.11)=>({noise:true,filter:'bandpass',frequency:1800,at,level,duration,attack:.025});
const tap=(at=0,level=.2,frequency=380)=>({frequency,end:frequency*.65,at,level,duration:.075,type:'sine'});
const PATTERNS={
 dice:Array.from({length:12},(_,i)=>[{noise:true,at:i*.055,duration:.065,level:.4,frequency:1800+i%3*450,noiseAmplitude:.9},{at:i*.055+.012,frequency:1100-i%4*120,end:480,duration:.028,level:.3,type:'triangle'}]).flat(),
 step:[tap(0,.23,290),{noise:true,frequency:800,duration:.045,level:.15},{frequency:620,duration:.04,level:.055}],
 moneyIn:[paper(0,.13),{frequency:2370,at:.045,duration:.24,level:.24},{frequency:3520,at:.08,duration:.19,level:.12},{frequency:4660,at:.047,duration:.13,level:.06}],
 moneyOut:[paper(0,.19,.14),tap(.08,.19,460),{noise:true,frequency:3200,at:.12,duration:.05,level:.09}],
 transfer:[paper(0,.14),tap(.07,.19,520),{frequency:2370,at:.12,duration:.22,level:.16}],
 bankrupt:[{noise:true,frequency:550,duration:.09,level:.4},{frequency:110,end:65,duration:.2,level:.36,type:'triangle'},{noise:true,frequency:450,at:.23,duration:.09,level:.32},{frequency:349,at:.42,duration:.32,level:.32,type:'triangle'},{frequency:277,at:.72,duration:.36,level:.3,type:'triangle'},{frequency:175,end:131,at:1.04,duration:.66,level:.29,type:'triangle'}],
 card:[paper(0,.19,.16),paper(.07,.11,.1),tap(.17,.09,620)],
 jail:[{noise:true,frequency:600,duration:.075,level:.3},{frequency:175,end:110,at:.025,duration:.26,level:.32,type:'triangle'},{frequency:287,at:.04,duration:.4,level:.18},{frequency:430,at:.045,duration:.33,level:.12}],
 purchase:[paper(0,.15),tap(.1,.28,330),tap(.14,.12,660)],
 build:[tap(0,.26,430),tap(.085,.18,560),{noise:true,frequency:900,at:.09,duration:.045,level:.1}],
 set:[{frequency:523,level:.19,duration:.32},{frequency:659,at:.13,level:.18,duration:.34},{frequency:784,at:.26,level:.17,duration:.5}],
 trade:[paper(),paper(.1,.1),tap(.22,.24,430),{frequency:1174,at:.24,level:.12,duration:.28}],
 auctionOpen:[tap(0,.25,310),tap(.15,.19,310)],
 auctionBid:[tap(0,.2,720)],
 auctionWin:[tap(0,.32,250),{noise:true,frequency:1000,duration:.06,level:.18},{frequency:880,at:.11,level:.15,duration:.35}],
 finish:[{frequency:523,level:.18,duration:.55},{frequency:659,at:.16,level:.16,duration:.6},{frequency:784,at:.32,level:.15,duration:.65},{frequency:1046,at:.5,level:.14,duration:.85}],
 turn:[{frequency:660,level:.16,duration:.16},{frequency:880,at:.12,level:.13,duration:.23}],
 message:[{frequency:1174,level:.12,duration:.14},{frequency:1397,at:.1,level:.09,duration:.2}],
 offer:[paper(0,.1),{frequency:784,at:.09,level:.14,duration:.2},{frequency:988,at:.23,level:.12,duration:.24}],
 connection:[{frequency:440,level:.12,duration:.15},{frequency:660,at:.13,level:.11,duration:.23}],
 error:[{frequency:330,level:.15,duration:.18},{frequency:277,at:.16,level:.12,duration:.25}]
};
// Public-state transitions only: opening a save or repainting the UI never replays cues.
function moneyCue(event,seat=0){if(['trade','bankruptcy'].includes(event.kind))return null;if(event.kind==='purchase')return /^Auction:/.test(event.reason||'')?'auctionWin':'purchase';if(event.kind==='building')return 'build';const own=event.changes.find(c=>c.player===seat&&c.amount);if(own)return own.amount>0?'moneyIn':'moneyOut';const loss=event.changes.some(c=>c.amount<0),gain=event.changes.some(c=>c.amount>0);return loss&&gain?'transfer':gain?'moneyIn':loss?'moneyOut':null;}
function actionCues(before,after,events=[],seat=0,board=[]){
 if(before.phase!=='over'&&after.phase==='over')return ['finish'];
 const cues=[],a=after.auction,b=before.auction;
 if(a&&(!b||a.id!==b.id))cues.push('auctionOpen');else if(a&&b&&a.bid>b.bid)cues.push('auctionBid');
 const groups=[...new Set(board.filter(p=>p.workshop).map(p=>p.group))];
 if(!events.some(e=>e.type==='bankrupt')&&groups.some(group=>{const ids=board.filter(p=>p.group===group).map(p=>p.id),owner=after.props[ids[0]]?.owner;return owner!==null&&owner!==undefined&&ids.every(id=>after.props[id].owner===owner)&&!ids.every(id=>before.props[id].owner===owner);}))cues.push('set');
 const actor=s=>s.phase==='auction'?s.auction?.cursor:s.phase==='debt'?s.debt?.from:s.turn;
 if(Number.isInteger(seat)&&!after.players[seat]?.bot&&actor(after)===seat&&(actor(before)!==seat||(before.phase!=='debt'&&after.phase==='debt')))cues.push('turn');
 return [...new Set(cues)];
}
function notificationCues(previous,next,seat){
 if(!previous||previous.id!==next.id||!Number.isInteger(seat)||next.spectator)return [];
 if(next.error&&next.error!==previous.error)return ['error'];
 if(next.offer?.to===seat&&next.offer.id!==previous.offer?.id)return ['offer'];
 const old=new Set((previous.chat||[]).map(c=>c.id)),chat=next.chat||[];
 return chat.some(c=>!old.has(c.id)&&c.seat!==seat&&(c.targets?.includes(seat)||(c.replyTo&&chat.find(p=>p.id===c.replyTo)?.seat===seat)))?['message']:[];
}
function withBankruptcies(before,after,events=[]){
 const seen=new Set(events.filter(e=>e.type==='bankrupt').map(e=>e.player));
 return [...events,...after.players.filter(p=>p.out&&before.players[p.id]&&!before.players[p.id].out&&!seen.has(p.id)).map(p=>({type:'bankrupt',player:p.id}))];
}
function batches(events){
 const out=[];
 for(const event of events){const prev=out.at(-1);
  if(event.type==='money'&&prev?.type==='money'&&event.kind&&event.kind===prev.kind&&['building','selling','mortgage','bankruptcy'].includes(event.kind)){
   const merged=new Map(prev.changes.map(c=>[c.player,{...c}]));for(const c of event.changes){const existing=merged.get(c.player);merged.set(c.player,{...c,amount:c.amount+(existing?.amount||0)});}prev.changes=[...merged.values()].filter(c=>c.amount!==0);prev.count=(prev.count||1)+1;prev.reason={building:'Building purchases',selling:'Selling buildings',mortgage:'Mortgage transactions',bankruptcy:'Bankruptcy settlement'}[event.kind];
  }else out.push(event.type==='money'?{...event,changes:event.changes.map(c=>({...c}))}:{...event});
 }
 return out;
}
class SoftAudio{
 constructor({enabled=true,volume=.25,levels={},AudioContext:Context,diceSample=DICE_SAMPLE_BASE64,channels={},musicVolume=.35,random=Math.random}={}){this.enabled=enabled;this.volume=Math.max(0,Math.min(1,Number(volume)||0));this.levels=Object.fromEntries(Object.keys(SOUNDS).map(k=>[k,levels[k]===undefined?1:Math.max(0,Math.min(2,Number(levels[k])||0))]));this.Context=Context||root.AudioContext||root.webkitAudioContext;this.context=null;this.master=null;this.voices=new Set();this.supported=Boolean(this.Context);this.diceSample=diceSample;this.diceBuffer=null;this.diceReady=null;this.stopVersion=0;this.channels={effects:1,notifications:1,ambience:0,music:0};for(const key of Object.keys(this.channels))if(channels[key]!==undefined)this.channels[key]=Math.max(0,Math.min(1,Number(channels[key])||0));this.buses={};this.random=random;this.recent=new Map();this.active=true;this.ambienceSource=null;this.duckUntil=0;this.musicBuffer=null;this.musicSource=null;this.musicVoices=new Set();this.musicOffset=0;this.musicStartedAt=0;this.musicVolume=Math.max(.05,Math.min(1,Number(musicVolume)||.35));if(this.channels.music)this.musicVolume=this.channels.music;}
 unlock(){if(!this.enabled||!this.supported)return Promise.resolve(false);try{if(!this.context){this.context=new this.Context();this.master=this.context.createGain();this.master.gain.value=this.volume*MAX_MASTER_GAIN;this.master.connect(this.context.destination);for(const name of Object.keys(CHANNELS)){const gain=this.context.createGain();gain.gain.value=this.channels[name];gain.connect(this.master);this.buses[name]=gain;}}const ready=this.context.state==='suspended'?this.context.resume():Promise.resolve();return ready.then(()=>this.loadDice()).then(()=>{this.startAmbience();this.startMusic();return true;}).catch(()=>false);}catch{this.supported=false;return Promise.resolve(false);}}
 loadDice(){if(!this.diceReady)this.diceReady=Promise.resolve().then(()=>{if(!this.diceSample)return null;const bytes=Uint8Array.from(root.atob(this.diceSample),c=>c.charCodeAt(0));return this.context.decodeAudioData(bytes.buffer);}).then(buffer=>{this.diceBuffer=buffer;}).catch(()=>{this.diceSample='';});return this.diceReady;}
 setEnabled(value){this.enabled=Boolean(value);if(!this.enabled)this.stop();this.applyVolume();if(this.enabled){this.startAmbience();this.startMusic();}}
 setActive(value){this.active=Boolean(value);if(!this.active)this.stop();else{this.startAmbience();this.startMusic();}}
 setChannel(name,value){if(!Object.hasOwn(CHANNELS,name))return;this.channels[name]=Math.max(0,Math.min(1,Number(value)||0));if(this.buses[name]){this.buses[name].gain.cancelScheduledValues?.(this.context.currentTime);this.buses[name].gain.setTargetAtTime(this.channels[name],this.context.currentTime,.04);}if(name==='ambience'){if(!this.channels.ambience)this.stopAmbience();else this.startAmbience();}if(name==='music'){if(!this.channels.music)this.stopMusic(true);else{this.musicVolume=this.channels.music;this.startMusic();}}}
 startAmbience(){if(this.ambienceSource||!this.enabled||!this.active||!this.volume||!this.channels.ambience||this.context?.state!=='running')return;const ctx=this.context,source=ctx.createBufferSource(),gain=ctx.createGain(),filter=ctx.createBiquadFilter(),buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*8),ctx.sampleRate),data=buffer.getChannelData(0);let low=0;for(let i=0;i<data.length;i++){low=(low+.025*(this.random()*2-1))/1.025;data[i]=low*3;}const edge=Math.min(Math.floor(ctx.sampleRate*.05),Math.floor(data.length/2));for(let i=0;i<edge;i++){data[i]*=i/edge;data[data.length-1-i]*=i/edge;}this.duckUntil=ctx.currentTime;this.buses.ambience.gain.cancelScheduledValues?.(ctx.currentTime);this.buses.ambience.gain.setTargetAtTime(this.channels.ambience,ctx.currentTime,.1);source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=420;source.connect(filter);filter.connect(gain);gain.connect(this.buses.ambience);gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(.12,ctx.currentTime+1.5);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start();this.ambienceSource=source;}
 stopAmbience(){if(this.ambienceSource){try{this.ambienceSource.stop();}catch{}this.ambienceSource=null;}}
 startMusic(){
  if(this.musicSource||!this.enabled||!this.active||!this.volume||!this.channels.music||this.context?.state!=='running')return;
  const ctx=this.context;this.musicBuffer=this.musicBuffer||createMusicBuffer(ctx);
  const source=ctx.createBufferSource(),gain=ctx.createGain(),now=ctx.currentTime;source.buffer=this.musicBuffer;source.loop=true;source.connect(gain);gain.connect(this.buses.music);
  this.buses.music.gain.cancelScheduledValues?.(now);this.buses.music.gain.setTargetAtTime(this.channels.music,now,.1);gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.8,now+1.5);
  this.musicVoices.add(source);source.onended=()=>{this.musicVoices.delete(source);source.disconnect();gain.disconnect();};source.start(now,this.musicOffset);this.musicStartedAt=now;this.musicSource=source;this.musicGain=gain;
 }
 stopMusic(fade=false){if(this.musicSource){const now=this.context.currentTime;this.musicOffset=(this.musicOffset+Math.max(0,now-this.musicStartedAt))%this.musicBuffer.duration;if(fade){this.musicGain.gain.cancelAndHoldAtTime?.(now);this.musicGain.gain.cancelScheduledValues?.(now);this.musicGain.gain.setTargetAtTime(0,now,.025);}try{this.musicSource.stop(fade?now+.12:now);}catch{}this.musicSource=null;this.musicGain=null;}if(!fade){for(const source of this.musicVoices){try{source.stop(this.context.currentTime);}catch{}}this.musicVoices.clear();}}
 duckBackground(duration){if(!this.ambienceSource&&!this.musicSource)return;const now=this.context.currentTime;this.duckUntil=Math.max(this.duckUntil,now+duration);for(const [name,source,factor]of [['ambience',this.ambienceSource,.25],['music',this.musicSource,.45]]){if(!source)continue;const gain=this.buses[name].gain;gain.cancelScheduledValues?.(now);gain.setTargetAtTime(this.channels[name]*factor,now,.06);gain.setTargetAtTime(this.channels[name],this.duckUntil,.55);}}
 setVolume(value){this.volume=Math.max(0,Math.min(1,Number(value)||0));this.applyVolume();if(!this.volume){this.stopAmbience();this.stopMusic();}else{this.startAmbience();this.startMusic();}}
 setLevel(name,value){if(Object.hasOwn(SOUNDS,name))this.levels[name]=Math.max(0,Math.min(2,Number(value)||0));}
 applyVolume(){if(!this.master)return;const gain=this.enabled?this.volume*MAX_MASTER_GAIN:0;this.master.gain.setTargetAtTime(gain,this.context.currentTime,.025);}
 stop(){this.stopVersion++;this.stopAmbience();this.stopMusic();this.recent.clear();for(const node of this.voices){try{node.stop();}catch{}}this.voices.clear();}
 playDice(start){const ctx=this.context,source=ctx.createBufferSource(),gain=ctx.createGain(),duration=this.diceBuffer.duration;source.buffer=this.diceBuffer;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(this.levels.dice,start+.004);gain.gain.setValueAtTime(this.levels.dice,start+Math.max(.004,duration-.012));gain.gain.linearRampToValueAtTime(0,start+duration);source.connect(gain);gain.connect(this.buses.effects);this.duckBackground(duration);source.cue='dice';this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();};source.start(start);source.stop(start+duration);}
 play(name,offset=0){if(!this.enabled||!this.active||!this.volume||!this.context||!this.supported||!this.levels[name])return;const channel=NOTIFICATIONS.has(name)?'notifications':'effects';if(!this.channels[channel])return;
  if(name==='dice'&&this.diceSample){if(this.diceBuffer){this.playDice(this.context.currentTime+.015+offset);return;}const version=this.stopVersion,requestedAt=this.context.currentTime+offset;void this.loadDice().then(()=>{if(version===this.stopVersion)this.play(name,Math.max(0,requestedAt-this.context.currentTime));});return;}
  const pattern=PATTERNS[name];if(!pattern)return;const ctx=this.context,start=ctx.currentTime+.015+offset;if(start-(this.recent.get(name)??-Infinity)<(COOLDOWNS[name]||0))return;if(this.voices.size>=48&&!NOTIFICATIONS.has(name))return;this.recent.set(name,start);const cueLevel=this.levels[name]*(name==='step'&&[...this.voices].some(v=>v.cue==='dice')?.45:1);const variation=['step','card','moneyIn','moneyOut','transfer','build','purchase'].includes(name)?.96+this.random()*.08:1;this.duckBackground(offset+Math.max(...pattern.map(n=>(n.at||0)+n.duration)));
  for(const note of pattern){const t=start+(note.at||0),duration=note.duration,gain=ctx.createGain();gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(note.level*cueLevel,t+(note.attack||.008));gain.gain.exponentialRampToValueAtTime(.0001,t+duration);gain.gain.setValueAtTime(0,t+duration+.015);gain.connect(this.buses[channel]);let source,filter;
   if(note.noise){source=ctx.createBufferSource();const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(this.random()*2-1)*(note.noiseAmplitude??.45);source.buffer=buffer;filter=ctx.createBiquadFilter();filter.type=note.filter||'lowpass';filter.frequency.value=note.frequency*variation;source.connect(filter);filter.connect(gain);}
   else{source=ctx.createOscillator();source.type=note.type||'sine';source.frequency.setValueAtTime(note.frequency*variation,t);if(note.end)source.frequency.exponentialRampToValueAtTime(note.end*variation,t+duration);source.connect(gain);}
   source.cue=name;this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();filter?.disconnect();};source.start(t);source.stop(t+duration+.025);
  }
 }
}
const api={SoftAudio,batches,withBankruptcies,MAX_MASTER_GAIN,SOUNDS,CHANNELS,MUSIC,createMusicBuffer,moneyCue,actionCues,notificationCues};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonFeedback=api;
})(globalThis);
