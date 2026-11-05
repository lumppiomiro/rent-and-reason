'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../experience.js'),U=require('../usage.js'),{Game}=require('../engine.js');
test('3D dice have six unique pip faces, opposite sides sum to seven, and each result faces forward',()=>{
 assert.equal(new Set(E.DIE_FACES.map(f=>f.n)).size,6);
 const rotate=(v,x,y)=>{x*=Math.PI/180;y*=Math.PI/180;const [a,b,c]=v;const v1=[a*Math.cos(y)+c*Math.sin(y),b,-a*Math.sin(y)+c*Math.cos(y)];return[v1[0],v1[1]*Math.cos(x)-v1[2]*Math.sin(x),v1[1]*Math.sin(x)+v1[2]*Math.cos(x)];};
 for(const face of E.DIE_FACES){const normal=rotate([0,0,1],face.x,face.y),[x,y]=E.DIE_ROTATIONS[face.n],end=rotate(normal,x,y);assert.ok(Math.abs(end[0])<1e-8&&Math.abs(end[1])<1e-8&&Math.abs(end[2]-1)<1e-8);const opposite=E.DIE_FACES.find(f=>{const n=rotate([0,0,1],f.x,f.y);return n.every((a,i)=>Math.abs(a+normal[i])<1e-8);});assert.equal(face.n+opposite.n,7);assert.equal((E.die(face.n).match(/class="cube-face"/g)||[]).length,6);}
});
test('the dice shell is closed at every bevel and corner and all surfaces face outward',()=>{
 const point=p=>p.map(v=>Math.round(v*1e8)).join(','),edges=new Map(),vertices=new Set();
 assert.deepEqual(Object.fromEntries(['face','edge','corner'].map(k=>[k,E.DIE_SURFACES.filter(s=>s.kind===k).length])),{face:6,edge:12,corner:8});
 for(const surface of E.DIE_SURFACES){
  const center=surface.vertices[0].map((_,i)=>surface.vertices.reduce((sum,p)=>sum+p[i],0)/surface.vertices.length);
  assert.ok(center.reduce((sum,v,i)=>sum+v*surface.normal[i],0)>0,'visible material faces outwards');
  for(const [i,p] of surface.vertices.entries()){
   const key=point(p),next=point(surface.vertices[(i+1)%surface.vertices.length]);vertices.add(key);
   const edge=[key,next].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);
   assert.ok(p.every(v=>Math.abs(v)<=.500000001));
   assert.ok(Math.abs(p.reduce((sum,v,j)=>sum+(v-center[j])*surface.normal[j],0))<1e-8,'each facet is planar');
  }
 }
 assert.equal(vertices.size,24);assert.equal(edges.size,48);assert.ok([...edges.values()].every(n=>n===2),'every edge joins exactly two surfaces without an open seam');
 assert.equal(vertices.size-edges.size+E.DIE_SURFACES.length,2);
 for(let n=1;n<=6;n++){const html=E.die(n);assert.equal((html.match(/class="dice-bevel dice-edge"/g)||[]).length,12);assert.equal((html.match(/class="dice-bevel dice-corner"/g)||[]).length,8);assert.ok(!/NaN|Infinity/.test(html));}
});
test('trade preview identifies which named player actually gains a rent-reason without changing ownership',()=>{
 const g=new Game();g.s.props[1].owner=0;g.s.props[3].owner=1;const before=JSON.stringify(g.s);assert.deepEqual(E.tradeGroups(g,0,1,[1],[]),[{id:1,name:'Ada',group:'brown'}]);assert.equal(JSON.stringify(g.s),before);
});
test('dice settle square to the board view after full tumbling rotations',()=>{
 for(let n=1;n<=6;n++){const [x,y]=E.DIE_ROTATIONS[n];assert.equal(E.dieTransform(n),`rotateX(${x}deg) rotateY(${y}deg)`);assert.equal(E.dieTransform(n,3),`rotateX(${x+1080}deg) rotateY(${y+1080}deg)`);}
});
test('cursor throws reject clicks and jitter, accept swings, and bound visual travel',()=>{
 assert.equal(E.diceThrow(5,4,7),null);assert.equal(E.diceThrow(NaN,1,40),null);assert.deepEqual(E.diceThrow(30,-40,50),{x:30,y:-40});assert.deepEqual(E.diceThrow(0,0,60),{x:0,y:-55});const far=E.diceThrow(500,500,710);assert.ok(Math.hypot(far.x,far.y)<97);
});
test('game token totals combine seats by provider and model without double-counting cached input',()=>{
 const rows=U.aggregate([{id:1,type:'ollama',model:'test',input:100,output:20,cached:80,calls:1},{id:2,type:'ollama',model:'test',input:200,output:30,cached:150,calls:2},{id:3,type:'codex',model:'test',input:50,output:10,cached:0,calls:1}]);
 assert.equal(rows.length,2);assert.equal(rows[0].input,300);assert.equal(rows[0].output,50);assert.equal(rows[0].total,350);assert.equal(rows[0].cached,230);assert.deepEqual(rows[0].seats,[1,2]);assert.equal(rows[0].calls,3);
});
test('euro API estimates use uncached input, reported API cache and output at separate rates',()=>{
 const r=U.estimate({type:'codex',input:1e6,output:1e5,cached:8e5},U.rateFor('gpt-6-sol'),1.113);assert.ok(Math.abs(r.usd-1.56)<1e-10);assert.ok(Math.abs(r.eur-1.56/1.113)<1e-10);assert.equal(r.cachedDiscountApplied,8e5);
});
test('local KV-cache hits do not imply API billing discounts and unknown rates stay unpriced',()=>{
 const row={type:'ollama',input:1e6,output:1e5,cached:9e5};const r=U.estimate(row,U.rateFor('gpt-oss:20b'),1);assert.equal(r.cachedDiscountApplied,0);assert.equal(r.usd,.105);assert.equal(U.estimate(row,U.rateFor('unknown')),null);assert.equal(U.estimate(row,{input:1,output:1,cached:-1}),null);assert.equal(U.estimate(row,{input:1,output:1},0),null);
});

test('shared dice animation settles on every requested face and honors the drag launch',()=>{
 for(let value=1;value<=6;value++)for(let index=0;index<2;index++){
  const f=E.diceRollFrames(value,index,{x:50,y:-40});
  assert.equal(f.cube.at(-1).transform,E.dieTransform(value,index?3:2));
  assert.match(f.body[0].transform,new RegExp('translate3d\\('+(index?85:10)+'px,-25px'));
  assert.equal(f.body.at(-1).transform,`translate3d(0,0,0) scale(1) rotateZ(${index?9:-8}deg)`);
  assert.ok(!JSON.stringify(E.diceRollFrames(value,index,{x:NaN,y:Infinity})).includes('NaN'));
 }
});
