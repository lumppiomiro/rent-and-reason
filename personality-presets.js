/* Provider-independent personality presets. No model calls or credentials. */
(function(root){
'use strict';
const KEY='offline-rent-reason-personality-presets-v1',MAX_PRESETS=50;
const STRATEGIES=[['balanced','Balanced'],['builder','Builder'],['trader','Negotiator'],['defensive','Defensive']];
const VOICES=[['natural','Natural'],['witty','Witty'],['friendly','Friendly'],['dramatic','Dramatic'],['competitive','Competitive'],['deadpan','Deadpan']];
const CHATTINESS=[['quiet','Quiet'],['normal','Normal'],['lively','Lively']];
const has=(list,value)=>list.some(([id])=>id===value),copy=value=>JSON.parse(JSON.stringify(value));
function normalize(p={},type=p?.type){p=p&&typeof p==='object'?p:{};return{personality:has(STRATEGIES,p.personality)?p.personality:'balanced',voice:has(VOICES,p.voice)?p.voice:type==='codex'?'witty':type==='claude'?'deadpan':'natural',chattiness:has(CHATTINESS,p.chattiness)?p.chattiness:'normal',customVoice:typeof p.customVoice==='string'?p.customVoice.trim().slice(0,180):''};}
class Library{
 constructor(storage){this.storage=storage;this.items=[];this.warning='';this.reload();}
 reload(){this.items=[];this.warning='';try{const raw=this.storage?.getItem(KEY);if(raw){const data=JSON.parse(raw);if(data.version!==1||!Array.isArray(data.presets))throw Error('Invalid preset library.');const names=new Set(),ids=new Set();this.items=data.presets.slice(0,MAX_PRESETS).flatMap(p=>{if(!p||typeof p.id!=='string'||!/^[\w-]{1,96}$/.test(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>40||ids.has(p.id)||names.has(p.name.trim().toLowerCase()))return[];ids.add(p.id);names.add(p.name.trim().toLowerCase());return[{id:p.id,name:p.name.trim(),profile:normalize(p.profile)}];});}}catch{this.warning='Saved presets could not be read in this browser.';}}
 all(){this.reload();return copy(this.items).sort((a,b)=>a.name.localeCompare(b.name));}
 get(id){const p=this.items.find(p=>p.id===id);return p?copy(p):null;}
 write(items){if(!this.storage)throw Error('Browser storage is unavailable. Enable local storage to save presets.');try{this.storage.setItem(KEY,JSON.stringify({version:1,presets:items}));}catch{throw Error('This browser could not save the preset. Check its storage permissions or available space.');}this.items=items;this.warning='';}
 save(name,profile,id=null){this.reload();name=typeof name==='string'?name.trim():'';if(!name||name.length>40)throw Error('Give the preset a name of 1–40 characters.');if(id&&!this.get(id))throw Error('This preset was removed. Choose another preset or save a new one.');if(this.items.some(p=>p.id!==id&&p.name.toLowerCase()===name.toLowerCase()))throw Error('A preset with this name exists. Choose another name or use Update saved preset.');if(!id&&this.items.length>=MAX_PRESETS)throw Error('You can save up to 50 personalities. Remove an unused preset first.');
  const entry={id:id||root.crypto?.randomUUID?.()||('preset-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),name,profile:normalize(profile)};
  this.write(id?this.items.map(p=>p.id===id?entry:p):[...this.items,entry]);return copy(entry);
 }
 remove(id){this.reload();if(!this.get(id))throw Error('This preset has already been removed.');this.write(this.items.filter(p=>p.id!==id));}
}
const api={KEY,MAX_PRESETS,STRATEGIES,VOICES,CHATTINESS,normalize,Library};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonPersonalityPresets=api;
})(globalThis);
