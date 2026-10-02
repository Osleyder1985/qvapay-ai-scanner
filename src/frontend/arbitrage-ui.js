/**
 * @file arbitrage-ui.js
 * @path src/frontend/arbitrage-ui.js
 * @description Interfaz del motor de arbitraje en modo exclusivamente de lectura.
 * @module frontend/arbitrage
 * @status active
 */

function arbitrageMoney(value) {
  return Number.isFinite(Number(value)) ? num(value, 2) : "—";
}

function arbitragePlan(opportunity) {
  const gross = Number(opportunity.grossProfitFiat);
  const net = opportunity.netProfitFiat;
  const netLabel =
    net == null
      ? "Comisión no configurada: beneficio neto pendiente"
      : "Neto estimado " + arbitrageMoney(net);
  return '<article class="arbitrage-opportunity">' +
    '<div class="arbitrage-opportunity-head"><div><span class="eyebrow">SEÑAL · ' +
    esc(opportunity.coin) +
    '</span><h3>Comprar → vender</h3></div><span class="chip">+' +
    arbitrageMoney(opportunity.grossMarginPercent) +
    '% bruto</span></div>' +
    '<div class="arbitrage-flow">' +
    '<div class="arbitrage-step acquire"><span>1 · ADQUIRIR</span><b>SELL · ' +
    arbitrageMoney(opportunity.buyRate) +
    '</b><small>Oferta ' +
    esc(opportunity.acquisitionOfferUuid) +
    '</small></div>' +
    '<div class="arbitrage-arrow">→</div>' +
    '<div class="arbitrage-step exit"><span>2 · PROPONER SALIDA</span><b>BUY · ' +
    arbitrageMoney(opportunity.sellRate) +
    '</b><small>Oferta ' +
    esc(opportunity.exitOfferUuid) +
    '</small></div></div>' +
    '<div class="arbitrage-metrics">' +
    '<div><span>Cantidad</span><b>' + arbitrageMoney(opportunity.quantityQusd) + ' QUSD</b></div>' +
    '<div><span>Capital</span><b>' + arbitrageMoney(opportunity.capitalRequiredFiat) + '</b></div>' +
    '<div><span>Venta estimada</span><b>' + arbitrageMoney(opportunity.quantityQusd * opportunity.sellRate) + '</b></div>' +
    '<div><span>Beneficio bruto</span><b>+' + arbitrageMoney(gross) + '</b></div>' +
    '</div>' +
    '<div class="arbitrage-safe-note">🛡️ ' + esc(netLabel) + ' · <strong>No se ejecuta ninguna compra ni venta.</strong></div>' +
    '</article>';
}

function drawArbitrage() {
  const box = $("arbitrageResults");
  if (!box) return;
  const opportunities = S.arbitrage?.opportunities || [];
  if (!opportunities.length) {
    const coverage = S.arbitrage?.coverage || {};
    const rejected = S.arbitrage?.rejected || {};
    const diagnostics =
      Number(coverage.fetched || 0) > 0
        ? '<div class="arbitrage-diagnostics">' +
          '<b>Diagnóstico del escaneo</b>' +
          '<span>Leídas: ' + arbitrageMoney(coverage.fetched) + '</span>' +
          '<span>Caducadas: ' + arbitrageMoney(rejected.staleOffers) + '</span>' +
          '<span>Inválidas: ' + arbitrageMoney(rejected.invalidOffers) + '</span>' +
          '<span>Sin spread rentable: ' + arbitrageMoney(rejected.nonProfitablePairs) + '</span>' +
          '<span>Sin liquidez suficiente: ' + arbitrageMoney(rejected.insufficientLiquidity) + '</span>' +
          '</div>'
        : '';
    box.innerHTML =
      '<div class="empty-inline">No hay oportunidades válidas con los parámetros actuales.</div>' +
      diagnostics +
      '<div class="empty-inline">Aumenta la antigüedad máxima si las ofertas están abiertas pero llevan más tiempo sin actualizarse.</div>';
    return;
  }
  box.innerHTML = opportunities.map(arbitragePlan).join("");
}

async function loadArbitrage() {
  const capital = Number($("arbCapital")?.value || S.arbitrage?.capitalLimitFiat || 1000);
  const age = Number($("arbAge")?.value || S.arbitrage?.maxAgeMs || 300000);
  const coin = ($("arbCoin")?.value || "").trim().toUpperCase();
  try {
    const query = new URLSearchParams({
      maxCapitalFiat: String(capital),
      maxAgeMs: String(age),
    });
    if (coin) query.set("coin", coin);
    S.arbitrage = await api("/api/arbitrage/scan?" + query.toString());
    drawArbitrage();
  } catch (e) {
    S.arbitrage = {
      mode: "error",
      capitalLimitFiat: capital,
      maxAgeMs: age,
      coin,
      opportunities: [],
      coverage: { fetched: 0 },
      error: errorText(e),
    };
    const box = $("arbitrageResults");
    if (box) box.innerHTML = '<div class="empty-inline">No se pudo leer el mercado: ' + esc(errorText(e)) + '</div>';
  }
}

function runArbitrageDemo() {
  const now = new Date().toISOString();
  const result = {
    mode: "demo",
    executionEnabled: false,
    capitalLimitFiat: 1000,
    maxAgeMs: 300000,
    coin: "BANK_CUP",
    coverage: { fetched: 2, total: 2, pagesFetched: 1, truncated: false },
    opportunities: [{
      coin: "BANK_CUP",
      buyOfferUuid: "demo-acquire-bank-cup",
      sellOfferUuid: "demo-exit-bank-cup",
      acquisitionOfferUuid: "demo-acquire-bank-cup",
      exitOfferUuid: "demo-exit-bank-cup",
      buyRate: 100,
      sellRate: 115,
      quantityQusd: 10,
      capitalRequiredFiat: 1000,
      grossProfitFiat: 150,
      grossMarginPercent: 15,
      buyFeeFiat: null,
      sellFeeFiat: null,
      totalFeesFiat: null,
      netProfitFiat: null,
      netMarginPercent: null,
      feesStatus: "unknown",
      observedAt: now,
      stale: false
    }]
  };
  S.arbitrage = result;
  drawArbitrage();
  toast("Simulación cargada · ninguna operación fue enviada", "success");
}

function bindArbitrage() {
  const form = $("arbitrageControls");
  if (!form) return;
  form.onsubmit = async (event) => {
    event.preventDefault();
    await loadArbitrage();
    toast(S.arbitrage?.mode === "read-only" ? "Escaneo completado · solo lectura" : "Escaneo no disponible", S.arbitrage?.mode === "read-only" ? "success" : "error");
  };
}
window.loadArbitrage = loadArbitrage;
window.runArbitrageDemo = runArbitrageDemo;
