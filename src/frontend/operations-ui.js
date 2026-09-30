/**
 * @file operations-ui.js
 * @path src/frontend/operations-ui.js
 * @description P2P operation rendering, role-aware actions, chat, and operation controls.
 * @module frontend/operations
 * @status active
 */
/**
 * Implements the operationRole operation for this module.
 * @param o Input used by the operation.
 * @returns The operation result.
 */
function operationRole(o){
  const current=o?.currentUserId;
  const username=String(S.account?.user?.username||'').replace(/^@/,'').toLowerCase();
  /**
 * Implements the same operation for this module.
 * @param a Input used by the operation.
 * @param b Input used by the operation.
 * @returns The operation result.
 */
  const same=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
  /**
 * Implements the sameUsername operation for this module.
 * @param a Input used by the operation.
 * @returns The operation result.
 */
  const sameUsername=(a)=>username&&String(a||'').replace(/^@/,'').toLowerCase()===username;
  if(same(o?.User?.uuid,current)||same(o?.User?.id,current)||sameUsername(o?.User?.username))return'owner';
  if(same(o?.Peer?.uuid,current)||same(o?.Peer?.id,current)||sameUsername(o?.Peer?.username))return'peer';
  return'unknown';
}
/**
 * Implements the operationActions operation for this module.
 * @param o Input used by the operation.
 * @param role Input used by the operation.
 * @returns The operation result.
 */
function operationActions(o,role=operationRole(o)){
  const type=String(o?.type||'').toLowerCase(),status=String(o?.status||'').toLowerCase(),a=['chat'];
  if(status==='processing'&&((type==='buy'&&role==='owner')||(type==='sell'&&role==='peer')))a.unshift('paid');
  if(status==='paid'&&((type==='sell'&&role==='owner')||(type==='buy'&&role==='peer')))a.unshift('received');
  if(['processing','paid'].includes(status))a.push('cancel');
  if(status==='open'&&role==='owner')a.push('cancel');
  if(status==='revision'&&((type==='buy'&&role==='owner')||(type==='sell'&&role==='peer')))a.push('cancel');
  if(status==='completed')a.unshift('rate');
  return [...new Set(a)];
}
/**
 * Implements the operationActionCount operation for this module.

 * @returns The operation result.
 */
function operationActionCount(){
  return S.operations.filter(o=>operationActions(o).some(a=>a==='paid'||a==='received')).length;
}
/**
 * Implements the operationStatusLabel operation for this module.
 * @param v Input used by the operation.
 * @returns The operation result.
 */
function operationStatusLabel(v){return({revision:'REVISIÓN',processing:'PROCESANDO',paid:'PAGADA',open:'ABIERTA',completed:'COMPLETADA',cancelled:'CANCELADA'}[String(v||'').toLowerCase()]||String(v||'—').toUpperCase())}
/**
 * Implements the operationCounterparty operation for this module.
 * @param o Input used by the operation.
 * @param role Input used by the operation.
 * @returns The operation result.
 */
function operationCounterparty(o,role=operationRole(o)){const p=role==='owner'?o?.Peer:role==='peer'?o?.User:(o?.Peer||o?.User);return p?.username||p?.name||'—'}
/**
 * Implements the operationRate operation for this module.
 * @param o Input used by the operation.
 * @returns The operation result.
 */
function operationRate(o){return Number(o?.amount)>0?Number(o?.receive)/Number(o?.amount):null}
/**
 * Implements the operationActionButton operation for this module.
 * @param action Input used by the operation.
 * @returns The operation result.
 */
function operationActionButton(action){
  if(action==='paid')return'<button class="button primary compact" onclick="markOperationPaid()">✓ Marcar pagada</button>';
  if(action==='received')return'<button class="button primary compact" onclick="markOperationReceived()">✓ Confirmar recepción</button>';
  if(action==='cancel')return'<button class="button danger compact" onclick="cancelOperation()">Cancelar</button>';
  if(action==='rate')return'<button class="button secondary compact" onclick="rateOperation()">⭐ Calificar</button>';
  return'';
}
/**
 * Implements the drawOperations operation for this module.

 * @returns The operation result.
 */
function drawOperations(){
  const list=$('operationsList');if(!list)return;
  const status=$('ofStatus')?.value||'',type=$('ofType')?.value||'',coin=($('ofCoin')?.value||'').trim().toUpperCase();
  const rows=S.operations.filter(o=>(!status||String(o.status||'').toLowerCase()===status)&&(!type||String(o.type||'').toLowerCase()===type)&&(!coin||String(o.coin||'').toUpperCase().includes(coin)));
  list.innerHTML=rows.length?rows.map(o=>{const id=String(o.uuid||''),active=id===S.active,role=operationRole(o),actions=operationActions(o,role);return'<button class="operation-row '+(active?'selected':'')+'" onclick="selectOperation(\''+esc(id)+'\')"><div><span class="operation-status">'+operationStatusLabel(o.status)+'</span><b>'+esc(String(o.type||'P2P').toUpperCase())+' · '+esc(o.coin||'—')+'</b><small>'+esc(operationCounterparty(o,role))+' · '+num(o.amount,2)+' QUSD</small></div><div class="operation-row-rate"><b>'+num(operationRate(o),2)+'</b><small>'+num(o.receive,2)+'</small></div><span class="operation-row-action">'+((actions.includes('paid')||actions.includes('received'))?'⚡':'›')+'</span></button>'}).join(''):'<div class="empty-inline">No hay operaciones que coincidan con los filtros.</div>';
  if($('operationDetail'))drawOperationDetail();
  $('ofStatus')?.addEventListener('change',drawOperations);$('ofType')?.addEventListener('change',drawOperations);$('ofCoin')?.addEventListener('input',drawOperations);
}
/**
 * Implements the drawOperationDetail operation for this module.

 * @returns The operation result.
 */
function drawOperationDetail(){
  const e=$('operationDetail');if(!e||!S.operation)return;
  const o=S.operation,role=operationRole(o),actions=operationActions(o,role),details=o.details&&typeof o.details==='object'?JSON.stringify(o.details,null,2):'—';
  e.innerHTML='<div class="operation-detail-head"><div><span class="eyebrow">OPERACIÓN '+esc(String(o.uuid||S.active))+'</span><h2>'+esc(String(o.type||'P2P').toUpperCase())+' · '+esc(o.coin||'—')+'</h2><p>'+operationStatusLabel(o.status)+' · Rol: '+(role==='owner'?'CREADOR':role==='peer'?'CONTRAPARTE':'NO DETERMINADO')+' · '+esc(operationCounterparty(o,role))+'</p></div><span class="status-chip">'+operationStatusLabel(o.status)+'</span></div><div class="operation-grid"><div><span>QUSD</span><b>'+num(o.amount,2)+'</b></div><div><span>Recibe</span><b>'+num(o.receive,2)+'</b></div><div><span>Tasa</span><b>'+num(operationRate(o),2)+'</b></div><div><span>TX ID</span><b>'+esc(o.tx_id||'—')+'</b></div><div><span>Actualizado</span><b>'+time(o.updated_at||o.updatedAt)+'</b></div></div><div class="operation-details-block"><span>Datos de pago</span><pre>'+esc(details)+'</pre></div><div class="operation-actions">'+actions.filter(a=>a!=='chat').map(operationActionButton).join('')+'</div><div class="operation-chat"><div class="chat-head"><b>💬 Chat</b><button class="button ghost compact" onclick="loadChat()">↻</button></div><div id="chatMessages" class="chat-messages"></div><form id="chatForm" class="chat-form"><input id="chatMessage" maxlength="599" placeholder="Escribe un mensaje a la contraparte…"><button class="button secondary compact">Enviar</button></form></div></div>';
  drawChat();
  $('chatForm')?.addEventListener('submit',sendChat);
}
/**
 * Implements the drawChat operation for this module.

 * @returns The operation result.
 */
/**
 * Mounts the operation-detail panel after the operation list when the route
 * was rendered before an operation became active.
 * @returns Whether the detail mount exists after this call.
 */
function mountOperationDetail(){
  if($('operationDetail'))return true;
  const list=$('operationsList');
  if(!list)return false;
  const section=document.createElement('section');
  section.className='card';
  section.innerHTML='<div class="card-head"><div><h2>Detalle de operación</h2><p>Acciones disponibles según tu rol y el estado actual.</p></div></div><div id="operationDetail"><div class="empty-inline">Cargando detalles de la operación…</div></div>';
  const listCard=list.closest('.card');
  if(listCard)listCard.insertAdjacentElement('afterend',section);
  else document.getElementById('app')?.append(section);
  return Boolean($('operationDetail'));
}
function drawChat(){
  const e=$('chatMessages');if(!e)return;
  e.innerHTML=S.chat.length?S.chat.map(m=>'<div class="chat-message"><p>'+esc(m.message||'')+'</p><small>'+time(m.created_at||m.createdAt)+'</small></div>').join(''):'<div class="empty-inline">Sin mensajes todavía.</div>';
  e.scrollTop=e.scrollHeight;
}
/**
 * Implements the selectOperation operation for this module.
 * @param id Input used by the operation.
 * @returns The operation result.
 */
async function selectOperation(id){S.active=id;localStorage.setItem('qvapay.activeOperationId',id);const loaded=await loadOperation(id);if(!loaded)return;if((location.hash.slice(1)||'/')==='/operations'){if(!mountOperationDetail()){nav();return}drawOperations();drawOperationDetail()}else nav();toast('Operación seleccionada','success')}
/**
 * Implements the loadOperations operation for this module.

 * @returns The operation result.
 */
async function loadOperations(){try{const p=await api('/api/operations');const q=p.operations||{};S.operations=Array.isArray(q)?q:(q.data||[]);if(S.active&&!S.operations.some(o=>String(o.uuid)===String(S.active))&&!S.operation){S.active=null;S.chat=[];localStorage.removeItem('qvapay.activeOperationId')}if(!S.active){const pending=S.operations.find(o=>['processing','paid','revision'].includes(String(o.status||'').toLowerCase()));if(pending){S.active=String(pending.uuid);localStorage.setItem('qvapay.activeOperationId',S.active)}}return true}catch(e){return false}}
/**
 * Implements the loadOperation operation for this module.
 * @param id Input used by the operation.
 * @returns The operation result.
 */
/**
 * Waits briefly for a newly applied P2P operation to appear in the authenticated listing.
 * @param id Applied P2P operation UUID.
 * @param attempts Maximum number of authenticated-list refreshes.
 * @returns The synchronized operation, or null while QvaPay is still propagating it.
 */
async function waitForOperation(id,attempts=3){for(let attempt=0;attempt<attempts;attempt+=1){await loadOperations();const operation=S.operations.find(o=>String(o.uuid)===String(id));if(operation)return operation;if(attempt<attempts-1)await new Promise(resolve=>setTimeout(resolve,750*(attempt+1)))}return null}
async function loadOperation(id=S.active,fallback=null,notify=true){if(!id)return false;try{const local=S.operations.find(o=>String(o.uuid)===String(id));const operation=local||fallback||(String(S.operation?.uuid||'')===String(id)?S.operation:null);if(!operation){if(notify)toast('La operación aún no aparece en el listado autenticado.','error');return false}S.operation=operation;S.active=id;S.operationRole=operationRole(S.operation);await loadChat();if((location.hash.slice(1)||'/')==='/operations'){mountOperationDetail();drawOperations();drawOperationDetail()}return true}catch(e){if(notify)toast(e.message,'error');return false}}
/**
 * Implements the loadChat operation for this module.

 * @returns The operation result.
 */
async function loadChat(){if(!S.active)return;try{const p=await api('/api/operations/'+encodeURIComponent(S.active)+'/chat');const q=p?.qvapay;S.chat=Array.isArray(q?.chat)?q.chat:Array.isArray(q?.data)?q.data:Array.isArray(q)?q:[]}catch(e){S.chat=[]}}
/**
 * Implements the markOperationPaid operation for this module.

 * @returns The operation result.
 */
async function markOperationPaid(){if(!S.active)return;const tx=prompt('Introduce el identificador/referencia del pago (tx_id):','');if(tx==null||!tx.trim())return;try{await api('/api/operations/'+encodeURIComponent(S.active)+'/paid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tx_id:tx.trim()})});toast('Pago registrado en QvaPay','success');await refreshOperations()}catch(e){toast(e.message,'error')}}
/**
 * Implements the markOperationReceived operation for this module.

 * @returns The operation result.
 */
async function markOperationReceived(){if(!S.active||!confirm('¿Confirmas que recibiste el pago fiat? Esta acción completa la operación en QvaPay.'))return;try{await api('/api/operations/'+encodeURIComponent(S.active)+'/received',{method:'POST'});toast('Recepción confirmada y operación completada','success');await refreshOperations()}catch(e){toast(e.message,'error')}}
/**
 * Implements the cancelOperation operation for this module.

 * @returns The operation result.
 */
async function cancelOperation(){if(!S.active||!confirm('¿Cancelar esta operación? QvaPay determinará el resultado según tu rol y el estado.'))return;try{await api('/api/operations/'+encodeURIComponent(S.active)+'/cancel',{method:'POST'});toast('Solicitud de cancelación enviada','success');await refreshOperations()}catch(e){toast(e.message,'error')}}
/**
 * Implements the rateOperation operation for this module.

 * @returns The operation result.
 */
async function rateOperation(){if(!S.active)return;const rating=Number(prompt('Calificación de la contraparte (1 a 5):','5'));if(!Number.isFinite(rating)||rating<1||rating>5)return;const comment=prompt('Comentario opcional (máximo 120 caracteres):','')??'';try{await api('/api/operations/'+encodeURIComponent(S.active)+'/rate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating,comment})});toast('Calificación enviada','success');await loadOperation(S.active)}catch(e){toast(e.message,'error')}}
/**
 * Implements the sendChat operation for this module.
 * @param e Input used by the operation.
 * @returns The operation result.
 */
async function sendChat(e){e.preventDefault();const input=$('chatMessage'),message=input?.value.trim();if(!message||!S.active)return;try{await api('/api/operations/'+encodeURIComponent(S.active)+'/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message})});input.value='';await loadChat();drawChat();toast('Mensaje enviado','success')}catch(err){toast(err.message,'error')}}
