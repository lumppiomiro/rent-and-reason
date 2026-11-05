/* Token accounting and offline reference pricing; no credentials. USD per 1M tokens. */
(function(root){
'use strict';
const AS_OF='2026-10-30';
const FX={usdPerEur:1.113,date:'2026-10-29',source:'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html'};
const RATES={
 'gpt-6-sol':{input:2,cached:.2,write:2.5,output:10,label:'OpenAI Standard',source:'https://developers.openai.com/api/docs/models/gpt-6-sol'},
 'gpt-6-astra':{input:10,cached:1,write:12.5,output:50,label:'OpenAI Standard',source:'https://developers.openai.com/api/docs/models/gpt-6-astra'},
 'gpt-6-luna':{input:.1,cached:.01,write:.125,output:.5,label:'OpenAI Standard',source:'https://developers.openai.com/api/docs/models/gpt-6-luna'},
 'gpt-6.1-sol':{input:2,cached:.1,write:2.5,output:10,label:'OpenAI Standard',source:'https://developers.openai.com/api/docs/models/gpt-6.1-sol'},
 'gpt-oss:20b':{input:.075,cached:.037,output:.30,label:'Groq reference',source:'https://console.groq.com/docs/model/openai/gpt-oss-20b'}
};
function aggregate(metrics){
 const groups=new Map();for(const m of metrics){const key=JSON.stringify([m.type,m.model]);let x=groups.get(key);if(!x){x={key,type:m.type,model:m.model,seats:[],input:0,output:0,cached:0,cacheWrite:0,costUsd:0,costReports:0,cachedUnknown:false,calls:0,decisions:0,chatCalls:0,chatReplies:0,durationMs:0,incomplete:0};groups.set(key,x);}
 if(m.pricing)x.pricing=m.pricing;
 x.seats.push(m.id);for(const k of ['input','output','cacheWrite','calls','decisions','chatCalls','chatReplies','durationMs','incomplete','costUsd','costReports'])x[k]+=Number(m[k])||0;
 if(typeof m.cached==='number')x.cached+=Math.min(m.cached,Number(m.input)||0);else x.cachedUnknown=true;
 }return[...groups.values()].map(x=>({...x,total:x.input+x.output}));
}
function rateFor(model){return RATES[model]||null;}
function estimate(row,rates,usdPerEur=FX.usdPerEur){
 if(!rates||![row.input,row.output,rates.input,rates.output,usdPerEur].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)||usdPerEur===0||(rates.cached!=null&&!(typeof rates.cached==='number'&&Number.isFinite(rates.cached)&&rates.cached>=0)))return null;
 // Local KV-cache reuse does not prove that a hypothetical API would give a
 // cached-input discount. Ollama comparisons conservatively bill all input.
 const cached=['codex','claude','openrouter','openai','gemini','deepseek','groq','lmstudio','compatible'].includes(row.type)&&typeof rates.cached==='number'?Math.min(row.cached||0,row.input):0;
 const usd=((row.input-cached)*rates.input+cached*(rates.cached||0)+row.output*rates.output)/1e6;
 return{usd,eur:usd/usdPerEur,cachedDiscountApplied:cached,assumptions:'Standard text-token comparison. Excludes cache-write surcharges, tools, regional uplifts, VAT and currency fees. Interrupted requests can have incomplete usage.'};
}
const api={AS_OF,FX,RATES,aggregate,rateFor,estimate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonUsage=api;
})(globalThis);
