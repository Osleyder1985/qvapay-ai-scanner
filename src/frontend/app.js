const state={page:1,take:100};
const $=id=>document.getElementById(id);
function escapeHtml(value){return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function number(value,digits=2){const n=Number(value);return Number.isFinite(n)?n.toLocaleString("es-ES",{maximumFractionDigits:digits}):"—"}
function rate(offer){const amount=Number(offer.amount),receive=Number(offer.receive);return amount>0?receive/amount:null}
function verification(user){const checks=[];if(user?.kyc)checks.push("KYC");if(user?.phone_verified)checks.push("TEL");if(user?.telegram_verified)checks.push("TG");if(user?.vip)checks.push("VIP");if(user?.golden_check)checks.push("GC");return checks.length?'<span class="verified">'+checks.join(" · ")+"</span>":'<span class="unverified">—</span>'}
function renderOffers(data){
  const tbody=$("offers");tbody.innerHTML="";const offers=data.data||[];
  if(!offers.length){tbody.appendChild($("emptyTemplate").content.cloneNode(true));return}
  for(const offer of offers){
    const user=offer.User||{},r=rate(offer),tr=document.createElement("tr");
    const range=offer.order_min==null&&offer.order_max==null?"—":number(offer.order_min)+" – "+number(offer.order_max);
    tr.innerHTML="<td><span class=\"badge "+escapeHtml(offer.type)+"\">"+escapeHtml(offer.type)+"</span></td>"+
      "<td>"+escapeHtml(offer.coin)+"</td><td class=\"rate\">"+(r===null?"—":number(r,4))+"</td>"+
      "<td>"+number(offer.amount)+"</td><td>"+number(offer.receive)+"</td><td>"+number(offer.available_amount)+"</td>"+
      "<td>"+range+"</td><td>"+escapeHtml(user.username||user.name||"—")+"</td>"+
      "<td>"+(user.rating_avg==null?"—":number(user.rating_avg,2)+" ("+number(user.rating_count,0)+")")+"</td>"+
      "<td>"+number((user._count?.P2P||0)+(user._count?.P2P_Peer||0),0)+"</td><td>"+verification(user)+"</td>";
    tbody.appendChild(tr);
  }
}
function syncBestRateOption(){const option=[...$("orderBy").options].find(item=>item.value==="best_rate");const valid=Boolean($("type").value&&$("coin").value.trim());option.disabled=!valid;if(!valid&&$("orderBy").value==="best_rate")$("orderBy").value="updated_at"}\nfunction queryString(){
  const params=new URLSearchParams({page:String(state.page),take:String(state.take),orderBy:$("orderBy").value,orderType:$("orderType").value});
  for(const id of ["type","coin","min","max"]){const value=$(id).value.trim();if(value)params.set(id,value)}
  if($("onlyVip").checked)params.set("only_vip","1");return params;
}
async function loadOffers(){
  $("status").textContent="Consultando mercado…";$("refreshButton").disabled=true;
  try{
    const response=await fetch("/api/p2p?"+queryString(),{cache:"no-store"}),payload=await response.json();
    if(!response.ok)throw new Error(payload.error||"Error consultando QvaPay");
    renderOffers(payload);const total=Number(payload.total||0),perPage=Number(payload.per_page||state.take),lastPage=Math.max(1,Math.ceil(total/perPage));
    $("totalOffers").textContent=number(total,0);$("pageInfo").textContent=state.page+" / "+lastPage;$("paginationLabel").textContent="Página "+state.page+" de "+lastPage;
    $("previousButton").disabled=state.page<=1;$("nextButton").disabled=state.page>=lastPage;$("updatedAt").textContent=new Date().toLocaleTimeString("es-ES");$("status").textContent="Mercado actualizado.";
  }catch(error){$("status").textContent="⚠️ "+error.message}finally{$("refreshButton").disabled=false}
}
["type","coin"].forEach(id=>$(id).addEventListener("input",syncBestRateOption));\nsyncBestRateOption();\n$("filters").addEventListener("submit",event=>{event.preventDefault();state.page=1;loadOffers()});
$("refreshButton").addEventListener("click",loadOffers);
$("previousButton").addEventListener("click",()=>{state.page--;loadOffers()});
$("nextButton").addEventListener("click",()=>{state.page++;loadOffers()});
loadOffers();
