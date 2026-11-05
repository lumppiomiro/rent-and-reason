/* Shared provider labels and endpoints; no account details or credentials. */
(function(root){
'use strict';
const API=Object.freeze({
 openai:{name:'OpenAI API',url:'https://api.openai.com/v1',format:'schema',keyUrl:'https://platform.openai.com/api-keys',description:'Use an OpenAI API key and API billing. Separate from a ChatGPT subscription.'},
 gemini:{name:'Google Gemini API',url:'https://generativelanguage.googleapis.com/v1beta/openai',format:'schema',keyUrl:'https://aistudio.google.com/apikey',description:'Connect with your Gemini API key.'},
 deepseek:{name:'DeepSeek API',url:'https://api.deepseek.com/v1',format:'json',keyUrl:'https://platform.deepseek.com/api_keys',description:'Use your own DeepSeek account and API key.'},
 groq:{name:'Groq API',url:'https://api.groq.com/openai/v1',format:'json',keyUrl:'https://console.groq.com/keys',description:'Choose a text model available to your Groq account.'},
 lmstudio:{name:'LM Studio · local',url:'http://127.0.0.1:1234/v1',format:'json',local:true,description:'Start the server in LM Studio’s Developer tab, then connect. No key needed unless you enabled authentication.'},
 compatible:{name:'Custom endpoint',url:'http://127.0.0.1:8080/v1',format:'json',custom:true,description:'Connect a server offering OpenAI-compatible /models and /chat/completions endpoints.'}
});
const BASE=[['ollama','Ollama · local'],['codex','Codex · subscription'],['claude','Claude Code · subscription'],['openrouter','OpenRouter API']];
const TYPES=Object.freeze([...BASE.map(([type])=>type),...Object.keys(API)]);
const CHOICES=Object.freeze([...BASE,...Object.entries(API).map(([type,p])=>[type,p.name])]);
const api={API,TYPES,CHOICES};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonProviders=api;
})(globalThis);
