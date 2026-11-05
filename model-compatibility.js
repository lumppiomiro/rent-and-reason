/* Game requirements, shared by OpenRouter discovery and the browser picker. */
(function(root){
'use strict';
const MIN_CONTEXT=32768,MIN_OUTPUT=4096;
// Older running hosts omit parameter/output metadata. These public-catalog
// exclusions (2026-10-30) bridge that gap without restarting an active game.
// A freshly verified backend result supersedes this compatibility snapshot.
const LEGACY_UNSUITABLE=new Set(['meta-llama/llama-4-scout','perceptron/perceptron-mk1.5','sakana/fugu-ultra-v2','sakana/fugu-max','nex-agi/nex-n2.5-mini','nex-agi/nex-n2.5-pro','sakana/sakana-namazu','sakana/fugu-ultra','perceptron/perceptron-mk1','perplexity/sonar-pro-search','bytedance/ui-tars-1.5-7b','mistralai/mistral-small-3.1-24b-instruct','rekaai/reka-flash-3','cohere/command-r7b-12-2024','thedrummer/unslopnemo-12b','meta-llama/llama-3.2-3b-instruct','cohere/command-r-08-2024','cohere/command-r-plus-08-2024','sao10k/l3.1-euryale-70b','nousresearch/hermes-3-llama-3.1-70b']);
function reason(m,{partial=false,now=Date.now()}={}){
 if(!m||typeof m.id!=='string'||!m.id||m.id.length>150)return'invalid';
 const id=m.id.toLowerCase();
 if(/:batch(?:$|:)/.test(id)||m.batch_only===true)return'batch';
 if(/(?:^|[\/_-])(?:image|audio|tts|asr|whisper|transcription|ocr)(?:$|[-_:])/.test(id)||/nano-banana/.test(id))return'media';
 if(/(?:^|[\/_-])(?:embeddings?|rerank(?:er)?|reward|moderation|safeguard|guard|nuextract)(?:$|[-_:])/.test(id)||/ui-tars|perceptron-mk|deep-research/.test(id)||id.startsWith('perplexity/sonar'))return'specialist';
 if(id.startsWith('openrouter/'))return'router';
 if(/(?:^|[-/])base(?:$|:)/.test(id))return'base';
 if(m.expiration_date&&Number.isFinite(Date.parse(m.expiration_date))&&Date.parse(m.expiration_date)<=now)return'expired';
 if(partial&&m.gameCompatible===true)return'';
 if(partial&&LEGACY_UNSUITABLE.has(m.id))return'capabilities';
 const a=m.architecture;
 if(a?.input_modalities&&!a.input_modalities.includes('text'))return'input';
 if(a?.output_modalities&&(a.output_modalities.length!==1||a.output_modalities[0]!=='text'))return'media';
 if(!partial&&(!a?.input_modalities?.includes('text')||!a?.output_modalities))return'capabilities';
 if((!partial||m.contextLength!=null||m.context_length!=null)&&!(Number(m.context_length??m.contextLength)>=MIN_CONTEXT))return'context';
 const params=m.supported_parameters??m.parameters;
 if((!partial||params)&&(!params?.includes('structured_outputs')||!params?.includes('response_format')))return'json';
 const output=m.top_provider?.max_completion_tokens??m.maxOutput;
 if(output!=null&&(!Number.isFinite(Number(output))||Number(output)<MIN_OUTPUT))return'output';
 const context=m.top_provider?.context_length;
 if(context!=null&&Number(context)<MIN_CONTEXT)return'context';
 return'';
}
function visible(m){return!m?.id?.startsWith('~')&&!reason(m,{partial:true});}
const api={MIN_CONTEXT,MIN_OUTPUT,reason,visible};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonModelCompatibility=api;
})(globalThis);
