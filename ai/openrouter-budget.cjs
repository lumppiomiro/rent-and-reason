'use strict';
const DECISION_OUTPUT=16384,MAX_OUTPUT=32768,CHAT_REASONING_OUTPUT=8192,FINAL_RESERVE=2048;
const THOUGHT_BUDGET={low:4096,medium:8192,high:12288};
function reasons(info){return info.parameters?.includes('reasoning')||!!info.reasoning;}
function compactSchema(schema){const out=structuredClone(schema);for(const [field,max]of Object.entries({memory:500,rationale:300,say:240}))if(out.properties?.[field]?.type==='string')out.properties[field].maxLength=Math.min(out.properties[field].maxLength??max,max);return out;}
function budget(info,messages,schema,{outputLimit,learned=0,requested}={}){
 const input=Math.ceil((messages.reduce((n,m)=>n+Buffer.byteLength(m.content||'','utf8')+32,0)+Buffer.byteLength(JSON.stringify(schema),'utf8'))/3);
 const cap=Math.floor(Math.min(MAX_OUTPUT,info.maxOutput||Infinity,info.contextLength-input-512));
 const initial=outputLimit===undefined?Math.max(DECISION_OUTPUT,learned):reasons(info)?Math.max(outputLimit,CHAT_REASONING_OUTPUT):outputLimit;
 return{limit:Math.min(cap,requested??initial),cap,input};
}
function reasoning(info,effort,limit,outputLimit){
 if(!reasons(info))return undefined;
 // Only use an explicit thought budget when the catalog advertises support.
 // Other models retain the selected effort and get a larger combined allowance.
 if(info.reasoning?.supports_max_tokens){const reserve=Math.min(outputLimit??FINAL_RESERVE,Math.floor(limit/2));return{max_tokens:Math.min(THOUGHT_BUDGET[effort]||THOUGHT_BUDGET.medium,Math.max(1024,limit-reserve)),exclude:true};}
 return{effort,exclude:true};
}
function completeJson(text,schema){if(typeof text!=='string'||!text.trim())return false;try{const d=JSON.parse(text);return !!d&&typeof d==='object'&&!Array.isArray(d)&&(schema.required||[]).every(key=>Object.hasOwn(d,key));}catch{return false;}}
module.exports={DECISION_OUTPUT,MAX_OUTPUT,CHAT_REASONING_OUTPUT,compactSchema,budget,reasoning,completeJson};
