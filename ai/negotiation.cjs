'use strict';
const MAX_COUNTERS=1; // Per participant, rather than per negotiation.
function counterSeats(offer){
 if(Array.isArray(offer.counterSeats))return offer.counterSeats;
 // Older saves recorded only depth. One counter belongs to its author;
 // after two old counters, conservatively treat both seats as having used one.
 return (offer.depth||0)>1?[offer.from,offer.to]:(offer.depth||0)===1?[offer.from]:[];
}
function canCounter(offer,seat){return offer.to===seat&&!counterSeats(offer).includes(seat);}
function sameTerms(a,b){return a.from===b.from&&a.to===b.to&&a.giveCash-a.takeCash===b.giveCash-b.takeCash&&['give','take'].every(k=>JSON.stringify([...a[k]].sort((x,y)=>x-y))===JSON.stringify([...b[k]].sort((x,y)=>x-y)));}
function reversed(offer){return{from:offer.to,to:offer.from,give:offer.take,take:offer.give,giveCash:offer.takeCash,takeCash:offer.giveCash};}
function counterError(offer,seat,trade){
 if(!canCounter(offer,seat))return 'You have already made a counteroffer in this negotiation; accept or decline.';
 if(trade?.from!==seat||trade?.to!==offer.from)return 'A counteroffer must go back to the player who made this offer.';
 if(sameTerms(trade,reversed(offer)))return 'These are the same terms. Accept the offer, or change the cash or properties.';
 return '';
}
function validMetadata(offer){return offer.counterSeats===undefined||Array.isArray(offer.counterSeats)&&offer.counterSeats.length<=2&&new Set(offer.counterSeats).size===offer.counterSeats.length&&offer.counterSeats.every(id=>id===offer.from||id===offer.to)&&(offer.depth===0?offer.counterSeats.length===0:offer.counterSeats.includes(offer.from)&&offer.counterSeats.length<=offer.depth);}
module.exports={MAX_COUNTERS,counterSeats,canCounter,sameTerms,reversed,counterError,validMetadata};
