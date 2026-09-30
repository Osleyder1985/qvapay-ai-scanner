export interface MarketOffer { uuid?: string; id?: string; type?: string; coin?: string; amount?: number|string; receive?: number|string; status?: string; User?: { username?: string; rating_avg?: number|string; kyc?: boolean }; }
export interface OpportunitySignal { uuid:string; type:string; coin:string; amount:number; receive:number; rate:number; score:number; reasons:string[]; }
export interface MarketIntelligence { sampleSize:number; validRates:number; bestRate:number|null; medianRate:number|null; minRate:number|null; maxRate:number|null; spread:number|null; sellCount:number; buyCount:number; coins:string[]; opportunities:OpportunitySignal[]; }
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):NaN;
function median(a:number[]):number|null { if(!a.length)return null; const x=[...a].sort((p,q)=>p-q),m=Math.floor(x.length/2); return x.length%2?x[m]:(x[m-1]+x[m])/2; }
export function calculateMarketIntelligence(offers:MarketOffer[]):MarketIntelligence {
 const valid=offers.map(o=>({o,amount:n(o.amount),receive:n(o.receive)})).filter(x=>x.amount>0&&x.receive>=0).map(x=>({...x,rate:x.receive/x.amount}));
 const rates=valid.map(x=>x.rate), med=median(rates);
 const opportunities=valid.map(({o,amount,receive,rate})=>{
  const reasons:string[]=[]; if(med!==null&&rate>med)reasons.push("Tasa por encima de la mediana visible");
  if(String(o.status??"open").toLowerCase()==="open")reasons.push("Oferta abierta");
  if(o.User?.kyc)reasons.push("KYC informado");
  const rating=Number(o.User?.rating_avg);
  if(Number.isFinite(rating)&&rating>0)reasons.push("Rating informado");
  let score=String(o.status??"open").toLowerCase()==="open"?25:0;
  if(med&&med>0)score+=Math.min(40,Math.max(0,(rate/med-1)*1000));
  if(o.User?.kyc)score+=15;
  if(Number.isFinite(rating)&&rating>0)score+=Math.min(20,rating*4);
  return {uuid:String(o.uuid??o.id??""),type:String(o.type??""),coin:String(o.coin??""),amount,receive,rate,score:Math.round(Math.min(100,score)),reasons};
 }).filter(x=>x.uuid).sort((a,b)=>b.score-a.score).slice(0,10);
 return {sampleSize:offers.length,validRates:rates.length,bestRate:rates.length?Math.max(...rates):null,medianRate:med,minRate:rates.length?Math.min(...rates):null,maxRate:rates.length?Math.max(...rates):null,spread:rates.length?Math.max(...rates)-Math.min(...rates):null,sellCount:offers.filter(o=>String(o.type).toLowerCase()==="sell").length,buyCount:offers.filter(o=>String(o.type).toLowerCase()==="buy").length,coins:[...new Set(offers.map(o=>String(o.coin??"")).filter(Boolean))],opportunities};
}