/* Offline Finnish catalogue. Translation never changes action IDs or user speech. */
(function(root){
'use strict';
const FI={};
function add(entries){Object.assign(FI,entries);compiled=null;lower=null;}
let compiled=null,lower=null;
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function patterns(){if(!compiled)compiled=Object.entries(FI).filter(([s,t])=>/\{\d+\}/.test(s)&&s!==t).sort((a,b)=>b[0].replace(/\{\d+\}/g,'').length-a[0].replace(/\{\d+\}/g,'').length).map(([s,t])=>({re:new RegExp('^'+s.split(/(\{\d+\})/).map((p,i)=>/^\{\d+\}$/.test(p)?(i===1&&s.startsWith('{')?'([^\\n.!?]{1,60})':'([\\s\\S]+?)'):escape(p)).join('')+'$','i'),to:t,actor:/^\{0\} (?:roll(?:s)?|land(?:s)?|buy(?:s)?|bid(?:s)?|pass(?:es)?|win(?:s)?|go(?:es)?|mortgage(?:s)?|unmortgage(?:s)?|stay(?:s)?|leave(?:s)?|pay(?:s)?|build(?:s)?|sell(?:s)?|collect(?:s)?|(?:is|are) bankrupt)/.test(s),keys:[...s.matchAll(/\{(\d+)\}/g)].map(m=>m[1])}));return compiled;}
function translate(text,language='en',depth=0,protectedValues=null){if(language!=='fi'||typeof text!=='string'||!text.trim())return text;const trim=text.trim();if(protectedValues?.has(trim))return text;const space=text.match(/^\s*/)[0],end=text.match(/\s*$/)[0];let result=FI[trim];if(result===undefined){const punct=trim.match(/^(.*?)([.!])$/);if(punct&&FI[punct[1]]!==undefined)result=FI[punct[1]]+punct[2];if(!lower)lower=new Map(Object.entries(FI).map(([k,v])=>[k.toLowerCase(),v]));const entry=lower.get(trim.toLowerCase());if(entry!==undefined)result=trim===trim.toUpperCase()?entry.toLocaleUpperCase('fi-FI'):entry;}
 if(result===undefined&&depth<3)for(const p of patterns()){const m=trim.match(p.re);if(m){if(p.actor&&!protectedValues?.has(m[1]))continue;const values={};p.keys.forEach((k,i)=>values[k]=translate(m[i+1],language,depth+1,protectedValues));result=p.to.replace(/\{(\d+)\}/g,(_,k)=>values[k]??'');break;}}
 if(result===undefined&&depth<2&&trim.includes(' · '))result=trim.split(' · ').map(s=>translate(s,language,depth+1,protectedValues)).join(' · ');if(result===undefined&&depth<2&&trim.includes('. '))result=translate(trim.slice(0,trim.indexOf('. ')+1),language,depth+1,protectedValues)+' '+translate(trim.slice(trim.indexOf('. ')+2),language,depth+1,protectedValues);
 if(result===undefined&&depth<2&&trim.includes(': '))result=translate(trim.slice(0,trim.indexOf(': ')),language,depth+1,protectedValues)+': '+translate(trim.slice(trim.indexOf(': ')+2),language,depth+1,protectedValues);
 return space+(result??trim)+end;
}
function money(value,state,language=state?.language||'en'){const currency=state?.currency||(root.RentReasonBoards||(typeof require==='function'?require('./boards.js'):null)).currency(state);return new Intl.NumberFormat(language==='fi'?'fi-FI':currency==='GBP'?'en-GB':'en-US',{style:'currency',currency,minimumFractionDigits:0,maximumFractionDigits:0}).format(Math.round(value));}
function install(document,{language=()=> 'en',currency=()=> 'USD',names=()=>[]}={}){
 const originals=new WeakMap(),attrs=new WeakMap();let observer;
 const skip=node=>node.parentElement?.closest('script,style,code,textarea,[contenteditable],[data-no-translate],[data-speech]');
 function text(node){if(skip(node))return;const old=originals.get(node),source=old&&node.nodeValue===old.last?old.source:node.nodeValue;let value=translate(source,language(),0,new Set(names()));if(!node.parentElement?.closest('[data-currency-literal]'))value=value.replace(/\$(\d[\d,]*(?:\.\d+)?)/g,(_,n)=>money(Number(n.replace(/,/g,'')),{currency:currency()},language()));originals.set(node,{source,last:value});if(node.nodeValue!==value)node.nodeValue=value;}
 function element(el){if(el.closest?.('[data-no-translate]'))return;let map=attrs.get(el);if(!map){map={};attrs.set(el,map);}for(const name of ['aria-label','aria-description','title','placeholder'])if(el.hasAttribute(name)){const current=el.getAttribute(name),old=map[name],source=old&&current===old.last?old.source:current;let value=translate(source,language(),0,new Set(names()));if(!el.closest('[data-currency-literal]'))value=value.replace(/\$(\d[\d,]*(?:\.\d+)?)/g,(_,n)=>money(Number(n.replace(/,/g,'')),{currency:currency()},language()));map[name]={source,last:value};if(current!==value)el.setAttribute(name,value);}}
 function walk(rootNode=document.body){if(!rootNode)return;observer?.disconnect();if(rootNode.nodeType===3)text(rootNode);else{if(rootNode.nodeType===1)element(rootNode);const walker=document.createTreeWalker(rootNode,5);let n;while(n=walker.nextNode())if(n.nodeType===3)text(n);else element(n);}document.documentElement.lang=language();document.title=language()==='fi'?'Rent & Reason · Oma pelipöytä':'Rent & Reason · Lantern Harbor';observer?.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-label','aria-description','title','placeholder']});}
 observer=new MutationObserver(records=>{const roots=new Set(records.map(r=>r.target));for(const r of roots)walk(r);});walk();return {refresh:walk,disconnect:()=>observer.disconnect()};
}
function html(source,language='en',names=[]){
 if(language!=='fi'||!root.DOMParser)return source;
 const doc=new root.DOMParser().parseFromString(source,'text/html'),protectedValues=new Set(names);
 function visit(node){if(node.nodeType===3){if(!node.parentElement?.closest('script,style,code,textarea,[data-no-translate],[data-speech]'))node.nodeValue=translate(node.nodeValue,language,0,protectedValues);return;}
  if(node.nodeType===1){if(node.closest('[data-no-translate],[data-speech]'))return;for(const attr of ['aria-label','title','placeholder'])if(node.hasAttribute(attr))node.setAttribute(attr,translate(node.getAttribute(attr),language,0,protectedValues));if(node.tagName==='TEMPLATE')visit(node.content);}
  for(const child of [...node.childNodes])visit(child);
 }
 visit(doc.body);doc.title=translate(doc.title,language,0,protectedValues);doc.documentElement.lang=language;return '<!doctype html>'+doc.documentElement.outerHTML;
}
const api={FI,add,translate,money,install,html};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonI18n=api;
})(globalThis);
