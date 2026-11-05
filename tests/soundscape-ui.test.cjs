'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const F=require('../feedback.js'),I=require('../i18n.js');require('../fi.js');
test('sound settings expose independent channels, optional music and ambience, and previews for every cue',()=>{
 const source=fs.readFileSync(require.resolve('../ui-panels.js'),'utf8'),mixer={innerHTML:''},panel={parentElement:{},classList:{add(){}},querySelector:()=>({after(){}})},sound={channels:{effects:1,notifications:.5,ambience:0,music:0},levels:Object.fromEntries(Object.keys(F.SOUNDS).map(k=>[k,1]))};
 const c=vm.createContext({settingsHome:null,openModal(){},document:{querySelector:()=>panel},$:id=>id==='settings-content'?{appendChild(){}}:mixer,Feedback:F,sound,esc:s=>s,syncSound(){}});
 vm.runInContext(source.slice(source.indexOf('function settingsDialog()'),source.indexOf('function modelRows()')),c);c.settingsDialog();
 for(const [key,value]of Object.entries(sound.channels))assert.match(mixer.innerHTML,new RegExp('id="channel-'+key+'"[^>]+value="'+value*100+'"'));
 for(const key of Object.keys(F.SOUNDS))assert.ok(mixer.innerHTML.includes('sound-preview:'+key));
 assert.match(mixer.innerHTML,/data-action="music" aria-pressed="false">Music: off/);
 assert.match(mixer.innerHTML,/<details><summary>Individual sounds/);assert.ok(!mixer.innerHTML.includes('NaN'));
});
test('channel sliders apply and persist independent levels with their visible output',async()=>{
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8'),listeners={},saved={},output={textContent:''},sound={enabled:true,channels:{effects:1,notifications:1,ambience:0},setChannel(k,v){this.channels[k]=v;},unlock:async()=>true};
 const c=vm.createContext({document:{addEventListener:(name,fn)=>listeners[name]=fn},sound,savePref:(key,value)=>saved[key]=value,syncSound(){}});
 vm.runInContext(source.slice(source.indexOf("document.addEventListener('input',e=>{if(e.target.dataset.soundChannel)"),source.indexOf("document.addEventListener('visibilitychange'")),c);
 listeners.input({target:{dataset:{soundChannel:'notifications'},value:'0',closest:()=>({querySelector:()=>output})}});
 assert.equal(sound.channels.effects,1);assert.equal(sound.channels.notifications,0);assert.equal(sound.channels.ambience,0);assert.equal(output.textContent,'0%');assert.equal(JSON.parse(saved['sound-channels']).notifications,0);
});
test('music toggle restores its remembered level, persists it, and respects master mute',()=>{
 const source=fs.readFileSync(require.resolve('../app.js'),'utf8'),saved={},sound={enabled:false,channels:{music:0,effects:1},musicVolume:.6,setChannel(k,v){this.channels[k]=v;},unlock(){throw Error('Master mute must be respected');}};
 const c=vm.createContext({sound,savePref:(key,value)=>saved[key]=value,syncSound(){}});vm.runInContext(source.slice(source.indexOf('function toggleMusic()'),source.indexOf('function toggleSound()')),c);
 c.toggleMusic();assert.equal(sound.channels.music,.6);assert.equal(sound.channels.effects,1);assert.equal(sound.enabled,false);assert.equal(saved['music-volume'],.6);assert.equal(JSON.parse(saved['sound-channels']).music,.6);
 c.toggleMusic();assert.equal(sound.channels.music,0);assert.equal(saved['music-volume'],.6);assert.equal(JSON.parse(saved['sound-channels']).music,0);
});
test('host polling sounds a new directed reply once and one cue per connection loss and recovery',async()=>{
 const source=fs.readFileSync(require.resolve('../ai-ui.js'),'utf8'),heard=[],base={id:'table',sequence:0,frames:[],chat:[{id:'question',seat:0}]};let response={...base,chat:[...base.chat,{id:'reply',seat:1,replyTo:'question'}]},fail=false;
 const c=vm.createContext({remote:{id:'table',received:0,status:base},aiPolling:false,soundConnectionLost:false,aiQueue:[],Feedback:F,mySeat:()=>0,api:async()=>{if(fail)throw Error('Disconnected');return response;},playCue:cue=>heard.push(cue),renderAi(){},drainAi(){},isGuest:()=>false,$:()=>null});
 vm.runInContext(source.slice(source.indexOf('async function pollAi()'),source.indexOf('async function drainAi()')),c);
 await c.pollAi();await c.pollAi();assert.deepEqual(heard,['message']);fail=true;await c.pollAi();await c.pollAi();assert.deepEqual(heard,['message','error']);fail=false;await c.pollAi();await c.pollAi();assert.deepEqual(heard,['message','error','connection']);
});
test('new sound labels and accessible preview/volume text translate offline',()=>{
 for(const label of [...Object.values(F.CHANNELS),...Object.values(F.SOUNDS)])assert.notEqual(I.translate(label,'fi'),label,label);
 assert.notEqual(I.translate('Preview Completing a trade','fi'),'Preview Completing a trade');assert.notEqual(I.translate('Notifications volume','fi'),'Notifications volume');
});

test('the standalone build embeds the recorded dice roll and keeps its source notice',()=>{
 const path=require('node:path'),root=path.join(__dirname,'..'),sample=fs.readFileSync(path.join(root,'assets/audio/dice-roll.mp3'));
 assert(sample.length>30000);assert.ok(fs.readFileSync(path.join(root,'index.html'),'utf8').includes(sample.toString('base64')));
 assert.match(fs.readFileSync(path.join(root,'assets/audio/README.md'),'utf8'),/353974/);
 assert.match(fs.readFileSync(path.join(root,'assets/audio/LICENSE-CC0.md'),'utf8'),/CC0 1.0 Universal/);
});
