export interface TrendPoint {
  timestamp: string;
  coin: string;
  type: string;
  medianRate: number | null;
  minRate: number | null;
  maxRate: number | null;
  samples: number;
}

export interface TrendSummary {
  coin: string;
  type: string;
  points: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  firstMedian: number | null;
  lastMedian: number | null;
  changeAbsolute: number | null;
  changePercent: number | null;
  minMedian: number | null;
  maxMedian: number | null;
  direction: "up" | "down" | "flat" | "insufficient";
}

const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);

export function calculateTrend(points: TrendPoint[]): TrendSummary {
  if (!points.length) return {coin:"",type:"",points:0,firstTimestamp:null,lastTimestamp:null,firstMedian:null,lastMedian:null,changeAbsolute:null,changePercent:null,minMedian:null,maxMedian:null,direction:"insufficient"};
  const sorted=[...points].sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
  const valid=sorted.filter(p=>finite(p.medianRate));
  const first=valid[0]?.medianRate??null,last=valid.at(-1)?.medianRate??null;
  const change=first!==null&&last!==null?last-first:null;
  const pct=change!==null&&first!==null&&first!==0?change/first*100:null;
  let direction:"up"|"down"|"flat"|"insufficient"="insufficient";
  if(change!==null) direction=change>0?"up":change<0?"down":"flat";
  const medians=valid.map(p=>p.medianRate as number);
  return {coin:sorted[0]?.coin??"",type:sorted[0]?.type??"",points:valid.length,firstTimestamp:valid[0]?.timestamp??null,lastTimestamp:valid.at(-1)?.timestamp??null,firstMedian:first,lastMedian:last,changeAbsolute:change,changePercent:pct,minMedian:medians.length?Math.min(...medians):null,maxMedian:medians.length?Math.max(...medians):null,direction};
}

export function summarizeTrends(points: TrendPoint[]): TrendSummary[] {
  const groups=new Map<string,TrendPoint[]>();
  for(const point of points){const key=point.type+"|"+point.coin;const list=groups.get(key)??[];list.push(point);groups.set(key,list);}
  return [...groups.values()].map(calculateTrend).sort((a,b)=>(b.changePercent??-Infinity)-(a.changePercent??-Infinity));
}
