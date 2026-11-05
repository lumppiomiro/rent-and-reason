/* Lantern Harbor: original fictional places, event writing, and board identity. */
(function(root){
'use strict';
const ID='lantern-harbor';
const EDITIONS=Object.freeze({[ID]:Object.freeze({id:ID,name:'Lantern Harbor',nameFi:'Lyhtysatama',currency:'USD',version:1})});
const BOARD=[];
const special=(name,type,extra={})=>BOARD.push(Object.freeze({id:BOARD.length,name,type,...extra}));
const street=(name,group,price,rent,workshop)=>special(name,'street',{group,price,rent:Object.freeze(rent),workshop});
const rail=name=>special(name,'rail',{group:'rail',price:200});
const utility=name=>special(name,'utility',{group:'utility',price:150});
special('Harbor Gate','go');
street('Pebble Lane','brown',60,[2,10,30,90,160,250],50);special('Town Dispatch','chest');
street('Driftwood Row','brown',60,[4,20,60,180,320,450],50);special('Harbor Levy','tax',{amount:200});rail('West Ferry');
street('Copper Walk','sky',100,[6,30,90,270,400,550],50);special('Tide & Turn','chance');
street('Kettle Court','sky',100,[6,30,90,270,400,550],50);street('Tinker Yard','sky',120,[8,40,100,300,450,600],50);special('Permit Office','jail');
street('Moss Arcade','pink',140,[10,50,150,450,625,750],100);utility('Wind Cooperative');
street('Fern Terrace','pink',140,[10,50,150,450,625,750],100);street('Clover Steps','pink',160,[12,60,180,500,700,900],100);rail('North Ferry');
street('Saffron Market','orange',180,[14,70,200,550,750,950],100);special('Town Dispatch','chest');
street('Orchard Exchange','orange',180,[14,70,200,550,750,950],100);street('Apricot Square','orange',200,[16,80,220,600,800,1000],100);special('Common Green','parking');
street('Coral Quay','red',220,[18,90,250,700,875,1050],150);special('Tide & Turn','chance');
street('Rosewater Pier','red',220,[18,90,250,700,875,1050],150);street('Ember Docks','red',240,[20,100,300,750,925,1100],150);rail('East Ferry');
street('Honeycomb Hall','yellow',260,[22,110,330,800,975,1150],150);street('Sunbeam Studios','yellow',260,[22,110,330,800,975,1150],150);utility('Rainwater Guild');
street('Golden Atrium','yellow',280,[24,120,360,850,1025,1200],150);special('Permit Review','gotojail');
street('Juniper Rise','green',300,[26,130,390,900,1100,1275],200);street('Cedar Outlook','green',300,[26,130,390,900,1100,1275],200);special('Town Dispatch','chest');
street('Canopy Gardens','green',320,[28,150,450,1000,1200,1400],200);rail('South Ferry');special('Tide & Turn','chance');
street('Moonwake Point','blue',350,[35,175,500,1100,1300,1500],200);special('Festival Levy','tax',{amount:100});
street('Lantern Summit','blue',400,[50,200,600,1400,1700,2000],200);Object.freeze(BOARD);
// Original prose. All effects are explicit and validated by the engine.
const CHANCE=[
 ['The harbor bell calls you home. Return to Harbor Gate and collect $200.','move',0],
 ['Your new tenants are waiting at Ember Docks. Head over there.','move',24],
 ['A gardener has a proposal. Meet them at Moss Arcade.','move',11],
 ['Catch the next ferry. If its route is owned, pay twice the usual fare.','rail'],
 ['The late sailing is leaving. Take the next ferry; an owned route charges double.','rail'],
 ['Book a cooperative tour. Visit the next service, roll again, and pay ten times the total if owned.','utility'],
 ['Your rooftop weather station wins a $50 research grant.','cash',50],
 ['A clerk owes you a favor. Keep this pass to leave Permit Review without a fee.','free'],
 ['You left your ledger behind. Retrace three spaces.','back',3],
 ['Your permits need a closer look. Report to the Permit Office without collecting a gate payment.','jail'],
 ['Storm shutters need replacing. Pay $25 per workshop and $100 per landmark.','repairs',25,100],
 ['Your handcart blocked a cycle lane. Pay a $15 fine.','cash',-15],
 ['A parcel awaits at West Ferry. Travel there.','move',5],
 ['A telescope opening draws you to Lantern Summit. Travel there.','move',39],
 ['You commission a town portrait. Pay each other player $50 for their contribution.','payall',50],
 ['The harbor buys your rain forecast archive for $150.','cash',150]
].map(Object.freeze);
const CHEST=[
 ['You are invited to ring the harbor bell. Return to Harbor Gate and collect $200.','move',0],
 ['Your pop-up night market returns a $200 surplus.','cash',200],
 ['The community kiln needs a replacement element. Contribute $50.','cash',-50],
 ['A visitor buys your handmade harbor map for $50.','cash',50],
 ['You filed the paperwork early. Keep this pass to leave Permit Review without a fee.','free'],
 ['An unsigned form holds up your plans. Report to the Permit Office; skip the gate payment.','jail'],
 ['Your lantern-making class earns $100.','cash',100],
 ['The tool library returns your $20 deposit.','cash',20],
 ['Your tiny theater opens tonight. Each other player buys a $10 ticket.','collectall',10],
 ['Your neighborhood wins a $100 garden award.','cash',100],
 ['A cracked studio skylight costs $100 to repair.','cash',-100],
 ['You sponsor the harbor youth orchestra. Pay $50.','cash',-50],
 ['A boatbuilder pays $25 for your lettering design.','cash',25],
 ['The town upgrades its paths. Pay $40 per workshop and $115 per landmark.','repairs',40,115],
 ['Your miniature lighthouse wins a $10 craft prize.','cash',10],
 ['A long-running stall settles its $100 balance with you.','cash',100]
].map(Object.freeze);Object.freeze(CHANCE);Object.freeze(CHEST);
const FI_CHANCE=[
 'Satamakello kutsuu. Palaa Harbor Gate -portille ja nosta $200.','Uudet vuokralaiset odottavat Ember Docksissa. Siirry sinne.',
 'Puutarhuri odottaa Moss Arcadessa. Siirry sinne.','Siirry seuraavalle lautalle. Maksa kaksinkertainen vuokra, jos reitti on omistettu.',
 'Iltalautta lähtee. Siirry seuraavalle lautalle; omistettu reitti maksaa kaksinkertaisesti.','Vieraile seuraavassa palvelussa. Jos se on omistettu, heitä noppia ja maksa kymmenkertainen summa.',
 'Sääasemasi saa $50 tutkimusrahaa.','Virkailija on sinulle palveluksen velkaa. Säilytä maksuton käsittelylupa.',
 'Unohdit tilikirjasi. Palaa kolme askelta.','Lupasi tarkistetaan. Siirry Permit Officeen saamatta porttimaksua.',
 'Korjaa myrskyluukut: $25 työpajasta ja $100 maamerkistä.','Kärrysi tukkivat pyörätien. Maksa $15 sakko.',
 'Paketti odottaa West Ferryllä. Siirry sinne.','Tähtitornin avajaiset ovat Lantern Summitissa. Siirry sinne.',
 'Tilaat kaupungin yhteiskuvan. Maksa jokaiselle muulle pelaajalle $50.','Satama ostaa sääarkistosi $150:llä.'
];
const FI_CHEST=[
 'Saat soittaa satamakelloa. Palaa Harbor Gate -portille ja nosta $200.','Iltatorisi tuottaa $200 ylijäämää.',
 'Yhteinen polttouuni kaipaa vastusta. Maksa $50.','Vierailija ostaa piirtämäsi satamakartan $50:llä.',
 'Täytit lomakkeet ajoissa. Säilytä maksuton käsittelylupa.','Allekirjoitus puuttuu. Siirry Permit Officeen saamatta porttimaksua.',
 'Lyhtykurssisi tuottaa $100.','Työkalukirjasto palauttaa $20 vakuuden.','Pieni teatterisi avautuu. Saat jokaiselta muulta pelaajalta $10 lipusta.',
 'Korttelisi saa $100 puutarhapalkinnon.','Studion kattoikkunan korjaus maksaa $100.','Tuet sataman nuoriso-orkesteria. Maksa $50.',
 'Veneenrakentaja maksaa kylttityöstäsi $25.','Kaupunki kunnostaa polut: maksa $40 työpajasta ja $115 maamerkistä.',
 'Pienoismallisi voittaa $10 käsityöpalkinnon.','Torikauppias maksaa sinulle $100 saatavan.'
];
const cache=new Map();
function idOf(state){return typeof state==='string'?state:state?.s?.boardId||state?.boardId||ID;}
function get(state=ID,language){const id=idOf(state);if(!EDITIONS[id])throw Error('Unknown board edition.');const lang=language||state?.s?.language||state?.language||'en',key=id+':'+lang;if(!cache.has(key))cache.set(key,Object.freeze(BOARD.map(b=>Object.freeze({...b,boardId:id,language:lang,key:id+':'+b.id,currency:'USD'}))));return cache.get(key);}
function cards(deck,state=ID,language){get(state);const lang=language||state?.s?.language||state?.language||'en',data=deck==='chance'?CHANCE:CHEST;return data.map((c,i)=>[lang==='fi'?(deck==='chance'?FI_CHANCE:FI_CHEST)[i]:c[0],...c.slice(1)]);}
function cardText(card,state,language){if(!card)return '';let index=card.index;if(!Number.isInteger(index))for(const lang of ['en','fi']){index=cards(card.deck,state,lang).findIndex(c=>c[0]===card.text);if(index>=0)break;}return index>=0&&index<16?cards(card.deck,state,language)[index][0]:card.text||'';}
function deckName(deck,state,language){const fi=(language||state?.language)==='fi';return deck==='chance'?(fi?'Vuorovesi':'Tide & Turn'):(fi?'Kaupunkiposti':'Town Dispatch');}
function rules(){return {workshops:32,jailFee:50,freeThirdJail:false};}
function descriptor(state){get(state);return {...EDITIONS[ID],language:state?.s?.language||state?.language||'en',rulesNote:'Lantern Harbor: workshops develop into landmarks. Permit Review delays movement at the Permit Office. Harbor Gate pays 200 per completed circuit. Ferries and cooperatives collect service fees.',propertyIdentity:'Use numeric property id and boardId. Names must match Lantern Harbor.'};}
function currency(state){get(state);return 'USD';}function symbol(state){currency(state);return '$';}function moneyText(text){return text;}
function prompt(state,{compact=false}={}){const d=descriptor(state);return '\nEdition: '+JSON.stringify(d)+'\nOutput language: '+(d.language==='fi'?'Finnish. Public speech, rationale and memory must be Finnish. Keep JSON keys, numeric property IDs and action IDs unchanged.':'English. Keep JSON keys and action IDs unchanged.')+' Use exact fictional place names.'+(compact?'':'\nStable board: '+JSON.stringify(get(state))+'\nCard effects (not draw order): '+JSON.stringify({chance:cards('chance',state),chest:cards('chest',state)}));}
const api={ID,EDITIONS,BOARD,CHANCE,CHEST,get,cards,cardText,deckName,rules,descriptor,currency,symbol,moneyText,prompt};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RentReasonBoards=api;
})(globalThis);
