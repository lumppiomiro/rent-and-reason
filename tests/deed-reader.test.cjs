'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../engine.js'),T=require('../tabletop.js'),source=fs.readFileSync(require.resolve('../game-ui.js'),'utf8'),reader=source.slice(source.indexOf('function deedReadingContent('),source.indexOf('function openDeedReader('));
function html(game,id){const c=vm.createContext({game,B:game.board,Tabletop:T,View:{card:()=>'<div>Printed deed</div>'},esc:s=>s,playerColor:()=> '#c8322e',money:n=>'£'+n,deedReaderIds:[id],id});vm.runInContext(reader,c);return vm.runInContext('deedReadingContent(id)',c);}
test('the deed reader uses canonical rent, including mortgages and the no-rent-in-jail rule',()=>{
 const g=new M.Game({boardId:'lantern-harbor'});g.s.props[37].owner=0;g.s.props[39].owner=0;let before=JSON.stringify(g.s);assert.match(html(g,39),/Current rent<\/dt><dd>£100/);assert.equal(JSON.stringify(g.s),before);
 g.s.rules.noRentInJail=true;g.s.players[0].inJail=true;before=JSON.stringify(g.s);assert.match(html(g,39),/Current rent<\/dt><dd>£0/);assert.match(html(g,39),/no rent due/);assert.equal(JSON.stringify(g.s),before);
 g.s.players[0].inJail=false;g.s.props[39].mortgaged=true;assert.match(html(g,39),/Mortgaged<\/dt><dd>£0/);
 assert.match(html(g,5),/Base rent<\/dt><dd>£25/);g.s.props[12].owner=0;g.s.props[28].owner=0;assert.match(html(g,12),/Rent × dice<\/dt><dd>10×/);
});
