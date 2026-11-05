'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../engine.js'),E=require('../experience.js'),{check}=require('../scripts/check-release.cjs');
function view(){const c=vm.createContext({RentReason:M,RentReasonExperience:E});vm.runInContext(fs.readFileSync(path.join(__dirname,'../view.js'),'utf8'),c);return c.RentReasonView;}
test('the only shipped edition is fictional, immutable, and consistent in both languages',()=>{
 assert.deepEqual(Object.keys(M.Boards.EDITIONS),['lantern-harbor']);
 const g=new M.Game({boardId:'lantern-harbor'});assert.equal(g.board.length,40);assert.equal(g.board[0].name,'Harbor Gate');assert.equal(g.board[39].name,'Lantern Summit');
 assert.equal(Object.isFrozen(g.board),true);assert.equal(Object.isFrozen(g.board[1].rent),true);
 for(const deck of ['chance','chest']){const en=M.Boards.cards(deck,g.s,'en'),fi=M.Boards.cards(deck,g.s,'fi');assert.equal(en.length,16);assert.deepEqual(en.map(c=>c.slice(1)),fi.map(c=>c.slice(1)));assert.notEqual(en[0][0],fi[0][0]);for(const c of en)if(c[1]==='move')assert(g.board[c[2]]);}
 assert.throws(()=>new M.Game({boardId:'unshipped-board'}),/Unknown board/);
});
test('the square board has forty selectable tiles and bounded, distinct seat anchors',()=>{
 const V=view();const cells=Array.from({length:40},(_,i)=>V.rect(i));assert.equal(new Set(cells.map(r=>r.x+','+r.y)).size,40);assert(cells.every(r=>Math.abs(r.w-r.h)<.001&&r.w===cells[0].w));const html=V.scene({boardId:'lantern-harbor'});for(const id of ['owner-layer','building-layer','workshop-rule-layer','token-layer'])assert(html.includes('id="'+id+'"'));assert.equal((html.match(/class="board-space(?: [^"]*)?"/g)||[]).length,40);assert.equal((html.match(/class="space-selection"/g)||[]).length,40);
 for(let pos=0;pos<40;pos++){const seats=Array.from({length:4},(_,i)=>V.anchor(pos,i,pos===10));assert.equal(new Set(seats.map(p=>p.x+','+p.y)).size,4);for(const p of seats){assert(p.x>17&&p.x<983);assert(p.y>30&&p.y<994);}}
 const g=new M.Game();g.s.props[1].owner=0;g.s.props[1].level=3;const u=V.updates(g);assert.match(u.owners,/data-owner-property="1"/);assert.match(u.buildings,/data-building-property="1"/);
 for(const b of g.board.filter(b=>b.price)){const card=V.card(b);assert(card.includes(b.name));assert(card.includes('$'+b.price/2));assert.match(card,/harbor-deed/);}
});
test('independent hosted-bot games finish and restore with the original board, cards, and inventories',()=>{
 for(const language of ['en','fi'])for(const seed of [11,28,77,181]){const g=new M.Game({boardId:'lantern-harbor',language,seed,roundLimit:30,players:Array.from({length:4},(_,i)=>({type:'heuristic',name:'Bot '+(i+1)}))});let steps=0;while(g.s.phase!=='over'&&steps++<30000)g.botStep();assert.equal(g.s.phase,'over');M.Game.validate(g.s);assert.deepEqual(M.Game.load(g.s).s,g.s);}
});
test('the generated standalone scripts parse and contain the public theme',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');let count=0;for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)){new vm.Script(match[1]);count++;}assert(count>15);assert.match(html,/Lantern Harbor/);assert.match(html,/harbor-board/);assert.match(html,/harbor-deed/);
});
test('the distributable file set passes privacy, content, credential and build checks',()=>{const result=check();assert(result.files>80);});
