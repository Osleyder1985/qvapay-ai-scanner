/**
 * @file market-ui.js
 * @path src/frontend/market-ui.js
 * @description Filtros de mercado, renderizado de ofertas, resúmenes analíticos y helpers de interfaz histórica.
 * @module frontend/market
 * @status active
 */
/**
 * Implementa la operación populateCoinFilter de este módulo.

 * @returns Resultado de la operación.
 */
function populateCoinFilter(){const s=$('fc');if(!s)return;const current=s.value;const coins=[...new Set(S.offers.map(o=>String(o.coin||'').trim()).filter(Boolean))].sort();s.innerHTML='<option value="">Todas las monedas</option>'+coins.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');if(coins.includes(current))s.value=current}
/**
 * Implementa la operación updateFilterCount de este módulo.

 * @returns Resultado de la operación.
 */
function updateFilterCount(){const ids=['ft','fc','fo','fd','fmin','fmax','frmin','frmax'];const active=ids.filter(id=>{const v=$(id)?.value??'';return id==='fo'?v!=='updated_at':id==='fd'?v!=='desc':String(v).trim()!==''}).length;const bestOption=$('fo')?.querySelector('option[value="best_rate"]');const canBest=Boolean($('ft')?.value&&$('fc')?.value);if(bestOption)bestOption.disabled=!canBest;if(!canBest&&$('fo')?.value==='best_rate')$('fo').value='updated_at';const e=$('filterCount');if(e)e.textContent=active+' filtro'+(active===1?'':'s')+' activo'+(active===1?'':'s')}
/**
 * Implementa la operación bindFilters de este módulo.

 * @returns Resultado de la operación.
 */
function bindFilters(){const f=$('filters');if(!f)return;populateCoinFilter();updateFilterCount();f.onsubmit=e=>{e.preventDefault();S.page=1;refreshMarket()};f.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',updateFilterCount));f.querySelectorAll('select').forEach(el=>el.addEventListener('change',updateFilterCount))}
/**
 * Implementa la operación resetFilters de este módulo.

 * @returns Resultado de la operación.
 */
function resetFilters(){['ft','fc','fmin','fmax','frmin','frmax'].forEach(id=>{const e=$(id);if(e)e.value=''});if($('fo'))$('fo').value='updated_at';if($('fd'))$('fd').value='desc';updateFilterCount();S.page=1;refreshMarket()}
/**
 * Implementa la operación params de este módulo.

 * @returns Resultado de la operación.
 */
function params(){const orderBy=$('fo')?.value||'updated_at',type=$('ft')?.value||'',coin=$('fc')?.value||'';const safeOrder=orderBy==='best_rate'&&(!type||!coin)?'updated_at':orderBy;const p=new URLSearchParams({page:S.page,take:'100',orderBy:safeOrder,orderType:$('fd')?.value||'desc'});[['ft','type'],['fc','coin'],['fmin','min'],['fmax','max'],['frmin','ratio_min'],['frmax','ratio_max']].forEach(x=>{const v=$(x[0])?.value?.trim();if(v)p.set(x[1],v)});return p}
/**
 * Implementa la operación refreshMarket de este módulo.

 * @returns Resultado de la operación.
 */
async function refreshMarket(){try{const p=await api('/api/p2p?'+params());S.offers=p.data||[];S.total=Number(p.total??S.offers.length);S.lastPage=Math.max(1,Math.ceil(S.total/Number(p.per_page||100)));nav();toast('Mercado sincronizado','success')}catch(e){toast(e.message,'error')}}
/**
 * Implementa la operación userBadges de este módulo.
 * @param u Entrada utilizada por la operación.
 * @returns Resultado de la operación.
 */
function userBadges(u){const items=[u.kyc?['🪪','KYC verificado']:null,u.vip?['💎','VIP']:null,u.golden_check?['👑','Golden Check']:null,u.phone_verified?['📱','Teléfono verificado']:null,u.telegram_verified?['💬','Telegram verificado']:null].filter(Boolean);return items.length?items.map(x=>'<span class="user-badge" title="'+esc(x[1])+'" aria-label="'+esc(x[1])+'">'+x[0]+'</span>').join(''):'<span class="user-badge muted" title="Sin verificaciones informadas">—</span>'}
/**
 * Implementa la operación drawOffers de este módulo.

 * @returns Resultado de la operación.
 */
function drawOffers(){const b=$('offers');if(!b)return;b.innerHTML=S.offers.length?S.offers.map(o=>{const u=o.User||{},v=rate(o),id=String(o.uuid??o.id??'');return '<tr><td><span class="type '+esc(o.type)+'">'+esc(o.type)+'</span></td><td>'+esc(o.coin)+'</td><td class="strong">'+num(v,2)+'</td><td>'+num(o.amount,2)+'</td><td>'+num(o.receive,2)+'</td><td>'+num(o.available_amount,2)+'</td><td><div class="user-cell"><b><span class="user-icon">👤</span>'+esc(u.username||u.name||'—')+'</b><small>'+esc(u.name&&u.username?u.name:'')+'</small><div class="user-badges">'+userBadges(u)+'</div></div></td><td><span class="rating-value">⭐ '+num(u.rating_avg,2)+'</span><small>'+num(u.rating_count,0)+' valoraciones</small></td><td><button class="button primary compact" onclick="applyOffer(\''+esc(id)+'\')">Aplicar</button></td></tr>'}).join(''):'<tr><td colspan="9" class="empty-cell">No hay ofertas.</td></tr>'}
/**
 * Implementa la operación applyOffer de este módulo.
 * @param id Entrada utilizada por la operación.
 * @returns Resultado de la operación.
 */
async function applyOffer(id){if(!confirm('Aplicar a esta oferta ahora?'))return;const source=S.offers.find(o=>String(o.uuid??o.id??'')===String(id));try{await api('/api/p2p/'+encodeURIComponent(id)+'/apply',{method:'POST'});const operation=await waitForOperation(id);const fallback=operation||source?{...(operation||source),status:'processing',updated_at:new Date().toISOString()}:null;if(fallback&&!operation)S.operations=[fallback,...S.operations.filter(o=>String(o.uuid)!==String(id))];S.active=id;S.operation=fallback;localStorage.setItem('qvapay.activeOperationId',id);location.hash='#/operations/'+encodeURIComponent(id);toast(operation?'Aplicación aceptada por QvaPay':'Aplicación aceptada por QvaPay; sincronizando la operación','success')}catch(e){toast(e.message,'error')}}
/**
 * Implementa la operación loadOperation de este módulo.

 * @returns Resultado de la operación.
 */
// La carga de operaciones está centralizada en operations-ui.js para impedir que las acciones de mercado omitan el estado autenticado de la operación.
/**
 * Implementa la operación opCard de este módulo.

 * @returns Resultado de la operación.
 */
function opCard(){const o=S.operation||{};return '<section class="card operation-live"><div class="operation-top"><div><span class="eyebrow">LIVE OPERATION</span><h2>'+esc(String(o.type||'P2P').toUpperCase())+' · '+esc(o.coin||'—')+'</h2></div><span class="status-chip">● '+esc(String(o.status||o.state||'PROCESSING').toUpperCase())+'</span></div><div class="operation-grid"><div><span>UUID</span><b>'+esc(S.active)+'</b></div><div><span>Monto</span><b>'+num(o.amount)+'</b></div><div><span>Recibe</span><b>'+num(o.receive)+'</b></div><div><span>Contraparte</span><b>'+esc(o.User?.username||o.user?.username||o.Peer?.username||'—')+'</b></div><div><span>Actualizado</span><b>'+time(o.updated_at||o.updatedAt)+'</b></div></div><div class="operation-actions"><button class="button secondary" onclick="loadOperation()">↻ Actualizar</button><a class="button ghost" href="#/market">Mercado</a></div></section>'}
/**
 * Implementa la operación drawHome de este módulo.

 * @returns Resultado de la operación.
 */
function drawHome(){const e=$('miniOffers');if(e)e.innerHTML=S.offers.slice(0,6).map(o=>'<div class="mini-row"><span class="type '+esc(o.type)+'">'+esc(o.type)+'</span><b>'+esc(o.coin)+'</b><strong>'+num(rate(o),2)+'</strong><span>'+num(o.amount,2)+' QUSD</span></div>').join('')||'<div class="empty-inline">Sin datos.</div>'}
/**
 * Implementa la operación drawBars de este módulo.

 * @returns Resultado de la operación.
 */
function drawBars(){const e=$('bars');if(!e)return;const a=(S.intelligence?.opportunities||[]).map(x=>x.rate).filter(Number.isFinite).slice(0,12),m=Math.max(...a);e.innerHTML=a.length?a.map((v,i)=>'<div class="bar-row"><span>#'+(i+1)+'</span><div><i style="width:'+Math.max(5,v/m*100)+'%"></i></div><b>'+num(v,2)+'</b></div>').join(''):'<div class="empty-inline">Sin señales en el snapshot actual.</div>'};
/**
 * Implementa la operación drawCoinRadar de este módulo.

 * @returns Resultado de la operación.
 */
function drawCoinRadar(){const e=$('coinRadar');if(!e)return;const groups=S.intelligence?.byCoin||[];e.innerHTML=groups.length?groups.map(g=>{return '<section class="coin-radar"><div class="coin-radar-head"><div><span class="eyebrow">RADAR · '+esc(g.coin)+'</span><h3>'+esc(g.coin)+'</h3></div><span class="chip">'+num(g.opportunities.length,0)+' oportunidades</span></div><div class="coin-radar-stats"><span>'+num(g.sampleSize,0)+' muestras</span><span>Mediana '+num(g.medianRate,2)+'</span><span>Mejor '+num(g.bestRate,2)+'</span></div><div class="opportunity-list">'+(g.opportunities.length?g.opportunities.slice(0,6).map((o,i)=>'<div class="opportunity-row"><div class="opportunity-rank">#'+(i+1)+'</div><div class="opportunity-main"><b>'+esc(o.type.toUpperCase())+' · '+num(o.rate,2)+'</b><small>'+num(o.amount,2)+' QUSD · '+num(o.receive,2)+' '+esc(g.coin)+'</small></div><div class="opportunity-score"><span style="width:'+Math.max(8,Math.min(100,Number(o.score)||0))+'%"></span><b>'+num(o.score,0)+'</b></div></div>').join(''):'<div class="empty-inline">Sin oportunidades calculables.</div>')+'</div></section>'}).join(''):'<div class="empty-inline">No hay datos suficientes para construir radares por moneda.</div>'}
/**
 * Implementa la operación drawCoinAnalysis de este módulo.

 * @returns Resultado de la operación.
 */
function drawCoinAnalysis(){const e=$('coinAnalysis');if(!e)return;const rows=S.intelligence?.byCoin||[];e.innerHTML=rows.length?rows.map(g=>'<section class="coin-analysis"><div class="coin-analysis-head"><div><span class="eyebrow">MONEDA</span><h3>'+esc(g.coin)+'</h3></div><span class="chip">'+num(g.sampleSize,0)+' ofertas</span></div><div class="coin-metrics"><div><span>Mejor tasa</span><b>'+num(g.bestRate,2)+'</b></div><div><span>Mediana</span><b>'+num(g.medianRate,2)+'</b></div><div><span>Tasa mínima</span><b>'+num(g.minRate,2)+'</b></div><div><span>Spread</span><b>'+num(g.spread,2)+'</b></div><div><span>SELL</span><b>'+num(g.sellCount,0)+'</b></div><div><span>BUY</span><b>'+num(g.buyCount,0)+'</b></div><div><span>Abiertas</span><b>'+num(g.openCount,0)+'</b></div></div></section>').join(''):'<div class="empty-inline">No hay datos suficientes para separar el análisis por moneda.</div>'}
/**
 * Implementa la operación historySummary de este módulo.

 * @returns Resultado de la operación.
 */
function historySummary(){if(!S.history.length)return '<div class="empty-inline">Aún no existe histórico suficiente. El collector comenzará a acumular observaciones.</div>';const groups=new Map();S.history.forEach(p=>{const key=String(p.coin||'SIN_MONEDA')+'|'+String(p.type||'').toUpperCase();const a=groups.get(key)||[];a.push(p);groups.set(key,a)});const rows=[...groups.values()].map(points=>{const last=points[points.length-1],prev=points.length>1?points[points.length-2]:null;const delta=last?.medianRate!=null&&prev?.medianRate!=null?last.medianRate-prev.medianRate:null;return '<div><span>'+esc(String(last?.coin||'—'))+' · '+esc(String(last?.type||'').toUpperCase())+'</span><b>'+num(last?.medianRate,2)+'</b><small>'+(delta==null?'Sin variación previa':(delta>=0?'+':'')+num(delta,2)+' vs. punto anterior')+' · '+num(points.length,0)+' puntos</small></div>'}).slice(0,8);return '<div class="history-summary coin-history">'+rows.join('')+'</div>'}
/**
 * Implementa la operación trendSummary de este módulo.

 * @returns Resultado de la operación.
 */
function trendSummary(){if(!S.trends.length)return '<div class="empty-inline">Esperando observaciones suficientes para calcular tendencias.</div>';return S.trends.slice(0,6).map(t=>'<div class="trend-row"><div><b>'+esc(t.type.toUpperCase())+' · '+esc(t.coin)+'</b><small>'+num(t.points,0)+' puntos · '+time(t.lastTimestamp)+'</small></div><strong class="trend-'+t.direction+'">'+(t.changePercent==null?'—':(t.changePercent>=0?'+':'')+num(t.changePercent,2)+'%')+'</strong></div>').join('')}
/**
 * Implementa la operación baselineSummary de este módulo.

 * @returns Resultado de la operación.
 */
function baselineSummary(){if(!S.baselines.length)return '';return S.baselines.slice(0,6).map(b=>'<div class="trend-row"><div><b>'+esc(b.type.toUpperCase())+' · '+esc(b.coin)+'</b><small>Base '+num(b.baselineRate,2)+' · Actual '+num(b.currentRate,2)+'</small></div><strong class="trend-'+b.status+'">'+(b.deviationPercent==null?'—':(b.deviationPercent>=0?'+':'')+num(b.deviationPercent,2)+'%')+'</strong></div>').join('')}
/**
 * Implementa la operación changePage de este módulo.
 * @param d Entrada utilizada por la operación.
 * @returns Resultado de la operación.
 */
function changePage(d){if(S.page+d<1||S.page+d>S.lastPage)return;S.page+=d;refreshMarket()}
