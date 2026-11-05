'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../social-ui.js'),'utf8');
function harness(){
 const events={},latest={hidden:true,textContent:''},heading={textContent:''};let callbacks=[];
 const chat={dataset:{},children:[],clientHeight:200,isConnected:true,_top:0,
  get scrollHeight(){return this.children.length*100;},get scrollTop(){return this._top;},set scrollTop(v){this._top=Math.max(0,Math.min(v,this.scrollHeight-this.clientHeight));},
  addEventListener(type,fn){events[type]=fn;},querySelectorAll(){return this.children.filter(n=>n.dataset.chatId);},querySelector(){return null;},
  set innerHTML(value){this.children=[];},insertBefore(node,before){const old=this.children.indexOf(node);if(old>=0)this.children.splice(old,1);const i=before?this.children.indexOf(before):this.children.length;this.children.splice(i<0?this.children.length:i,0,node);}
 };
 const node=()=>({dataset:{},remove(){const i=chat.children.indexOf(this);if(i>=0)chat.children.splice(i,1);},replaceWith(next){const i=chat.children.indexOf(this);if(i>=0)chat.children.splice(i,1,next);}});
 const c=vm.createContext({$:id=>({'ai-chat':chat,'chat-latest':latest,'chat-panel':{querySelector:()=>heading}}[id]),document:{createElement(){return{set innerHTML(value){this.content={firstElementChild:node()};}};}},ResizeObserver:class{constructor(fn){callbacks.push(fn);}observe(){}disconnect(){}},requestAnimationFrame:fn=>fn(),game:{s:{phase:'roll',players:[{id:0,name:'Alex'}]}},playerColor:()=> '#c8322e',chatMarkup:c=>'<p>'+c.text+'</p>',I18n:{translate:s=>s},uiLanguage:'en'});
 vm.runInContext(source.slice(source.indexOf('let observedSocialChat='),source.indexOf('async function insightsDialog')),c);
 vm.runInContext(source.slice(source.indexOf('function renderSocialChat('),source.indexOf('function personalityDialog(')),c);
 const status={chat:Array.from({length:12},(_,i)=>({id:String(i),seat:0,text:'Line '+i,version:0}))};c.status=status;
 const render=()=>vm.runInContext('renderSocialChat(status)',c);render();
 return{c,chat,status,latest,events,render,resize:()=>callbacks.forEach(fn=>fn())};
}
test('reading older messages preserves scroll and existing message nodes when a new line arrives',()=>{
 const h=harness();assert.equal(h.chat.scrollTop,1000);const first=h.chat.children[0];h.chat.scrollTop=120;h.events.scroll();h.status.chat.push({id:'12',seat:0,text:'New line',version:0});h.render();
 assert.equal(h.chat.scrollTop,120);assert.equal(h.chat.children[0],first);assert.equal(h.latest.hidden,false);assert.match(h.latest.textContent,/1/);h.resize();assert.equal(h.chat.scrollTop,120);
 vm.runInContext('scrollChatToBottom()',h.c);assert.equal(h.chat.scrollTop,1100);assert.equal(h.latest.hidden,true);
});
test('following the latest conversation keeps new lines and resizes pinned to the bottom',()=>{
 const h=harness();h.status.chat.push({id:'12',seat:0,text:'New line',version:0});h.render();assert.equal(h.chat.scrollTop,1100);assert.equal(h.latest.hidden,true);
 h.chat.clientHeight=150;h.resize();assert.equal(h.chat.scrollTop,1150);
});
test('a message update replaces only that message and does not count as an unread new reply',()=>{
 const h=harness(),first=h.chat.children[0],changed=h.chat.children[3];h.chat.scrollTop=80;h.events.scroll();h.status.chat[3].text='Corrected line';h.status.chat[3].version++;h.render();
 assert.equal(h.chat.scrollTop,80);assert.equal(h.chat.children[0],first);assert.notEqual(h.chat.children[3],changed);assert.equal(h.latest.hidden,true);
});
