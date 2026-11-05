'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {Game}=require('../engine.js'),Tabletop=require('../tabletop.js');
const read=file=>fs.readFileSync(require.resolve('../'+file),'utf8');
function harness(){
 const nodes=new Map();let moves=0,focuses=0;
 function node(id){
  const classes=new Set(),n={id,parentElement:null,children:[],dataset:{},innerHTML:'',value:'',scrollTop:130,scrollHeight:1000,
   classList:{contains:c=>classes.has(c),add:(...cs)=>cs.forEach(c=>classes.add(c)),remove:(...cs)=>cs.forEach(c=>classes.delete(c)),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}},
   appendChild(child){child.remove();this.children.push(child);child.parentElement=this;moves++;return child;},
   insertBefore(child,anchor){if(anchor&&anchor.parentElement!==this)throw Error('NotFoundError: reference is not a child');return this.appendChild(child);},
   remove(){if(this.parentElement){const a=this.parentElement.children;a.splice(a.indexOf(this),1);this.parentElement=null;}},
   contains(child){return child===this||this.children.some(c=>c.contains(child));},
   setAttribute(){},querySelector(){return null;},querySelectorAll(){return[];},
   focus(){document.activeElement=this;focuses++;},
  };let currentId=id;Object.defineProperty(n,'id',{get:()=>currentId,set:value=>{nodes.delete(currentId);currentId=value;nodes.set(value,n);}});nodes.set(id,n);return n;
 }
 const main=node('main'),home=node('right-panels'),header=node('table-host-controls'),panel=node('chat-panel'),chat=node('ai-chat'),input=node('ai-message'),target=node('ai-chat-target');
 main.appendChild(home);home.appendChild(node('deed-panel'));home.appendChild(panel);panel.appendChild(chat);panel.appendChild(input);panel.appendChild(target);header.appendChild(node('ai-panel'));node('modal-root');
 const document={body:node('body'),activeElement:input,addEventListener(){},querySelector:s=>s==='main'?main:null,createElement:()=>node('created-'+nodes.size)};
 const game=new Game({boardId:'lantern-harbor',players:[{name:'Alex',type:'human'},{name:'Ada',type:'heuristic'}],seed:42});
 const c=vm.createContext({document,$:id=>{const n=nodes.get(id);return n&&(n.parentElement||['main','modal-root','body'].includes(id))?n:null;},RentReasonTabletop:Tabletop,game,B:game.board,remote:{status:{socialVersion:1,offer:null,chat:[]},applied:0,latest:0},modal:null,timer:null,busy:false,selected:39,clearTimeout(){},board(){},schedule(){},isMyTurn:()=>true,mySeat:()=>0,isGuest:()=>false,esc:s=>s,money:n=>'£'+n,playerColor:()=> '#c8322e',socialSeats:()=>[1],View:{card:()=>'<div>deed</div>'},Art:{piece:()=>''},playerLook:()=>({piece:'comet'}),motion:false});
 const social=read('social-ui.js');vm.runInContext(social.slice(social.indexOf('let observedSocialChat='),social.indexOf('function scrollChatToBottom(')),c);
 vm.runInContext(read('tabletop-ui.js'),c);vm.runInContext(read('trade-ui.js'),c);
 vm.runInContext('updateTradeSummary=()=>board()',c);
 return{c,run:s=>vm.runInContext(s,c),game,document,main,home,panel,chat,input,target,header,nodes,get moves(){return moves;},get focuses(){return focuses;}};
}
test('auction exit returns the same chat to the right rail when host controls live in the header',()=>{
 const h=harness();h.run('game.startAuction(21,"end");syncAuctionView()');
 assert.equal(h.panel.parentElement,h.main);assert.ok(h.document.body.classList.contains('auctioning'));
 h.run('game.s.phase="end";game.s.auction=null');const state=JSON.stringify(h.game.s);h.run('syncAuctionView()');
 assert.equal(h.panel.parentElement,h.home);assert.equal(h.panel.classList.contains('auction-chat'),false);assert.equal(h.document.body.classList.contains('auctioning'),false);assert.equal(h.nodes.get('auction-panel').parentElement,null);
 assert.equal(h.input.value,'');assert.equal(h.chat.scrollTop,1000);assert.equal(h.nodes.get('ai-panel').parentElement,h.header);
 // Repeated cleanup is harmless; it cannot strand the chat under main.
 const moves=h.moves;h.run('closeAuctionView();closeAuctionView()');assert.equal(h.moves,moves);
 assert.equal(JSON.stringify(h.game.s),state);
});
test('trade discussion survives Edit counteroffer and returns intact on close',async()=>{
 const h=harness(),before=JSON.stringify(h.game.s);h.run('openTrade({offer:{id:"incoming",from:1,to:0,give:[],take:[],giveCash:10,takeCash:0,depth:0}})');
 await h.run('tradeAction("trade-talk")');h.input.value='My unsent counteroffer question';h.target.value='all';h.chat.scrollTop=120;h.run('chatPinned=false;chatUnread=2');
 const moves=h.moves;await h.run('tradeAction("trade-counter")');
 assert.match(h.nodes.get('trade-panel').innerHTML,/Make a counteroffer/);assert.match(h.nodes.get('trade-panel').innerHTML,/Send counteroffer/);
 assert.equal(h.panel.parentElement,h.main);assert.equal(h.moves,moves);assert.ok(h.document.body.classList.contains('trading-discussion'));assert.equal(h.input.value,'My unsent counteroffer question');assert.equal(h.target.value,'all');assert.equal(h.chat.scrollTop,120);
 await h.run('tradeAction("trade-close")');assert.equal(h.panel.parentElement,h.home);assert.equal(h.panel.classList.contains('trade-chat'),false);assert.equal(h.document.body.classList.contains('trading'),false);assert.equal(h.document.body.classList.contains('trading-discussion'),false);assert.equal(h.nodes.get('trade-panel').parentElement,null);
 assert.equal(h.chat.scrollTop,120);assert.equal(h.input.value,'My unsent counteroffer question');assert.equal(h.document.activeElement,h.input);assert.equal(h.run('chatUnread'),2);assert.equal(JSON.stringify(h.game.s),before);
});
test('repeated discussion toggles and reopening trade leave no stale workspace classes',async()=>{
 const h=harness();h.run('openTrade()');
 for(let i=0;i<3;i++){await h.run('tradeAction("trade-talk")');assert.equal(h.panel.parentElement,h.main);await h.run('tradeAction("trade-talk")');assert.equal(h.panel.parentElement,h.home);assert.equal(h.document.body.classList.contains('trading-discussion'),false);}
 h.run('closeTrade();openTrade();closeTrade()');assert.equal(h.panel.parentElement,h.home);assert.equal(h.document.body.classList.contains('trading'),false);
});
