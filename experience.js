/* Dependency-free presentation geometry shared with UI checks. */
(function(root){
'use strict';
const DIE_FACES=[{n:1,x:0,y:0},{n:6,x:0,y:180},{n:3,x:0,y:90},{n:4,x:0,y:-90},{n:2,x:90,y:0},{n:5,x:-90,y:0}];
const DIE_ROTATIONS={1:[0,0],2:[-90,0],3:[0,-90],4:[0,90],5:[90,0],6:[0,180]};
const PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
// A closed chamfered solid: rounded independent face cards leave holes at the
// corners when they turn. These 26 adjoining planes share the same vertices.
const DIE_BEVEL=.08;
function dieRotate([a,b,c],x,y){x*=Math.PI/180;y*=Math.PI/180;const u=a*Math.cos(y)+c*Math.sin(y),w=-a*Math.sin(y)+c*Math.cos(y);return[u,b*Math.cos(x)-w*Math.sin(x),b*Math.sin(x)+w*Math.cos(x)];}
function dieSurface(kind,vertices,n){
 const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>a.map(v=>v/Math.hypot(...a)),fmt=v=>String(Math.abs(v)<1e-8?0:Number(v.toFixed(8)));
 const origin=vertices[0].map((_,i)=>vertices.reduce((s,p)=>s+p[i],0)/vertices.length);let normal=unit(cross(sub(vertices[1],vertices[0]),sub(vertices[2],vertices[0])));
 if(dot(normal,origin)<0){vertices=[vertices[0],...vertices.slice(1).reverse()];normal=normal.map(v=>-v);}
 const u=unit(sub(vertices[1],vertices[0])),v=cross(normal,u),points=vertices.map(p=>[dot(sub(p,origin),u),dot(sub(p,origin),v)]),min=[0,1].map(i=>Math.min(...points.map(p=>p[i]))),max=[0,1].map(i=>Math.max(...points.map(p=>p[i]))),size=max.map((a,i)=>a-min[i]),center=origin.map((a,i)=>a+u[i]*(min[0]+max[0])/2+v[i]*(min[1]+max[1])/2);
 const matrix=[...u,0,...v,0,...normal,0,0,0,0,1].map(fmt).join(','),clip=kind==='corner'?`;clip-path:polygon(${points.map(p=>p.map((a,i)=>fmt((a-min[i])/size[i]*100)+'%').join(' ')).join(',')})`:'';
 const shade=Math.round(91+5*Math.max(-1,Math.min(1,dot(normal,[-.3,-.5,.8]))));
 return{kind,n,vertices,normal,style:`--plane-width:${fmt(size[0])};--plane-height:${fmt(size[1])};--plane-half-width:${fmt(size[0]/2)};--plane-half-height:${fmt(size[1]/2)};--plane-x:${fmt(center[0])};--plane-y:${fmt(center[1])};--plane-z:${fmt(center[2])};--plane-rotation:matrix3d(${matrix});--facet-light:${shade}%${clip}`};
}
const DIE_SURFACES=(()=>{
 const h=.5,a=h-DIE_BEVEL,out=DIE_FACES.map(f=>dieSurface('face',[[-a,-a,h],[a,-a,h],[a,a,h],[-a,a,h]].map(p=>dieRotate(p,f.x,f.y)),f.n));
 for(let axis=0;axis<3;axis++)for(const s of [-1,1])for(const t of [-1,1]){const point=(along,b,c)=>{const p=[];p[axis]=along;p[(axis+1)%3]=s*b;p[(axis+2)%3]=t*c;return p;};out.push(dieSurface('edge',[point(-a,h,a),point(a,h,a),point(a,a,h),point(-a,a,h)]));}
 for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])out.push(dieSurface('corner',[[x*h,y*a,z*a],[x*a,y*h,z*a],[x*a,y*a,z*h]]));
 return out;
})();
function die(n){const [x,y]=DIE_ROTATIONS[n]||DIE_ROTATIONS[1];return `<span class="die dice-3d" aria-hidden="true"><span class="dice-cube" style="--rx:${x}deg;--ry:${y}deg">${DIE_SURFACES.map(f=>f.kind==='face'?`<span class="cube-face" data-face="${f.n}" style="${f.style}">${Array.from({length:9},(_,i)=>`<i class="${PIPS[f.n].includes(i)?'pip':''}"></i>`).join('')}</span>`:`<span class="dice-bevel dice-${f.kind}" style="${f.style}"></span>`).join('')}</span></span>`;}
function dieTransform(n,turns=0){const [x,y]=DIE_ROTATIONS[n]||DIE_ROTATIONS[1];return `rotateX(${x+turns*360}deg) rotateY(${y+turns*360}deg)`;}
// Identical tumble and bounce paths for game dice and the decorative home dice.
function diceRollFrames(value,index=0,launch={x:0,y:0}){
 const x=Number.isFinite(launch.x)?launch.x:0,y=Number.isFinite(launch.y)?launch.y:0,tilt=index?9:-8;
 return {cube:[{transform:'rotateX(-16deg) rotateY(-22deg) rotateX(0deg) rotateY(0deg)'},{transform:dieTransform(value,index?3:2)}],body:[
  {transform:`translate3d(${(index?35:-40)+x}px,${15+y}px,-80px) scale(.65) rotateZ(${index?30:-30}deg)`},
  {transform:`translate3d(${(index?-10:5)-x*.25}px,${-65-y*.2}px,40px) scale(1.08) rotateZ(${index?-18:15}deg)`,offset:.36},
  {transform:`translate3d(0,6px,0) scale(1) rotateZ(${tilt}deg)`,offset:.76},
  {transform:`translate3d(0,-10px,0) scale(1) rotateZ(${tilt}deg)`,offset:.87},
  {transform:`translate3d(0,0,0) scale(1) rotateZ(${tilt}deg)`}
 ]};
}
function diceThrow(dx,dy,reach){if(![dx,dy,reach].every(Number.isFinite)||reach<32)return null;const length=Math.hypot(dx,dy);return length<8?{x:0,y:-55}:{x:Math.round(dx/length*Math.min(96,length)),y:Math.round(dy/length*Math.min(96,length))};}
function playerLooks(state,overrides={}){
 const {PIECES,PLAYER_COLORS}=root.RentReason||require('./engine.js'),ProviderPieces=root.RentReasonProviderPieces||require('./provider-pieces.js'),used=new Set();
 return state.players.map(p=>{const o=overrides[p.id]||{},requested=[o.piece,p.piece,ProviderPieces.controllerPiece(state.controllers?.[p.id])].find(x=>PIECES.includes(x));const piece=PIECES.includes(requested)&&(!used.has(requested)||ProviderPieces.isLogo(requested))?requested:PIECES.find(x=>!used.has(x));used.add(piece);const color=[o.color,p.color,PLAYER_COLORS[p.id][0]].find(c=>PLAYER_COLORS.some(x=>x[0]===c));return{piece,color};});
}
// Older running hosts have no explicit trade event. Reconstruct a receipt only
// from authoritative ownership changes and an actual trade ledger / new log.
function withTradeReceipts(before,after,events=[]){
 if(events.some(e=>e.type==='trade')||!before?.props||events.some(e=>e.type==='bankrupt')||after.players.some((p,i)=>p.out&&!before.players[i]?.out))return events;
 const moves=after.props.flatMap((p,id)=>before.props[id].owner!==null&&p.owner!==null&&before.props[id].owner!==p.owner?[{id,from:before.props[id].owner,to:p.owner}]:[]);
 const money=events.filter(e=>e.type==='money'&&e.kind==='trade'),newLogs=(after.log||[]).filter(l=>!(before.log||[]).includes(l));
 if(!money.length&&!newLogs.some(l=>/complete a trade|accepts your trade|swap .+complete color sets/.test(l)))return events;
 const cashChanges=money.flatMap(e=>e.changes),first=moves[0],people=[...new Set(cashChanges.map(c=>c.player))];
 const from=first?.from??people[0],to=first?.to??people[1];if(from===undefined||to===undefined||from===to||moves.some(m=>![from,to].includes(m.from)||![from,to].includes(m.to)))return events;
 return[...events,{type:'trade',from,to,give:moves.filter(m=>m.from===from).map(m=>m.id),take:moves.filter(m=>m.from===to).map(m=>m.id),cashChanges,inferred:true,mortgages:Object.fromEntries(moves.map(m=>[m.id,after.props[m.id].mortgaged]))}];
}
function tradeGroups(game,from,to,give,take){
 const board=game.board;
 const props=game.s.props.map(p=>({...p}));give.forEach(i=>props[i].owner=to);take.forEach(i=>props[i].owner=from);
 const groups=[...new Set(board.filter(b=>b.workshop).map(b=>b.group))];
 return[from,to].flatMap(id=>groups.filter(group=>{const streets=board.filter(b=>b.group===group);return streets.every(b=>props[b.id].owner===id)&&!streets.every(b=>game.s.props[b.id].owner===id);}).map(group=>({id,name:game.s.players[id].name,group})));
}
const api={DIE_FACES,DIE_ROTATIONS,DIE_SURFACES,die,dieTransform,diceRollFrames,diceThrow,tradeGroups,playerLooks,withTradeReceipts};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonExperience=api;
})(globalThis);
