/* Saved active play time. Restoring a host never counts its offline interval. */
(function(root){
'use strict';
class GameClock{
 constructor(saved=null,{now=()=>Date.now(),legacy=false,finished=false}={}){this.now=now;this.anchor=null;this.data={version:1,createdAt:saved?.createdAt||new Date(now()).toISOString(),startedAt:saved?.startedAt||null,finishedAt:saved?.finishedAt||null,playedMs:Math.max(0,Number(saved?.playedMs)||0),coverage:saved?.coverage||(legacy?'partial':'complete')};if(finished&&!saved?.startedAt)this.data.coverage='unrecorded';}
 resume(){if(this.data.finishedAt||this.data.coverage==='unrecorded')return;const n=this.now();this.data.startedAt??=new Date(n).toISOString();if(this.anchor===null)this.anchor=n;}
 pause(){if(this.anchor!==null){this.data.playedMs+=Math.max(0,this.now()-this.anchor);this.anchor=null;}}
 finish(){this.pause();if(this.data.startedAt)this.data.finishedAt??=new Date(this.now()).toISOString();}
 save(){const d={...this.data};if(this.anchor!==null)d.playedMs+=Math.max(0,this.now()-this.anchor);return d;}
 sample(){return{...this.save(),running:this.anchor!==null,sampledAt:this.now()};}
}
function format(ms){const s=Math.floor(Math.max(0,ms)/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return(h?h+':':'')+String(m).padStart(h?2:1,'0')+':'+String(s%60).padStart(2,'0');}
const api={GameClock,format};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonGameTime=api;
})(globalThis);
