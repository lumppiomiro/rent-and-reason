'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../model-compatibility.js'),P=require('../provider-pieces.js'),{Game,PIECES}=require('../engine.js'),E=require('../experience.js');
const model=(id='vendor/reasoner',extra={})=>({id,context_length:65536,supported_parameters:['response_format','structured_outputs'],architecture:{input_modalities:['text'],output_modalities:['text']},top_provider:{context_length:65536,max_completion_tokens:8192},...extra});
test('game model filter excludes asynchronous, media, specialist, base and expired entries',()=>{
 for(const id of ['vendor/model:batch','vendor/model:batch:free','openai/gpt-audio','google/gemini-3-pro-image','google/gemini-nano-banana-2.1','openai/gpt-oss-safeguard-20b','vendor/llama-guard','vendor/text-embedding','vendor/reranker','vendor/nuextract','bytedance/ui-tars-1.5-7b','perceptron/perceptron-mk1.5','perplexity/sonar-pro','vendor/deep-research','openrouter/auto','vendor/reasoner-base'])assert.ok(C.reason(model(id)),id);
 assert.equal(C.reason(model('vendor/expired',{expiration_date:'2020-01-01'})),'expired');
 assert.equal(C.reason(model('vendor/future',{expiration_date:'2099-01-01'})),'');
});
test('game filter requires schema output, text input/output and room for context and reasoning',()=>{
 assert.equal(C.reason(model()),'');
 assert.equal(C.reason(model('vendor/vision',{architecture:{input_modalities:['text','image'],output_modalities:['text']}})),'');
 assert.equal(C.reason(model('vendor/json-only',{supported_parameters:['response_format']})),'json');
 assert.equal(C.reason(model('vendor/missing-format',{supported_parameters:['structured_outputs']})),'json');
 assert.equal(C.reason(model('vendor/short',{context_length:32767})),'context');
 assert.equal(C.reason(model('vendor/short-provider',{top_provider:{context_length:8192,max_completion_tokens:8192}})),'context');
 assert.equal(C.reason(model('vendor/tiny-output',{top_provider:{max_completion_tokens:2048}})),'output');
 assert.equal(C.reason(model('vendor/voice-model',{architecture:{input_modalities:['audio'],output_modalities:['text']}})),'input');
 assert.equal(C.reason(model('vendor/multimedia',{architecture:{input_modalities:['text'],output_modalities:['text','image']}})),'media');
 assert.ok(C.reason({id:'vendor/missing',gameCompatible:true}));
});
test('free models and general-purpose coding-capable models remain eligible; moving aliases stay out of the picker',()=>{
 for(const id of ['openai/gpt-oss-20b:free','google/gemini-flash','openai/gpt-5.3-codex','qwen/qwen3-coder-next','deepseek/deepseek-v4.1-flash'])assert.equal(C.reason(model(id)),'',id);
 assert.equal(C.visible(model('~deepseek/deepseek-flash-latest')),false);assert.equal(C.reason(model('~deepseek/deepseek-flash-latest')),'');
});
test('browser filters an older host without restarting the game; verified fresh metadata supersedes the snapshot',()=>{
 assert.equal(C.visible({id:'openai/gpt-audio',contextLength:128000}),false);
 assert.equal(C.visible({id:'anthropic/claude-sonnet:batch',contextLength:128000}),false);
 assert.equal(C.visible({id:'mistralai/mistral-small-3.1-24b-instruct',contextLength:128000}),false);
 assert.equal(C.visible({id:'meta-llama/llama-4-scout',contextLength:327680}),false);
 assert.equal(C.visible({id:'mistralai/mistral-small-3.1-24b-instruct',contextLength:128000,gameCompatible:true}),true);
 assert.equal(C.visible({id:'deepseek/deepseek-v4.1-flash',contextLength:1000000}),true);
});
test('provider and model pieces follow the selected model while respecting manual choices',()=>{
 assert.equal(P.ids.length,18);
 for(const [type,model,want] of [['codex','gpt-example','codex'],['claude','claude-example','claude'],['ollama','qwen3:8b','qwen'],['openrouter','anthropic/claude-example','claude'],['openrouter','meta-llama/llama-example','llama'],['openrouter','xiaomi/mimo-example','xiaomi'],['gemini','gemini-example','gemini'],['compatible','unknown','compatible']]){
  assert.equal(P.controllerPiece({type,model}),want);
  const g=new Game({players:[{type:'human'},{type,model}]});assert.equal(E.playerLooks(g.s)[1].piece,want);
  assert.equal(E.playerLooks(g.s,{1:{piece:'beacon'}})[1].piece,'beacon');
 }
 const before={type:'ollama',model:'qwen3:8b',piece:'qwen'},p={...before,model:'gemma3:12b'};P.syncPiece(p,before);assert.equal(p.piece,'gemma');
 p.piece='beacon';p._pieceManual=true;P.syncPiece(p);assert.equal(p.piece,'beacon');
 p._pieceManual=false;P.syncPiece(p);assert.equal(p.piece,'gemma');
 const custom={...before,piece:'leaf'};P.syncPiece(custom,before);assert.equal(custom.piece,'leaf');
});
test('shared provider pieces retain seat colours and survive save/resume',()=>{
 const g=new Game({players:[{type:'ollama',model:'qwen3:8b'},{type:'ollama',model:'qwen3:8b'}]});
 assert.equal(g.s.players[0].piece,'qwen');assert.equal(g.s.players[1].piece,'qwen');assert.notEqual(g.s.players[0].color,g.s.players[1].color);
 assert.equal(Game.load(g.s).s.players[1].piece,'qwen');assert.equal(g.setPiece(0,'claude'),true);assert.equal(g.setPiece(1,'claude'),true);
 assert.equal(g.setPiece(0,'beacon'),true);assert.equal(g.setPiece(1,'beacon'),false);
});
test('standalone badge definitions cover every engine piece with visible offline vector paths',()=>{
 const c=vm.createContext({});for(const file of ['provider-pieces.js','art.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c);
 const ids=vm.runInContext('RentReasonArt.pieces.map(p=>p[0])',c);assert.equal(ids.length,38);assert.equal(new Set(ids).size,38);
 const defs=vm.runInContext('RentReasonArt.defs',c);for(const id of PIECES)assert.ok(defs.includes('id="art-'+id+'"'));
 for(const id of P.ids)assert.match(P.symbols[id],/<path[^>]+d=/,id);
 assert.equal(/https?:|<script|href=|url\(/.test(defs),false);
});
test('provider asset provenance hashes and upstream licenses are included',()=>{
 const crypto=require('node:crypto'),dir=path.join(__dirname,'../assets/provider-logos'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'sources.json'),'utf8'));
 for(const icon of manifest.icons){const data=fs.readFileSync(path.join(dir,icon.slug+'.svg'));assert.equal(crypto.createHash('sha256').update(data).digest('hex'),icon.sha256,icon.slug);assert.match(icon.url,/^https:\/\/github.com\//);}
 assert.match(fs.readFileSync(path.join(dir,'LICENSE.md'),'utf8'),/Copyright \(c\) 2023 LobeHub/);
 assert.match(fs.readFileSync(path.join(dir,'SIMPLE-ICONS-LICENSE.md'),'utf8'),/CC0 1.0 Universal/);
});
