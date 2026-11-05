'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../engine.js');
const source=fs.readFileSync(require.resolve('../ai-ui.js'),'utf8').split('function remoteView(')[0];
function client(error){const c=vm.createContext({RentReason:M,fetch:async()=>({ok:false,status:400,json:async()=>({error})})});vm.runInContext(source+"\naiHost={token:'test'};",c);return c;}
test('a newly supported badge rejected by an older host explains how to restart without losing the game',async()=>{
 const c=client('Choose a valid playing piece.');await assert.rejects(vm.runInContext("api('characters',{action:'profile',profile:{piece:'beacon'}})",c),e=>e.status===400&&/newer pieces or colours/.test(e.message)&&/Play Rent & Reason.command/.test(e.message)&&/preserved/.test(e.message));
});
test('stale hosts also explain new roster-piece and palette validation errors',async()=>{
 await assert.rejects(vm.runInContext("api('table',{players:[{piece:'kite'}]})",client('Choose a valid piece.')),/Play Rent & Reason.command/);
 await assert.rejects(vm.runInContext("api('character',{profile:{color:'#50b9a2'}})",client('Choose a valid player colour.')),/Play Rent & Reason.command/);
});
test('invalid local selections and unrelated host errors keep their original validation message',async()=>{
 await assert.rejects(vm.runInContext("api('characters',{profile:{piece:'unknown'}})",client('Choose a valid playing piece.')),e=>e.message==='Choose a valid playing piece.');
 await assert.rejects(vm.runInContext("api('characters',{profile:{piece:'beacon'}})",client('Characters changed.')),e=>e.message==='Characters changed.');
});
