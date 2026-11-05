/* Original harbor badges and pictograms, with attributed provider marks. */
(function(root){
'use strict';
const drawings={
 comet:'<circle cx="46" cy="29" r="16"/><path d="M33 37 13 66l30-15M26 30 9 44m33 12-7 15"/>',
 acorn:'<path d="M24 35q0 31 16 35 16-4 16-35z"/><path d="M18 34q2-21 22-21t22 21zM40 13V6l9-4"/>',
 lantern:'<path d="M24 23h32v40H24zM20 66h40M19 20h42M31 20v-7q9-13 18 0v7"/><path d="m40 31 7 15-7 10-7-10z"/>',
 sail:'<path d="M39 12v46M35 16 13 51h22zm9 8 22 27H44zM10 59h60L58 70H23z"/>',
 leaf:'<path d="M64 12Q14 10 17 49q2 22 22 17 27-8 25-54ZM21 62l31-37M30 51l-1-17m11 6 13 1"/>',
 key:'<circle cx="29" cy="27" r="16"/><circle cx="29" cy="27" r="5"/><path d="m40 39 25 25m-5-5 7-7m-15 0 7-7"/>',
 moon:'<path d="M50 11a28 28 0 1 0 20 43A27 27 0 0 1 50 11Z"/><path d="m20 12 2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>',
 shell:'<path d="M40 67 11 39Q9 14 30 17q10-17 20 0 21-3 19 22L40 67ZM40 65V25M34 59 22 29m24 30 12-30"/>',
 kite:'<path d="m40 8 22 24-22 25-22-25zM18 32h44M40 8v49q16 11 0 18M40 67l-7-3 2 8"/>',
 compass:'<circle cx="40" cy="40" r="29"/><path d="m53 23-8 23-19 12 9-24zM40 6v8m0 52v8M6 40h8m52 0h8"/>',
 pearl:'<path d="M13 49q8 22 27 22t27-22M12 51l8-28 20 21 20-21 8 28z"/><circle cx="40" cy="36" r="15"/>',
 sprout:'<path d="M40 70V34Q12 39 12 15q26-3 28 19Q40 8 68 9q1 28-28 33M23 71h34"/>',
 quill:'<path d="M17 69 61 12Q24 9 20 42l5 8 12-1M17 69l5-20m17-17 15 1M31 42l12 1"/>',
 mountain:'<path d="M6 68 31 17l14 28 9-17 20 40zM22 35l9 8 7-9m8 12 8 6 6-10"/>',
 sun:'<circle cx="40" cy="40" r="17"/><path d="M40 5v11m0 48v11M5 40h11m48 0h11M15 15l8 8m34 34 8 8M15 65l8-8m34-34 8-8"/>',
 orbit:'<circle cx="40" cy="40" r="16"/><ellipse cx="40" cy="40" rx="35" ry="13" transform="rotate(-30 40 40)"/><circle cx="62" cy="14" r="5"/>',
 bell:'<path d="M18 58q9-7 9-24 0-17 13-17t13 17q0 17 9 24zM33 65q7 12 14 0M40 10v7"/>',
 book:'<path d="M40 21Q24 9 9 18v45q15-9 31 3 16-12 31-3V18q-15-9-31 3v45M18 29l13 2m-13 9 13 2m18-11 13-2m-13 13 13-2"/>',
 cloud:'<path d="M20 59a15 15 0 0 1-3-30 23 23 0 0 1 44-2 16 16 0 0 1 0 32z"/>',
 beacon:'<path d="m29 31-7 39h36l-7-39zM26 17h28v14H26zM23 17 40 7l17 10M17 71h46M32 44h16M29 56h22M40 18v12M8 23h10m44 0h10"/>'
};
const labels=['Comet','Acorn','Lantern','Sail','Leaf','Key','Moon','Shell','Kite','Compass','Pearl','Sprout','Quill','Mountain','Sun','Orbit','Bell','Book','Cloud','Beacon'];
const providerPieces=root.RentReasonProviderPieces||(typeof require==='function'?require('./provider-pieces.js'):null);
const originalPieceCount=Object.keys(drawings).length;
const pieces=[...Object.keys(drawings).map((id,i)=>[id,labels[i]]),...(providerPieces?.pieces||[])];
const aliases={train:'sail',chest:'book',bulb:'sun',faucet:'cloud',ring:'pearl',car:'leaf',police:'key',prisoner:'book'};
const frame=body=>`<circle cx="40" cy="40" r="37" fill="currentColor" stroke="#fff9ed" stroke-width="2"/><g transform="translate(8 8) scale(.8)" fill="none" stroke="#fff9ed" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
const brandSymbol='<symbol id="art-rent-reason" viewBox="0 0 600 120"><path d="M5 23h16l13 18-13 18H5z" fill="#cc9d57"/><text x="52" y="76" fill="currentColor" font-family="Georgia,serif" font-size="65" letter-spacing="-2">Rent <tspan fill="#cc9d57" font-style="italic">&amp;</tspan> Reason</text><path d="M52 94h490" stroke="#cc9d57" stroke-width="2"/></symbol>';
const symbols=Object.entries(drawings).map(([id,body])=>`<symbol id="art-${id}" viewBox="0 0 80 80">${frame(body)}</symbol>`).join('')+Object.entries(aliases).map(([id,target])=>`<symbol id="art-${id}" viewBox="0 0 80 80">${frame(drawings[target])}</symbol>`).join('');
const providerDefs=Object.entries(providerPieces?.symbols||{}).map(([id,body])=>`<symbol id="art-${id}" viewBox="0 0 80 80">${body}</symbol>`).join('');
const defs=`<svg class="art-definitions" width="0" height="0" aria-hidden="true"><defs>${brandSymbol}<linearGradient id="metal"><stop stop-color="#42654e"/><stop offset="1" stop-color="#243f31"/></linearGradient>${symbols}${providerDefs}</defs></svg>`;
function icon(id,cls=''){return `<svg class="illustration ${cls}" viewBox="0 0 80 80" aria-hidden="true" style="color:#42654e"><use href="#art-${aliases[id]||id}"/></svg>`;}
function piece(id,cls=''){return `<svg class="piece-art ${cls}" viewBox="0 0 80 80" aria-hidden="true" style="color:#42654e"><use href="#art-${drawings[id]||providerPieces?.isLogo(id)?id:'comet'}"/></svg>`;}
root.RentReasonArt={defs,icon,piece,pieces,originalPieceCount};
})(globalThis);
