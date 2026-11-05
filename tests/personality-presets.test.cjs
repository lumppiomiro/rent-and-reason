'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const P=require('../personality-presets.js'),Social=require('../ai/social.cjs'),{Table}=require('../ai/table.cjs');
function storage(){const values=new Map();return{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),values};}
const profile={personality:'trader',voice:'dramatic',chattiness:'lively',customVoice:'Railway puns, confident bargaining and mock outrage.'};
test('named personality presets survive new sessions and carry only reusable style settings',()=>{
 const store=storage(),first=new P.Library(store),saved=first.save('Railway negotiator',{...profile,model:'some/model',name:'Ada',apiKey:'never store this'});
 const second=new P.Library(store);assert.deepEqual(second.get(saved.id).profile,profile);assert.equal(second.all()[0].name,'Railway negotiator');assert.equal(store.getItem(P.KEY).includes('some/model'),false);assert.equal(store.getItem(P.KEY).includes('apiKey'),false);
 const copy=second.get(saved.id);copy.profile.voice='friendly';assert.equal(second.get(saved.id).profile.voice,'dramatic');
});
test('presets can be renamed, updated and removed, with duplicate names and limits handled explicitly',()=>{
 const lib=new P.Library(storage()),saved=lib.save(' Original ',profile);assert.throws(()=>lib.save('original',profile),/name exists/);assert.throws(()=>lib.save('',profile),/name/);assert.throws(()=>lib.save('x'.repeat(41),profile),/name/);
 const update=lib.save('Renamed',{...profile,voice:'witty'},saved.id);assert.equal(update.id,saved.id);assert.equal(lib.all().length,1);assert.equal(lib.get(saved.id).profile.voice,'witty');lib.remove(saved.id);assert.equal(lib.all().length,0);assert.throws(()=>lib.save('Stale',profile,saved.id),/removed/);
 for(let i=0;i<P.MAX_PRESETS;i++)lib.save('Preset '+i,profile);assert.throws(()=>lib.save('One too many',profile),/50/);
});
test('multiple browser tabs merge saved entries instead of overwriting one another',()=>{
 const store=storage(),a=new P.Library(store),b=new P.Library(store),first=a.save('First',profile),second=b.save('Second',profile);assert.equal(a.all().length,2);assert.equal(b.all().length,2);
 a.save('First edited',{...profile,voice:'friendly'},first.id);b.remove(second.id);assert.equal(new P.Library(store).all()[0].name,'First edited');
});
test('storage failures do not report a successful save or replace existing definitions',()=>{
 const store=storage(),lib=new P.Library(store),saved=lib.save('Original',profile);store.setItem=()=>{throw Error('storage blocked');};assert.throws(()=>lib.save('Changed',{...profile,voice:'friendly'},saved.id),/could not save/);assert.equal(lib.get(saved.id).name,'Original');assert.throws(()=>new P.Library(null).save('No storage',profile),/unavailable/);
});
test('untrusted or damaged stored entries are bounded and normalized consistently with the host',()=>{
 const store=storage();store.setItem(P.KEY,'not JSON');const lib=new P.Library(store);assert.equal(lib.all().length,0);assert.match(lib.warning,/could not be read/);
 for(const type of ['codex','claude','ollama','openrouter'])assert.deepEqual(P.normalize({type,personality:'bad',voice:'bad',chattiness:'bad',customVoice:'x'.repeat(400)}),Social.profile({type,personality:'bad',voice:'bad',chattiness:'bad',customVoice:'x'.repeat(400)}));
 store.setItem(P.KEY,JSON.stringify({version:1,presets:[{id:'valid',name:'Safe',profile},{id:'<script>',name:'Bad',profile},{id:'valid',name:'Duplicate',profile}]}));assert.equal(new P.Library(store).all().length,1);
});
function uiContext(){
 const fields=new Map(),store=storage(),select={value:'',innerHTML:'',dataset:{personalityPreset:'setup-1',profileScope:'setup',profileSeat:'1'}},buttons={update:{disabled:true},delete:{disabled:true}};
 fields.set('personality-preset-setup-1',select);fields.set('personality-name-setup-1',{value:'Railway negotiator'});fields.set('personality-status-setup-1',{textContent:''});
 for(let i=0;i<2;i++){for(const [key,suffix]of Object.entries({personality:'personality',voice:'voice',chattiness:'chattiness',customVoice:'custom'}))fields.set('ai-'+suffix+'-'+i,{value:profile[key]});fields.set('ai-name-'+i,{value:i?'Ada':'You'});fields.set('ai-type-'+i,{value:i?'codex':'human'});fields.set('ai-model-'+i,{value:i?'test':''});fields.set('ai-effort-'+i,{value:'high'});}
 fields.set('ai-board',{value:'lantern-harbor'});fields.set('ai-language',{value:'fi'});fields.set('ai-seats',{value:'2'});fields.set('ai-cash',{value:'1500',reportValidity:()=>true});fields.set('ai-rounds',{value:'0'});for(const rule of ['bankruptToBank','taxesToParking','doubleGo'])fields.set('ai-rule-'+rule,{checked:false});
 const calls=[],context=vm.createContext({RentReasonPersonalityPresets:P,localStorage:store,$:id=>fields.get(id),esc:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),document:{addEventListener(){},querySelectorAll:()=>[select],querySelector:s=>s.includes('update')?buttons.update:buttons.delete},calls});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../personality-ui.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../ai-ui.js'),'utf8'),context);
 vm.runInContext("api=async(route,data)=>{calls.push({route,data});return{};};setRemote=()=>{};toast=()=>{};",context);
 return{fields,store,select,buttons,calls,context};
}
test('setup preset controls save and load copies without changing model, player name or effort',()=>{
 const ui=uiContext(),c=ui.context;vm.runInContext("personalityPresetAction('ai-preset-new:setup-1')",c);assert.match(ui.fields.get('personality-status-setup-1').textContent,/saved for future games/);assert.equal(ui.buttons.update.disabled,false);
 ui.fields.get('ai-voice-1').value='natural';vm.runInContext("usePersonalityPreset($('personality-preset-setup-1'))",c);assert.equal(ui.fields.get('ai-voice-1').value,'dramatic');assert.equal(ui.fields.get('ai-model-1').value,'test');assert.equal(ui.fields.get('ai-name-1').value,'Ada');assert.equal(ui.fields.get('ai-effort-1').value,'high');assert.equal(ui.calls.length,0);
 const markup=vm.runInContext("personalityFields('setup',1,{},'<script>')",c);assert.equal(markup.includes('aria-label="<script>'),false);
});
test('table creation sends all edited personality fields and the host restores them into the agent context',async t=>{
 const ui=uiContext();await vm.runInContext("aiAction('ai-create')",ui.context);assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].route,'table');const options=JSON.parse(JSON.stringify(ui.calls[0].data));assert.equal(options.boardId,'lantern-harbor');assert.equal(options.language,'fi');assert.deepEqual(Object.fromEntries(Object.keys(profile).map(k=>[k,options.players[1][k]])),profile);
 let saved;const table=new Table(options,{codex:{forget(){}}},{persist:data=>saved=structuredClone(data)});t.after(()=>table.dispose());assert.deepEqual(table.status().socialProfiles[1],profile);assert.match(table.sessions.get(1).system,/Railway puns/);
 const resumed=new Table(null,{codex:{forget(){}}},{saved});t.after(()=>resumed.dispose());assert.deepEqual(resumed.status().socialProfiles[1],profile);
});
