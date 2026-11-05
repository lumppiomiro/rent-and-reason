'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function ui(){
 const calls=[],state={html:'',modal:null,toast:'',closed:false},button={disabled:false,isConnected:true},fields={
 'guest-character-form':{reportValidity:()=>true,querySelector:()=>button},'guest-character-name':{value:'New friend'},'guest-character-piece':{value:'sail'},'guest-character-color':{value:'#8051a3'},'guest-character-error':{textContent:''}};
 const character={revision:9,character:{id:'char-friend',name:'My friend',profile:{piece:'acorn',color:'#8051a3'}}};
 const c=vm.createContext({location:{protocol:'https:'},aiHost:{viewer:{role:'guest',seat:1},features:{ownCharacter:1}},remote:{status:{actor:0}},game:{s:{players:[{name:'Host'},{name:'My friend'}]}},document:{addEventListener(){}},api:async(route,data)=>{calls.push({route,data});return structuredClone(character);},Art:{pieces:[['acorn','Dog'],['sail','Ship']]},RentReason:{PLAYER_COLORS:[['#8051a3','Purple']]},optionList:(items,selected)=>items.map(([v,label])=>`<option value="${v}" ${selected===v?'selected':''}>${label}</option>`).join(''),esc:s=>String(s).replace(/</g,'&lt;'),mySeat:()=>1,openModal:(type,html)=>{state.modal=type;state.html=html;c.modal=type;},toast:t=>state.toast=t,closeModal:()=>{state.closed=true;c.modal=null;},render(){},$:id=>fields[id],modal:null});
 vm.runInContext(fs.readFileSync(require.resolve('../network-ui.js'),'utf8'),c);return{c,calls,state,fields,button};
}
test('guest character editor reads only their own endpoint and saves explicit name/look fields',async()=>{
 const {c,calls,state}=ui();await vm.runInContext("networkAction('network-character')",c);assert.equal(state.modal,'guest-character');assert.equal(calls[0].route,'character');assert.match(state.html,/My friend/);assert.doesNotMatch(state.html,/Host|appearance-seat|character-type/);assert.match(state.html,/future games/);
 await vm.runInContext('saveGuestCharacter()',c);assert.equal(calls.length,2);assert.equal(calls[1].route,'character');assert.deepEqual(JSON.parse(JSON.stringify(calls[1].data)),{characterId:'char-friend',revision:9,profile:{name:'New friend',piece:'sail',color:'#8051a3'}});assert.equal(state.closed,true);
});
test('failed saves keep guest edits visible and provide a reload option',async()=>{
 const {c,state,fields,button}=ui();await vm.runInContext('openGuestCharacter()',c);c.api=async()=>{throw Error('Characters changed. Reopen the character before saving.');};await vm.runInContext('saveGuestCharacter()',c);assert.match(fields['guest-character-error'].textContent,/changed/);assert.equal(state.closed,false);assert.equal(fields['guest-character-name'].value,'New friend');assert.equal(button.disabled,false);assert.match(state.html,/Reload saved character/);
});
