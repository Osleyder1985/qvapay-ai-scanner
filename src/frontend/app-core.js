/**
 * @file app-core.js
 * @path src/frontend/app-core.js
 * @description Shared frontend state, utilities, routing metadata, and page templates.
 * @module frontend/core
 * @status active
 */
const S={offers:[],total:0,page:1,lastPage:1,intelligence:null,intelligenceCoverage:null,history:[],trends:[],baselines:[],operations:[],active:localStorage.getItem('qvapay.activeOperationId'),operation:null,operationRole:'unknown',chat:[],config:null,auto:null,account:null,finance:null};
const $=id=>document.getElementById(id), esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
/**
 * Implements the num operation for this module.
 * @param v Input used by the operation.
 * @param d Input used by the operation.
 * @returns The operation result.
 */
const num=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—'; const rate=o=>Number(o?.amount)>0?Number(o.receive)/Number(o.amount):null;
const meta={'/':['OVERVIEW','Inicio'],'/market':['MARKET','Mercado'],'/auto-apply':['AUTOMATION','Auto-Apply'],'/operations':['OPERATIONS','Operaciones'],'/analytics':['INTELLIGENCE','Analytics'],'/alerts':['MONITORING','Alertas'],'/account':['ACCOUNT','Cuenta'],'/finance':['FINANCE','Finanzas'],'/settings':['SYSTEM','Configuración']};
/**
 * Implements the api operation for this module.
 * @param u Input used by the operation.
 * @param o Input used by the operation.
 * @returns The operation result.
 */
function errorText(value){
  if(value==null)return 'Error desconocido';
  if(typeof value==='string')return value;
  if(value instanceof Error)return value.message||'Error desconocido';
  if(typeof value==='object'){
    const message=value.message||value.detail||value.error||value.title||value.reason;
    if(typeof message==='string'&&message.trim())return message;
    if(message&&message!==value)return errorText(message);
    try{return JSON.stringify(value)}catch{return String(value)}
  }
  return String(value);
}
async function api(u,o={}){const r=await fetch(u,{cache:'no-store',...o});let p;try{p=await r.json()}catch{p={error:'Respuesta no válida del servidor',status:r.status}}if(!r.ok)throw new Error(errorText(p?.detail?.message||p?.detail||p?.error||p));return p}
/**
 * Implements the toast operation for this module.
 * @param m Input used by the operation.
 * @param c Input used by the operation.
 * @returns The operation result.
 */
function toast(m,c='info'){const x=document.createElement('div');x.className='toast '+c;x.textContent=m;document.getElementById('toasts').append(x);setTimeout(()=>x.remove(),3500)}
/**
 * Implements the card operation for this module.
 * @param t Input used by the operation.
 * @param s Input used by the operation.
 * @param b Input used by the operation.
 * @returns The operation result.
 */
function card(t,s,b){return '<section class="card"><div class="card-head"><div><h2>'+t+'</h2><p>'+s+'</p></div></div>'+b+'</section>'} function metric(a,b,c,i){return '<article class="metric"><div class="metric-icon">'+i+'</div><span>'+a+'</span><strong>'+b+'</strong><small>'+c+'</small></article>'}
/**
 * Implements the time operation for this module.
 * @param v Input used by the operation.
 * @returns The operation result.
 */
function time(v){if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleTimeString('es-ES')}
/**
 * Implements the best operation for this module.

 * @returns The operation result.
 */
function best(){const a=S.offers.map(rate).filter(Number.isFinite);return a.length?num(Math.max(...a),2):'—'} function low(){const a=S.offers.map(rate).filter(Number.isFinite);return a.length?num(Math.min(...a),2):'—'}
/**
 * Implements the coinAnalysis operation for this module.

 * @returns The operation result.
 */
function coinAnalysis(){const groups=new Map();S.offers.forEach(o=>{const coin=String(o.coin||'').trim()||'SIN_MONEDA',r=rate(o);if(!Number.isFinite(r))return;const g=groups.get(coin)||{coin,rates:[],sell:0,buy:0,open:0};g.rates.push(r);if(String(o.type).toLowerCase()==='sell')g.sell++;if(String(o.type).toLowerCase()==='buy')g.buy++;if(String(o.status||'open').toLowerCase()==='open')g.open++;groups.set(coin,g)});return [...groups.values()].map(g=>{const x=[...g.rates].sort((a,b)=>a-b),m=Math.floor(x.length/2),median=x.length%2?x[m]:(x[m-1]+x[m])/2;return {...g,count:x.length,min:x[0],max:x[x.length-1],median,spread:x[x.length-1]-x[0]}}).sort((a,b)=>a.coin.localeCompare(b.coin))}
/**
 * Implements the nav operation for this module.

 * @returns The operation result.
 */
function nav(){let p=location.hash.slice(1)||'/';if(!meta[p])p='/';document.getElementById('pageKicker').textContent=meta[p][0];document.getElementById('pageTitle').textContent=meta[p][1];document.querySelectorAll('[data-route]').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+p));document.getElementById('app').innerHTML=pages[p]();if(p==='/market'){bindFilters();drawOffers()}if(p==='/auto-apply')bindAuto();if(p==='/analytics'){drawCoinRadar();drawCoinAnalysis();}if(p==='/')drawHome();if(p==='/operations')drawOperations();if(p==='/account')drawAccount();if(p==='/finance')drawFinance()}
