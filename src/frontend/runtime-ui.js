/**
 * @file runtime-ui.js
 * @path src/frontend/runtime-ui.js
 * @description Account, finance, Auto-Apply, data loading, synchronization, and command-palette runtime logic.
 * @module frontend/runtime
 * @status active
 */
/**
 * Implements the drawAccount operation for this module.

 * @returns The operation result.
 */
function drawAccount(){if(!S.account)return} function drawFinance(){if(!S.finance)return}
/**
 * Implements the refreshOperations operation for this module.

 * @returns The operation result.
 */
async function refreshOperations(){await loadOperations();if(S.active)await loadOperation(S.active);nav();toast('Operaciones sincronizadas','success')}
/**
 * Implements the refreshAccount operation for this module.

 * @returns The operation result.
 */
async function refreshAccount(){try{const p=await api('/api/account');S.account=p.account;nav();toast('Cuenta sincronizada','success')}catch(e){toast(e.message,'error')}}
/**
 * Implements the refreshFinance operation for this module.

 * @returns The operation result.
 */
async function refreshFinance(){try{const p=await api('/api/finance');S.finance=p.finance;nav();toast('Finanzas sincronizadas','success')}catch(e){toast(e.message,'error')}}
/**
 * Implements the loadAccount operation for this module.

 * @returns The operation result.
 */
async function loadAccount(){try{const p=await api('/api/account');S.account=p.account}catch(e){S.account=null}}
/**
 * Implements the loadFinance operation for this module.

 * @returns The operation result.
 */
async function loadFinance(){try{const p=await api('/api/finance');S.finance=p.finance}catch(e){S.finance=null}}
/**
 * Implements the loadAuto operation for this module.

 * @returns The operation result.
 */
function updateAutoRadar(){const radar=$('autoRadar'),label=$('autoRadarLabel'),detail=$('autoRadarDetail');if(!radar||!label||!detail)return;const status=S.auto;if(!status?.running){radar.dataset.state=S.config?.enabled?'paused':'off';label.textContent=S.config?.enabled?'AUTO-APPLY · PAUSED':'AUTO-APPLY · OFF';detail.textContent=status?.lastMessage||'Motor detenido';return}const last=status.lastScanAt?Date.now()-new Date(status.lastScanAt).getTime():Infinity;const stale=last>90_000;radar.dataset.state=stale?'paused':'on';label.textContent=stale?'AUTO-APPLY · STANDBY':'AUTO-APPLY · LIVE';detail.textContent=status.lastScanAt&&!Number.isNaN(last)?'Último escaneo '+Math.max(0,Math.floor(last/1000))+'s':'Esperando primer escaneo'}
async function loadAuto(){try{const a=await api('/api/auto-apply/config'),b=await api('/api/auto-apply/status');S.config=a.config;S.auto=b.status;updateAutoRadar()}catch(e){updateAutoRadar()}}
/**
 * Implements the bindAuto operation for this module.

 * @returns The operation result.
 */
function bindAuto(){const f=$('af');if(!f)return;$('at').value=S.config?.type||'sell';f.onsubmit=async e=>{e.preventDefault();const val=id=>$(id).value.trim()===''?null:Number($(id).value),en=$('ae').checked;if(en&&!S.config?.enabled&&!confirm('Activar Auto-Apply?'))return;try{await api('/api/auto-apply/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:en,type:$('at').value,coin:$('ac').value.trim().toUpperCase(),rateMin:val('arm'),rateMax:val('arx'),amountMin:val('aom'),amountMax:val('aox'),dailyMaxQusd:val('adl'),maxConcurrent:Number($('acon').value)})});await loadAuto();nav();toast('Reglas guardadas','success')}catch(e){toast(e.message,'error')}}}
/**
 * Implements the loadMarket operation for this module.

 * @returns The operation result.
 */
async function loadMarket(){try{const p=await api('/api/p2p?page=1&take=100&orderBy=updated_at&orderType=desc');S.offers=p.data||[];S.total=Number(p.total??S.offers.length);S.lastPage=Math.max(1,Math.ceil(S.total/Number(p.per_page||100)))}catch(e){}}
/**
 * Implements the loadIntelligence operation for this module.

 * @returns The operation result.
 */
async function loadIntelligence(){try{const p=await api('/api/intelligence?page=1&take=100&orderBy=updated_at&orderType=desc');S.intelligence=p.intelligence;S.intelligenceCoverage=p.coverage?{sampled:Number(p.intelligence?.sampleSize||0),total:Number(p.coverage.total||0),truncated:Boolean(p.coverage.truncated)}:null}catch(e){S.intelligence=null;S.intelligenceCoverage=null}}
/**
 * Implements the loadHistory operation for this module.

 * @returns The operation result.
 */
async function loadHistory(){try{const p=await api('/api/history?limit=200');S.history=p.history||[]}catch(e){S.history=[]}}
/**
 * Implements the loadTrends operation for this module.

 * @returns The operation result.
 */
async function loadTrends(){try{const p=await api('/api/trends');S.trends=p.trends||[]}catch(e){S.trends=[]}}
/**
 * Implements the loadBaselines operation for this module.

 * @returns The operation result.
 */
async function loadBaselines(){try{const p=await api('/api/baselines?lookback=24');S.baselines=p.baselines||[]}catch(e){S.baselines=[]}}
/**
 * Implements the refreshAll operation for this module.

 * @returns The operation result.
 */
async function refreshAll(){await Promise.all([loadMarket(),loadHistory(),loadTrends(),loadBaselines(),loadAuto(),loadAccount()]);nav();toast('Scanner sincronizado','success')}
window.refreshAll=refreshAll;window.refreshMarket=refreshMarket;window.changePage=changePage;window.applyOffer=applyOffer;window.loadOperation=loadOperation;window.loadOperations=loadOperations;window.refreshOperations=refreshOperations;window.selectOperation=selectOperation;window.markOperationPaid=markOperationPaid;window.markOperationReceived=markOperationReceived;window.cancelOperation=cancelOperation;window.rateOperation=rateOperation;window.loadChat=loadChat;window.resetFilters=resetFilters;
const commands=Object.entries(meta).map(([href,v])=>({href,label:v[1],group:v[0]}));
/**
 * Implements the renderCommands operation for this module.
 * @param q Input used by the operation.
 * @returns The operation result.
 */
function renderCommands(q=''){const box=$('commandResults');if(!box)return;const list=commands.filter(x=>(x.label+' '+x.group).toLowerCase().includes(q.toLowerCase()));box.innerHTML=list.map((x,i)=>'<a class="command-item'+(i===0?' selected':'')+'" href="#'+x.href+'"><b>'+x.label+'</b><small>'+x.group+'</small></a>').join('')||'<div class="command-item">Sin resultados</div>'}
/**
 * Implements the openCommands operation for this module.

 * @returns The operation result.
 */
function openCommands(){const p=$('commandPalette');if(!p)return;p.classList.add('open');p.setAttribute('aria-hidden','false');$('commandInput').value='';renderCommands();setTimeout(()=>$('commandInput').focus(),20)}
/**
 * Implements the closeCommands operation for this module.

 * @returns The operation result.
 */
function closeCommands(){const p=$('commandPalette');if(p){p.classList.remove('open');p.setAttribute('aria-hidden','true')}}
/**
 * Implements the setupCommands operation for this module.

 * @returns The operation result.
 */
function setupCommands(){document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommands()}if(e.key==='Escape')closeCommands()});$('commandBackdrop')?.addEventListener('click',closeCommands);$('commandInput')?.addEventListener('input',e=>renderCommands(e.target.value));document.querySelector('.mobile-nav')?.addEventListener('click',closeCommands)}
window.refreshAccount=refreshAccount;window.refreshFinance=refreshFinance;window.openCommands=openCommands;
async function init(){
  document.getElementById('menuButton')?.addEventListener('click',()=>document.getElementById('sidebar')?.classList.toggle('open'));
  document.getElementById('mobileOverlay')?.addEventListener('click',()=>document.getElementById('sidebar')?.classList.remove('open'));
  document.getElementById('refreshButton')?.addEventListener('click',refreshAll);
  document.getElementById('commandButton')?.addEventListener('click',openCommands);
  setupCommands();
  addEventListener('hashchange',nav);
  nav();
  void refreshAll();
  setInterval(loadAuto,5000);
  setInterval(()=>S.active&&loadOperation(S.active),10000);
}
