/**
 * @file arbitrage-ui.js
 * @path src/frontend/arbitrage-ui.js
 * @description Interfaz del mercado de arbitraje en modo lectura y simulación continua.
 * @module frontend/arbitrage
 * @status active
 */

let arbitragePollingTimer = null;
let arbitragePollingBusy = false;

function arbitrageMoney(value) {
  return Number.isFinite(Number(value)) ? num(value, 2) : "—";
}

function drawArbitrageMarket() {
  const box = $("arbitrageMarketResults");
  if (!box) return;
  const offers = S.arbitrage?.marketOffers || [];
  if (!offers.length) {
    box.innerHTML = '<div class="empty-inline">No hay ofertas SELL abiertas para ' +
      esc(S.arbitrage?.marketSimulation?.coin || "la moneda seleccionada") +
      ' en este momento.</div>';
    return;
  }
  const margin = Number(S.arbitrage?.marketSimulation?.minMarginPercent ?? 5);
  box.innerHTML =
    '<div class="table-wrap arbitrage-table-wrap"><table class="market-table arbitrage-table">' +
    '<thead><tr>' +
    '<th>Oferta SELL</th><th>QUSD disponible</th><th>Comprar a</th><th>Capital CUP</th>' +
    '<th>Venderíamos a</th><th>Recibiríamos</th><th>Ganancia</th>' +
    '</tr></thead><tbody>' +
    offers.map((offer) => {
      const min = Number(offer.orderMinQusd);
      const max = Number(offer.orderMaxQusd);
      const limitText = Number.isFinite(min) || Number.isFinite(max)
        ? 'Límites: ' + (Number.isFinite(min) ? arbitrageMoney(min) : '0') +
          ' — ' + (Number.isFinite(max) ? arbitrageMoney(max) : 'sin máximo') + ' QUSD'
        : 'Sin límite adicional';
      return '<tr>' +
        '<td><span class="type sell">SELL</span><small>' + esc(offer.uuid) + '</small></td>' +
        '<td><strong>' + arbitrageMoney(offer.availableQusd) + '</strong><small>' + esc(limitText) + '</small></td>' +
        '<td><strong>' + arbitrageMoney(offer.purchaseRate) + '</strong><small>CUP/QUSD</small></td>' +
        '<td><strong>' + arbitrageMoney(offer.capitalRequiredFiat) + '</strong><small>CUP</small></td>' +
        '<td><strong class="arbitrage-target">+' + margin.toFixed(2) + '% · ' + arbitrageMoney(offer.targetSaleRate) + '</strong><small>CUP/QUSD</small></td>' +
        '<td><strong>' + arbitrageMoney(offer.targetSaleProceedsFiat) + '</strong><small>CUP</small></td>' +
        '<td><strong class="arbitrage-profit">+' + arbitrageMoney(offer.projectedGrossProfitFiat) + '</strong><small>CUP · ' + margin.toFixed(2) + '%</small></td>' +
        '</tr>';
    }).join("") +
    '</tbody></table></div>';
}

function drawArbitrageSignals() {
  const box = $("arbitrageResults");
  if (!box) return;
  const opportunities = S.arbitrage?.opportunities || [];
  if (!opportunities.length) {
    box.innerHTML = '<div class="empty-inline">La simulación por oferta no necesita una BUY real: aquí se calcula el precio objetivo de salida aplicando el margen mínimo configurado.</div>';
    return;
  }
  box.innerHTML = opportunities.map((opportunity) =>
    '<div class="arbitrage-signal"><b>' + esc(opportunity.coin) + '</b> · ' +
    arbitrageMoney(opportunity.grossMarginPercent) + '% bruto · ' +
    arbitrageMoney(opportunity.capitalRequiredFiat) + ' → ' +
    arbitrageMoney(opportunity.capitalRequiredFiat + opportunity.grossProfitFiat) +
    '</div>'
  ).join("");
}

function drawArbitrage() {
  drawArbitrageMarket();
  drawArbitrageSignals();
  const status = $("arbitrageLiveStatus");
  if (status) {
    const at = S.arbitrage?.marketSimulation?.scannedAt;
    status.textContent = at
      ? "Último escaneo " + new Date(at).toLocaleTimeString("es-ES") + " · siguiente en 10 s"
      : "Esperando primer escaneo…";
  }
}

async function loadArbitrage({ silent = false } = {}) {
  const margin = Number($("arbMargin")?.value || S.arbitrage?.minMarginPercent || 5);
  const coin = ($("arbCoin")?.value || "BANK_CUP").trim().toUpperCase() || "BANK_CUP";
  try {
    const query = new URLSearchParams({
      minMarginPercent: String(margin),
      coin,
    });
    S.arbitrage = await api("/api/arbitrage/scan?" + query.toString());
    drawArbitrage();
    if (!silent) {
      toast("Mercado actualizado · " + coin + " · simulación +" + margin + "%", "success");
    }
  } catch (e) {
    S.arbitrage = {
      mode: "error",
      minMarginPercent: margin,
      coin,
      marketOffers: [],
      opportunities: [],
      coverage: { fetched: 0 },
      error: errorText(e),
    };
    drawArbitrage();
    if (!silent) toast("No se pudo leer el mercado: " + errorText(e), "error");
  }
}

function stopArbitragePolling() {
  if (arbitragePollingTimer !== null) {
    clearInterval(arbitragePollingTimer);
    arbitragePollingTimer = null;
  }
}

function startArbitragePolling() {
  stopArbitragePolling();
  void loadArbitrage({ silent: true });
  arbitragePollingTimer = window.setInterval(() => {
    if (arbitragePollingBusy) return;
    arbitragePollingBusy = true;
    void loadArbitrage({ silent: true }).finally(() => {
      arbitragePollingBusy = false;
    });
  }, 10_000);
}

function runArbitrageDemo() {
  toast("La simulación ahora usa las ofertas reales del mercado y se actualiza cada 10 segundos.", "info");
}

function bindArbitrage() {
  const form = $("arbitrageControls");
  if (!form) return;
  form.onsubmit = async (event) => {
    event.preventDefault();
    await loadArbitrage();
  };
  startArbitragePolling();
}

window.loadArbitrage = loadArbitrage;
window.runArbitrageDemo = runArbitrageDemo;
window.startArbitragePolling = startArbitragePolling;
window.stopArbitragePolling = stopArbitragePolling;
