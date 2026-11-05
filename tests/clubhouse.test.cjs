'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../engine.js'),C=require('../character-memory.js'),T=require('../trophies.js'),P=require('../personality-presets.js'),PP=require('../provider-pieces.js'),I=require('../fi.js');require('../lobby-fi.js');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ui({privateVisible=false,mobile=false}={}){
 const characters=[
  {id:'captain',name:'Captain Deals',kind:'bot',backend:{type:'codex',model:'new-model'},profile:{personality:'trader',voice:'witty'},enabled:true,stats:{games:4,gold:2,silver:1,bronze:0},recent:[{matchId:'saved',boardId:'lantern-harbor',round:30,place:1}],rivalries:[],moments:[],lessons:[{key:'reserve',tag:'Reserve',support:1,text:'PRIVATE LESSON',fi:'YKSITYINEN',personal:{text:'PRIVATE PERSONAL'}}],reflection:{worked:'PRIVATE REFLECTION',mistake:'PRIVATE MISTAKE',language:'en'}},
  {id:'alex',name:'Alex',kind:'human',backend:{type:'human',model:''},profile:{},enabled:false,stats:{games:7,gold:1,silver:3,bronze:2},recent:[],rivalries:[],moments:[]},
  {id:'ada',name:'Ada',kind:'bot',backend:{type:'heuristic',model:''},profile:{},enabled:false,stats:{games:0,gold:0,silver:0,bronze:0},recent:[],rivalries:[],moments:[]}
 ];
 const matches=[{id:'saved',boardId:'lantern-harbor',round:30,archive:{snapshots:1},entries:[{key:'model:codex:old-model',name:'Old Captain',type:'codex',model:'old-model',place:1,seat:0}]}];
 const effects={renders:0,reads:0,exports:0,api:[]},game=new M.Game(),catalog={characters,privateVisible,jobs:[]};
 const c=vm.createContext({RentReasonCharacterMemory:C,RentReason:M,RentReasonProviderPieces:PP,Trophies:T,Personality:P,I18n:I,Boards:M.Boards,game,uiLanguage:'en',lobbyHistory:matches,lobbyHistoryLoaded:true,lobbyView:'characters',lobbyDraft:null,lobbyPreview:false,remote:null,aiHost:null,firstRun:false,modal:'lobby',esc,lobbyText:s=>I.translate(s,'en'),lobbyToken:()=>'<svg></svg>',trophyCup:()=>'<svg></svg>',optionList:(rows,selected)=>rows.map(([v,t])=>`<option value="${v}" ${v===selected?'selected':''}>${esc(t)}</option>`).join(''),document:{addEventListener(){}},$:()=>({querySelector:()=>({scrollTop:450})}),matchMedia:()=>({matches:mobile}),renderLobby(){effects.renders++;},toast(){},pref:()=>null,api:async(...args)=>{effects.api.push(args);},readLobbyHistory:async()=>{effects.reads++;return true;},exportTrophies(){effects.exports++;},console});
 vm.runInContext(fs.readFileSync(require.resolve('../memory-ui.js'),'utf8'),c);c.fixture=catalog;vm.runInContext('notebookCatalog=fixture;notebookSelected="captain";',c);
 return{c,characters,catalog,effects,game,matches};
}
test('character careers follow identity across model changes while model standings use historical records',()=>{
 const {c,characters,matches}=ui(),before=JSON.stringify({characters,matches}),profile=vm.runInContext('clubhouseProfile(notebookCatalog.characters[0])',c),models=vm.runInContext('clubhouseModels()',c);
 assert.match(profile,/new-model/);assert.match(profile,/>2<\/b>/);assert.match(models,/old-model/);assert.ok(!models.includes('new-model'));assert.equal(JSON.stringify({characters,matches}),before);
});
test('private learning and reflections stay hidden during human games even if accidentally present in the catalog',()=>{
 const {c}=ui();vm.runInContext('clubhouseTab="notebook"',c);const html=vm.runInContext('clubhouseProfile(notebookCatalog.characters[0])',c);
 for(const secret of ['PRIVATE LESSON','PRIVATE PERSONAL','PRIVATE REFLECTION','PRIVATE MISTAKE'])assert.ok(!html.includes(secret));
 assert.match(html,/Private during human games/);assert.match(html,/notebook-enabled/);
});
test('authorized notebook views preserve lessons, reflection and existing pin/reset actions',()=>{
 const {c}=ui({privateVisible:true});const html=vm.runInContext('clubhouseNotebook(notebookCatalog.characters[0])',c);
 assert.match(html,/PRIVATE LESSON/);assert.match(html,/PRIVATE REFLECTION/);assert.match(html,/notebook:pin:reserve/);assert.match(html,/notebook:reset/);
});
test('roster search, kind filters and sort use public identity fields without changing source order',()=>{
 const {c,characters}=ui(),before=JSON.stringify(characters);
 assert.deepEqual(Array.from(vm.runInContext('clubhouseRows().map(c=>c.id)',c)),['captain','alex','ada']);
 assert.deepEqual(Array.from(vm.runInContext('clubhouseFilter="human";clubhouseRows().map(c=>c.id)',c)),['alex']);
 assert.deepEqual(Array.from(vm.runInContext('clubhouseFilter="bot";clubhouseRows().map(c=>c.id)',c)),['ada']);
 assert.deepEqual(Array.from(vm.runInContext('clubhouseFilter="all";clubhouseSearch="new-model";clubhouseRows().map(c=>c.id)',c)),['captain']);
 assert.deepEqual(Array.from(vm.runInContext('clubhouseSearch="";clubhouseSort="games";clubhouseRows().map(c=>c.id)',c)),['alex','captain','ada']);assert.equal(JSON.stringify(characters),before);
});
test('recent appearances link only to exact recorded matches, and empty careers have no invented results',()=>{
 const {c,characters}=ui();let html=vm.runInContext('clubhouseCareer(notebookCatalog.characters[0])',c);assert.match(html,/archive:saved/);
 characters[0].recent[0].matchId='not-saved';html=vm.runInContext('clubhouseCareer(notebookCatalog.characters[0])',c);assert.ok(!html.includes('data-lobby="archive:'));assert.match(html,/Result recorded/);
 html=vm.runInContext('clubhouseCareer(notebookCatalog.characters[2])',c);assert.match(html,/First appearance awaits/);assert.ok(!html.includes('archive:'));
});
test('roster and model names are escaped, including malicious names and model IDs',()=>{
 const {c,characters,matches}=ui();characters[0].name='<img src=x onerror=alert(1)>';matches[0].entries[0].model='<script>alert(1)</script>';
 assert.ok(!vm.runInContext('notebookPage()',c).includes('<img src=x'));assert.ok(vm.runInContext('notebookPage()',c).includes('&lt;img'));assert.ok(!vm.runInContext('clubhouseModels()',c).includes('<script>'));
});
test('model standings exclude humans and classic bots, and equal medal counts share a rank',()=>{
 const {c,matches}=ui();matches[0].entries.push({key:'model:claude:same-result',name:'Second',type:'claude',model:'same-result',place:1,seat:1},{key:'human:alex',name:'Alex',type:'human',model:'',place:2,seat:2});
 const rows=vm.runInContext('clubhouseModelRows()',c);assert.equal(rows.length,2);assert.equal(rows[0].rank,1);assert.equal(rows[1].rank,1);
});
test('profile browsing and export do not mutate the game or send character writes',async()=>{
 const {c,effects,game}=ui(),before=JSON.stringify(game.s);
 await vm.runInContext('notebookAction("select:alex")',c);await vm.runInContext('clubhouseAction("tab:rivalries")',c);await vm.runInContext('clubhouseAction("mode:models")',c);await vm.runInContext('clubhouseAction("export")',c);
 assert.equal(effects.exports,1);assert.equal(effects.reads,1);assert.equal(effects.api.length,0);assert.equal(JSON.stringify(game.s),before);
});
test('legacy trophy buttons open the same Clubhouse entry point',async()=>{
 const {c,effects}=ui();c.openNotebooks=async()=>effects.opens=(effects.opens||0)+1;
 const source=fs.readFileSync(require.resolve('../trophy-ui.js'),'utf8');vm.runInContext(source.slice(source.indexOf('async function trophyDialog()'),source.indexOf('function postMatchChat()')),c);await vm.runInContext('trophyDialog()',c);assert.equal(effects.opens,1);
});
test('clubhouse navigation and new copy translate offline into Finnish',()=>{
 for(const en of ['Characters & trophies','Clubhouse.','Recent appearances','Most appearances','Career','Models','Win rate','← Back to roster'])assert.notEqual(I.translate(en,'fi'),en);
});
