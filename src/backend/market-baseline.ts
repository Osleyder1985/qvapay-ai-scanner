/**
 * @file market-baseline.ts
 * @path src/backend/market-baseline.ts
 * @description Implements market baseline for QvaPay AI Scanner.
 * @module backend
 * @status active
 */
export interface BaselinePoint {
  coin: string;
  type: string;
  timestamp: string;
  medianRate: number | null;
  samples: number;
}

export interface MarketBaseline {
  coin: string;
  type: string;
  observations: number;
  baselineRate: number | null;
  currentRate: number | null;
  deviationPercent: number | null;
  minRate: number | null;
  maxRate: number | null;
  status: "above" | "below" | "near" | "insufficient";
}

/**
 * Implements the calculateBaseline operation for this module.
 * @param points Input used by the operation.
 * @param lookback Input used by the operation.
 * @returns The operation result.
 */
export function calculateBaseline(points: BaselinePoint[], lookback=24): MarketBaseline {
  if (!points.length) return {coin:"",type:"",observations:0,baselineRate:null,currentRate:null,deviationPercent:null,minRate:null,maxRate:null,status:"insufficient"};
  const sorted=[...points].sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
  const recent=sorted.slice(-Math.max(1,Math.trunc(lookback))).filter(p=>Number.isFinite(p.medianRate));
  const first=recent[0],last=recent.at(-1);
  const values=recent.map(p=>p.medianRate as number);
  if (!first||!last) return {coin:sorted[0]?.coin??"",type:sorted[0]?.type??"",observations:0,baselineRate:null,currentRate:null,deviationPercent:null,minRate:null,maxRate:null,status:"insufficient"};
  const baseline=values.reduce((a,b)=>a+b,0)/values.length;
  const current=last.medianRate as number;
  const deviation=baseline!==0?(current-baseline)/baseline*100:null;
  const status=deviation===null?"insufficient":Math.abs(deviation)<1?"near":deviation>0?"above":"below";
  return {coin:last.coin,type:last.type,observations:recent.length,baselineRate:baseline,currentRate:current,deviationPercent:deviation,minRate:Math.min(...values),maxRate:Math.max(...values),status};
}

/**
 * Implements the calculateBaselines operation for this module.
 * @param points Input used by the operation.
 * @param lookback Input used by the operation.
 * @returns The operation result.
 */
export function calculateBaselines(points: BaselinePoint[], lookback=24): MarketBaseline[] {
  const groups=new Map<string,BaselinePoint[]>();
  for(const p of points){const key=p.type+"|"+p.coin;const list=groups.get(key)??[];list.push(p);groups.set(key,list);}
  return [...groups.values()].map(g=>calculateBaseline(g,lookback));
}
