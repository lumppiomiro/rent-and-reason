const {test}=require('node:test');const assert=require('node:assert/strict');
const {Game}=require('../engine.js');const {SoftAudio,batches,withBankruptcies,MAX_MASTER_GAIN,SOUNDS,MUSIC,createMusicBuffer,moneyCue,actionCues,notificationCues}=require('../feedback.js');
function param(value=0){return{value,events:[],setValueAtTime(v,t){this.value=v;this.events.push([v,t]);},linearRampToValueAtTime(v,t){this.events.push([v,t]);},exponentialRampToValueAtTime(v,t){this.events.push([v,t]);},setTargetAtTime(v,t){this.value=v;this.events.push([v,t]);}};}
class FakeAudioContext{
 constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=48000;this.destination={};this.sources=[];this.gains=[];}
 resume(){this.state='running';return Promise.resolve();}
 createGain(){const n={gain:param(),connect(target){this.target=target;},disconnect(){}};this.gains.push(n);return n;}
 source(){const n={frequency:param(),connect(target){this.target=target;},disconnect(){},start(t,offset=0){this.started=t;this.offset=offset;},stop(t){this.stopped=t??0;}};this.sources.push(n);return n;}
 createOscillator(){return this.source();}createBufferSource(){return this.source();}
 createBiquadFilter(){return{frequency:param(),connect(target){this.target=target;},disconnect(){}};}
 createBuffer(channels,length,sampleRate=this.sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return{duration:length/sampleRate,length,sampleRate,numberOfChannels:channels,getChannelData(channel=0){return data[channel];}};}
}
test('sounds start only after unlock, stay capped, and mute cancels voices',async()=>{const a=new SoftAudio({AudioContext:FakeAudioContext});a.play('dice');assert.equal(a.context,null);await a.unlock();assert.equal(a.context.state,'running');assert.equal(a.master.gain.value,.25*MAX_MASTER_GAIN);for(const name of ['dice','step','moneyIn','moneyOut','bankrupt','card','jail'])a.play(name);assert(a.context.sources.length>15);for(const node of a.context.gains.slice(1).filter(n=>n.gain.events.length)){const peak=Math.max(...node.gain.events.map(e=>e[0]));assert(peak<=.5);assert.equal(node.gain.events.at(-1)[0],0);}a.setVolume(50);assert.equal(a.volume,1);assert(a.master.gain.value<=.45);a.setEnabled(false);assert.equal(a.master.gain.value,0);assert.equal(a.voices.size,0);const count=a.context.sources.length;a.play('moneyIn');assert.equal(a.context.sources.length,count);});
test('zero volume and an unsupported audio API leave the game silent',async()=>{const a=new SoftAudio({AudioContext:FakeAudioContext,volume:0});await a.unlock();a.play('bankrupt');assert.equal(a.context.sources.length,0);a.setVolume(-1);assert.equal(a.volume,0);const absent=new SoftAudio();assert.equal(await absent.unlock(),false);assert.doesNotThrow(()=>absent.play('dice'));});
test('per-sound mixer mutes one cue independently and scales previews within the expanded range',async()=>{
 const a=new SoftAudio({AudioContext:FakeAudioContext,levels:{dice:0,moneyIn:1.5}});await a.unlock();a.play('dice');assert.equal(a.context.sources.length,0);a.play('moneyIn');assert.equal(a.context.sources.length,4);assert.ok(a.context.gains.slice(1).some(n=>n.gain.events.some(([v])=>Math.abs(v-.24*1.5)<1e-10)));a.setLevel('dice',10);assert.equal(a.levels.dice,2);a.setLevel('dice',1);const count=a.context.sources.length;a.play('dice');assert.equal(a.context.sources.length-count,24);a.setLevel('step',-1);assert.equal(a.levels.step,0);assert.equal(a.levels.moneyIn,1.5);a.setEnabled(false);assert.equal(a.voices.size,0);
});
test('an optional in-memory dice sample is decoded once and routed through the mixer',async()=>{
 const sample=Buffer.from('synthetic-audio-test-fixture'),buffer={duration:1.254};let decodes=0;
 class SampleContext extends FakeAudioContext{decodeAudioData(bytes){decodes++;assert.deepEqual(Buffer.from(bytes),sample);return Promise.resolve(buffer);}}
 const a=new SoftAudio({AudioContext:SampleContext,diceSample:sample.toString('base64'),levels:{dice:1.5}});
 a.play('dice');assert.equal(a.context,null);await a.unlock();await a.unlock();assert.equal(decodes,1);
 a.play('dice',.2);assert.equal(a.context.sources.length,1);const voice=a.context.sources[0];assert.equal(voice.buffer,buffer);assert.equal(voice.started,.21500000000000002);assert.equal(voice.stopped,voice.started+buffer.duration);
 assert.ok(a.context.gains.at(-1).gain.events.some(([v])=>v===1.5));assert.equal(a.context.gains.at(-1).gain.events.at(-1)[0],0);
 voice.onended();assert.equal(a.voices.size,0);a.setLevel('dice',0);a.play('dice');assert.equal(a.context.sources.length,1);
 a.setLevel('dice',1);a.play('dice');a.setEnabled(false);assert.equal(a.context.sources.at(-1).stopped,0);assert.equal(a.voices.size,0);
});
test('a roll requested during decoding waits for its recording and stop cancels pending playback',async()=>{
 for(const cancel of [false,true]){
  let decode;class DeferredContext extends FakeAudioContext{decodeAudioData(){return new Promise(resolve=>{decode=resolve;});}}
  const a=new SoftAudio({AudioContext:DeferredContext,diceSample:'AQID'}),ready=a.unlock();await Promise.resolve();await Promise.resolve();
  a.play('dice');assert.equal(a.context.sources.length,0);if(cancel)a.stop();decode({duration:1.254});await ready;
  assert.equal(a.context.sources.length,cancel?0:1);if(!cancel)assert.equal(a.context.sources[0].buffer.duration,1.254);
 }
});
test('a decoder failure retains the synthesized fallback and other effects',async()=>{
 class BrokenContext extends FakeAudioContext{decodeAudioData(){return Promise.reject(Error('Unsupported MP3'));}}
 const a=new SoftAudio({AudioContext:BrokenContext,diceSample:'AQID'});assert.equal(await a.unlock(),true);a.play('dice');assert.ok(a.context.sources.length>1);const count=a.context.sources.length;a.play('step');assert.ok(a.context.sources.length>count);assert.ok(a.context.sources.slice(count).every(s=>s.cue==='step'));
});
test('rent emits paired loss and gain amounts and debts emit no premature payment',()=>{const g=new Game({seed:9});g.s.props[39].owner=1;g.player.pos=39;g.player.cash=10;g.events=[];g.land(g.player);assert.equal(g.s.phase,'debt');assert(g.events.some(e=>e.type==='debt'&&e.amount===50));assert(!g.events.some(e=>e.type==='money'));g.player.cash=100;g.events=[];g.settle();assert.deepEqual(g.events[0],{type:'money',changes:[{player:0,amount:-50,balance:50},{player:1,amount:50,balance:1550}],reason:'rent on Lantern Summit',kind:'payment'});});
test('batching combines building purchases without erasing a readable card or its money effect',()=>{const input=[{type:'money',kind:'building',reason:'A',changes:[{player:1,amount:-50,balance:1450}]},{type:'money',kind:'building',reason:'B',changes:[{player:1,amount:-50,balance:1400}]},{type:'card',player:1,deck:'chest',text:'Receive $100.'},{type:'money',kind:'card',reason:'Receive $100.',changes:[{player:1,amount:100,balance:1500}]}],copy=structuredClone(input),result=batches(input);assert.equal(result.length,3);assert.equal(result[0].count,2);assert.deepEqual(result[0].changes,[{player:1,amount:-100,balance:1400}]);assert.equal(result[1].type,'card');assert.equal(result[2].changes[0].amount,100);assert.deepEqual(input,copy);});
test('bankruptcy emits a cue even when there is no cash left to lose',()=>{const g=new Game({seed:20});g.player.cash=0;g.events=[];g.bankrupt(0,1);assert(g.events.some(e=>e.type==='bankrupt'&&e.player===0));assert(!Object.hasOwn(g.s,'events'));});
test('bankruptcy transitions survive missing presentation events without duplicate or replayed eliminations',()=>{
 const g=new Game(),before=structuredClone(g.s);g.bankrupt(3,0);const after=structuredClone(g.s),events=g.events.filter(e=>e.type!=='bankrupt'),copy=JSON.stringify({before,after,events});
 const recovered=withBankruptcies(before,after,events);assert.equal(recovered.filter(e=>e.type==='bankrupt'&&e.player===3).length,1);
 assert.equal(withBankruptcies(before,after,recovered).filter(e=>e.type==='bankrupt').length,1);
 assert.equal(withBankruptcies(after,after,[]).length,0);assert.equal(JSON.stringify({before,after,events}),copy);
});
test('bankruptcy has a distinct extended cue and respects its individual mixer mute',async()=>{
 const a=new SoftAudio({AudioContext:FakeAudioContext});await a.unlock();a.play('bankrupt');const cue=[...a.context.sources];
 assert(cue.some(s=>s.buffer),'gavel impacts are present');assert(cue.some(s=>s.type==='triangle'),'descending chimes are present');assert(Math.max(...cue.map(s=>s.stopped))-Math.min(...cue.map(s=>s.started))>=1.5);
 a.setLevel('bankrupt',0);a.play('bankrupt');assert.equal(a.context.sources.length,cue.length);a.play('moneyOut');assert(a.context.sources.length>cue.length);
});
test('the money ledger reconstructs every balance through complete bot games',()=>{let steps=0;for(let seed=61;seed<69;seed++){const g=new Game({seed,roundLimit:60,rules:{taxesToParking:true,bankruptToBank:seed%2===0,doubleGo:true}});g.s.players.forEach(p=>p.bot=true);let count=0;while(g.s.phase!=='over'&&count++<15000){const cash=g.s.players.map(p=>p.cash);assert(g.botStep());for(const event of g.events)if(event.type==='money')for(const c of event.changes){cash[c.player]+=c.amount;assert.equal(cash[c.player],c.balance);}assert.deepEqual(cash,g.s.players.map(p=>p.cash),`Missing money event, seed ${seed}, step ${count}`);steps++;}assert.equal(g.s.phase,'over');}console.log(`Verified the money ledger across ${steps} bot actions.`);});
test('the whole sound range increases by 25 percent and remains capped and mutable',async()=>{
 assert.equal(MAX_MASTER_GAIN,.45);const a=new SoftAudio({AudioContext:FakeAudioContext});await a.unlock();for(const volume of [0,.25,.5,.75,1]){a.setVolume(volume);assert.ok(Math.abs(a.master.gain.value-volume*.36*1.25)<1e-12);}a.setEnabled(false);assert.equal(a.master.gain.value,0);
});
test('channels route independently and notifications remain audible when game effects are muted',async()=>{
 const a=new SoftAudio({AudioContext:FakeAudioContext,channels:{effects:0}});await a.unlock();a.play('step');assert.equal(a.context.sources.length,0);
 a.play('turn');assert.ok(a.context.sources.length);assert.ok(a.context.sources.every(s=>s.target.target===a.buses.notifications));
 a.setChannel('notifications',0);const count=a.context.sources.length;a.play('offer');assert.equal(a.context.sources.length,count);
 a.setChannel('effects',.4);a.play('purchase');assert.ok(a.context.sources.slice(count).every(s=>s.target.target===a.buses.effects||s.target.target.target===a.buses.effects));
 assert.equal(a.buses.effects.gain.value,.4);assert.equal(a.buses.notifications.gain.value,0);
});
test('ambience is opt-in, ducks under cues, stops when hidden or muted, and restarts only when active',async()=>{
 const a=new SoftAudio({AudioContext:FakeAudioContext});await a.unlock();assert.equal(a.ambienceSource,null);
 a.setChannel('ambience',.3);const first=a.ambienceSource;assert.equal(first.loop,true);a.play('card');assert.ok(a.buses.ambience.gain.events.some(([v])=>Math.abs(v-.075)<1e-12));
 a.setActive(false);assert.equal(a.ambienceSource,null);assert.equal(first.stopped,0);const count=a.context.sources.length;a.play('dice');assert.equal(a.context.sources.length,count);
 await a.unlock();assert.equal(a.ambienceSource,null);a.setActive(true);assert.notEqual(a.ambienceSource,first);
 a.setEnabled(false);assert.equal(a.ambienceSource,null);a.setActive(true);assert.equal(a.ambienceSource,null);a.setEnabled(true);assert.ok(a.ambienceSource);
 a.setChannel('ambience',0);assert.equal(a.ambienceSource,null);a.setChannel('ambience',.2);a.setVolume(0);assert.equal(a.ambienceSource,null);
});
test('fast repeated cues are throttled and tactile hits vary gently without changing the dice recording',async()=>{
 let random=0;const a=new SoftAudio({AudioContext:FakeAudioContext,random:()=>random});await a.unlock();a.play('step');const first=a.context.sources.find(s=>s.frequency.events.length),pitch=first.frequency.events[0][0],count=a.context.sources.length;
 a.play('step');assert.equal(a.context.sources.length,count);a.context.currentTime=.14;random=1;a.play('step');assert.notEqual(a.context.sources.slice(count).find(s=>s.frequency.events.length).frequency.events[0][0],pitch);
 const messageCount=a.context.sources.length;a.play('message');a.play('message');assert.equal(a.context.sources.length-messageCount,2);
});
test('every mixer cue produces a bounded, finite sound and stops cleanly',async()=>{
 for(const name of Object.keys(SOUNDS)){const a=new SoftAudio({AudioContext:FakeAudioContext});await a.unlock();a.play(name);assert.ok(a.context.sources.length,name);assert.ok(a.context.sources.every(s=>Number.isFinite(s.started)&&s.stopped>s.started),name);a.stop();assert.equal(a.voices.size,0,name);}
});
test('money uses one contextual cue rather than simultaneous loss and gain sounds',()=>{
 const transfer={type:'money',kind:'payment',changes:[{player:0,amount:-100},{player:1,amount:100}]};
 assert.equal(moneyCue(transfer,0),'moneyOut');assert.equal(moneyCue(transfer,1),'moneyIn');assert.equal(moneyCue(transfer,null),'transfer');
 assert.equal(moneyCue({...transfer,kind:'purchase',reason:'Auction: Park Lane'}),'auctionWin');assert.equal(moneyCue({...transfer,kind:'building'}),'build');
 for(const kind of ['trade','bankruptcy'])assert.equal(moneyCue({...transfer,kind}),null);
});
test('turn, auction, completed set and finish cues follow real state changes and ignore repainting',()=>{
 const g=new Game({bots:1}),before=structuredClone(g.s);assert.deepEqual(actionCues(before,before,[],0,g.board),[]);
 g.s.turn=1;g.s.players[1].bot=false;assert.deepEqual(actionCues(before,g.s,[],1,g.board),['turn']);
 g.s.turn=0;g.s.phase='auction';g.s.auction={id:1,bid:0,cursor:0};assert.deepEqual(actionCues(before,g.s,[],0,g.board),['auctionOpen']);
 const opened=structuredClone(g.s);g.s.auction.bid=10;assert.deepEqual(actionCues(opened,g.s,[],0,g.board),['auctionBid']);
 g.s.props[1].owner=0;g.s.props[3].owner=0;assert.ok(actionCues(before,g.s,[],0,g.board).includes('set'));assert.ok(!actionCues(g.s,g.s,[],0,g.board).includes('set'));
 g.s.phase='over';g.s.winner=0;assert.deepEqual(actionCues(before,g.s,[],0,g.board),['finish']);assert.deepEqual(actionCues(g.s,g.s,[],0,g.board),[]);
});
test('notifications ignore history, polling repeats, spectator chat and unrelated speech',()=>{
 const previous={id:'game',chat:[{id:'question',seat:0}]},next={...previous,chat:[...previous.chat,{id:'answer',seat:1,replyTo:'question'}]};
 assert.deepEqual(notificationCues(null,next,0),[]);assert.deepEqual(notificationCues(previous,next,0),['message']);assert.deepEqual(notificationCues(next,next,0),[]);
 assert.deepEqual(notificationCues(previous,{...next,spectator:true},0),[]);assert.deepEqual(notificationCues(previous,{...previous,chat:[...previous.chat,{id:'casual',seat:1}]},0),[]);
 assert.deepEqual(notificationCues(previous,{...next,offer:{id:'offer',to:0}},0),['offer']);assert.deepEqual(notificationCues(previous,{...next,error:'Disconnected'},0),['error']);
});
test('original music renders a finite stereo loop with headroom and a continuous seam',()=>{
 const buffer=createMusicBuffer(new FakeAudioContext(),{sampleRate:8000});assert.equal(buffer.numberOfChannels,2);assert.ok(Math.abs(buffer.duration-MUSIC.bars*4*60/MUSIC.bpm)<1/buffer.sampleRate);
 let energy=0,stereo=0,peak=0;for(let channel=0;channel<2;channel++){const data=buffer.getChannelData(channel);for(let i=0;i<data.length;i++){assert.ok(Number.isFinite(data[i]));peak=Math.max(peak,Math.abs(data[i]));energy+=data[i]*data[i];if(channel===1)stereo+=Math.abs(data[i]-buffer.getChannelData(0)[i]);}assert.ok(Math.abs(data[0]-data.at(-1))<.04,'circular note tails meet without a jump');}
 assert.ok(peak>.5&&peak<.66);assert.ok(energy/buffer.length>.001);assert.ok(stereo>1);
});
test('optional music fades in, ducks under cues, resumes its position, and reuses its buffer',async()=>{
 const a=new SoftAudio({AudioContext:FakeAudioContext});await a.unlock();assert.equal(a.channels.music,0);assert.equal(a.musicBuffer,null);assert.equal(a.musicSource,null);
 a.setChannel('music',.4);const buffer=a.musicBuffer,source=a.musicSource;assert.equal(source.loop,true);assert.equal(source.target.target,a.buses.music);assert.equal(a.musicVolume,.4);assert.ok(a.musicGain.gain.events.some(([v,t])=>v===.8&&t===1.5));
 a.play('turn');assert.ok(a.buses.music.gain.events.some(([v])=>Math.abs(v-.18)<1e-10));a.context.currentTime=12;a.setActive(false);assert.equal(source.stopped,12);assert.equal(a.musicSource,null);assert.equal(a.musicOffset,12);
 await a.unlock();assert.equal(a.musicSource,null);a.setActive(true);assert.equal(a.musicSource.offset,12);assert.equal(a.musicBuffer,buffer);const resumed=a.musicSource;a.setChannel('music',0);assert.ok(resumed.stopped>12);assert.equal(a.musicSource,null);assert.equal(a.musicVolume,.4);
 a.setChannel('music',a.musicVolume);assert.equal(a.musicBuffer,buffer);a.setVolume(0);assert.equal(a.musicSource,null);assert.equal(a.musicVoices.size,0);a.setVolume(.25);assert.ok(a.musicSource);a.setEnabled(false);assert.equal(a.musicSource,null);await a.unlock();assert.equal(a.musicSource,null);
});
