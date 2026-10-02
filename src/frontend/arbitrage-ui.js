/**
 * @file arbitrage-ui.js
 * @path src/frontend/arbitrage-ui.js
 * @description Visualización del monitor server-side de arbitraje y cuenta regresiva de 10 segundos.
 * @module frontend/arbitrage
 * @status active
 */

let arbitrageMonitorTimer = null;
let arbitrageLastScanId = null;
let arbitrageLoading = false;

function arbitrageMoney(value) {
  return Number.isFinite(Number(value)) ? num(value, 2) : "—";
}

function arbitragePercent(value) {
  return Number.isFinite(Number(value)) ? num(value, 2) + "%" : "—";
}

function drawArbitrageMarket() {
  const box = $("arbitrageMarketResults");
  if (!box) return;
  const offers = S.arbitrage?.marketOffers || [];
  const margin = Number(S.arbitrage?.marketSimulation?.minMarginPercent ?? S.arbitrage?.config?.minMarginPercent ?? 5);

  if (!offers.length) {
    box.innerHTML = '<div class="empty-inline">No hay ofertas SELL abiertas para ' +
      esc(S.arbitrage?.marketSimulation?.coin || S.arbitrage?.config?.coin || "la moneda seleccionada") +
      ' en el último escaneo.</div>';
    return;
  }

  box.innerHTML =
    '<div class="table-wrap arbitrage-table-wrap"><table class="market-table arbitrage-table">' +
    '<thead><tr>' +
    '<th>Oferta SELL</th><th>QUSD disponible</th><th>Compra · QUSD/CUP</th><th>Capital CUP</th>' +
    '<th>Venta objetivo · QUSD/CUP</th><th>Retorno CUP</th><th>Ganancia CUP</th><th>Margen</th>' +
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
        '<td><strong>' + arbitrageMoney(offer.purchaseRate) + '</strong><small>CUP por 1 QUSD</small></td>' +
        '<td><strong>' + arbitrageMoney(offer.capitalRequiredFiat) + '</strong><small>CUP</small></td>' +
        '<td><strong class="arbitrage-target">' + arbitrageMoney(offer.targetSaleRate) + '</strong><small>+' + margin.toFixed(2) + '% objetivo</small></td>' +
        '<td><strong>' + arbitrageMoney(offer.targetSaleProceedsFiat) + '</strong><small>CUP</small></td>' +
        '<td><strong class="arbitrage-profit">+' + arbitrageMoney(offer.projectedGrossProfitFiat) + '</strong><small>CUP</small></td>' +
        '<td><strong class="arbitrage-profit">+' + arbitragePercent(offer.projectedGrossMarginPercent ?? margin) + '</strong><small>sobre capital</small></td>' +
        '</tr>';
    }).join("") +
    '</tbody></table></div>';
}

function drawArbitrageSignals() {
  const box = $("arbitrageResults");
  if (!box) return;
  const opportunities = S.arbitrage?.opportunities || [];
  box.innerHTML = opportunities.length
    ? opportunities.map((o) => '<div class="arbitrage-signal"><b>' + esc(o.coin) + '</b> · ' +
      arbitragePercent(o.grossMarginPercent) + ' bruto · ' + arbitrageMoney(o.capitalRequiredFiat) +
      ' → ' + arbitrageMoney(Number(o.capitalRequiredFiat) + Number(o.grossProfitFiat)) + '</div>').join("")
    : '<div class="empty-inline">La simulación se calcula sobre cada oferta SELL del último snapshot. No se envían órdenes.</div>';
}

function nextSeconds() {
  const next = S.arbitrage?.state?.nextRunAt ? Date.parse(S.arbitrage.state.nextRunAt) : NaN;
  if (!Number.isFinite(next)) return null;
  return Math.max(0, Math.ceil((next - Date.now()) / 1000));
}

function drawArbitrage() {
  drawArbitrageMarket();
  drawArbitrageSignals();

  const status = $("arbitrageLiveStatus");
  const countdown = nextSeconds();
  const state = S.arbitrage?.state;
  if (status) {
    if (state?.status === "error") {
      const detail = state?.lastError ? " · " + state.lastError : "";
      status.textContent = "⚠ ERROR" + detail + " · reintentando en " + (countdown ?? 10) + " s";
    } else if (countdown !== null) {
      status.textContent = "MONITOR SERVER · siguiente escaneo en " + countdown + " s";
    } else if (state?.scannedAt) {
      status.textContent = "MONITOR SERVER · preparando siguiente escaneo…";
    } else {
      status.textContent = "MONITOR SERVER · iniciando…";
    }
  }

  const countdownBox = $("arbitrageCountdown");
  if (countdownBox) countdownBox.textContent = countdown === null ? "—" : String(countdown);
}

async function fetchArbitrageMonitor({ silent = true } = {}) {
  if (arbitrageLoading) return;
  arbitrageLoading = true;
  try {
    const previousScan = S.arbitrage?.state?.scanId;
    const data = await api("/api/arbitrage/monitor");
    S.arbitrage = data;
    if (data.state?.scanId && data.state.scanId !== previousScan) {
      arbitrageLastScanId = data.state.scanId;
      drawArbitrage();
      if (!silent) toast("Mercado actualizado · " + data.config.coin, "success");
    } else {
      drawArbitrage();
    }
  } catch (e) {
    const existing = S.arbitrage || {};
    S.arbitrage = {
      ...existing,
      state: { ...(existing.state || {}), status: "error", lastError: errorText(e) },
    };
    drawArbitrage();
    if (!silent) toast("No se pudo leer el monitor: " + errorText(e), "error");
  } finally {
    arbitrageLoading = false;
  }
}

async function saveArbitrageConfig() {
  const margin = Number($("arbMargin")?.value || 5);
  const coin = ($("arbCoin")?.value || "BANK_CUP").trim().toUpperCase() || "BANK_CUP";
  if (!Number.isFinite(margin) || margin < 0) {
    toast("El margen debe ser un número no negativo.", "error");
    return;
  }
  try {
    await api("/api/arbitrage/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minMarginPercent: margin, coin }),
    });
    await fetchArbitrageMonitor({ silent: false });
  } catch (e) {
    toast("No se pudo actualizar el monitor: " + errorText(e), "error");
  }
}

function monitorTick() {
  drawArbitrage();
  const seconds = nextSeconds();
  if (seconds === 0) void fetchArbitrageMonitor({ silent: true });
}

function stopArbitragePolling() {
  if (arbitrageMonitorTimer !== null) {
    clearInterval(arbitrageMonitorTimer);
    arbitrageMonitorTimer = null;
  }
}

function startArbitragePolling() {
  stopArbitragePolling();
  void fetchArbitrageMonitor({ silent: true });
  arbitrageMonitorTimer = window.setInterval(monitorTick, 1000);
}

function runArbitrageDemo() {
  toast("El escaneo real corre en Cloudflare. Esta pantalla solo visualiza el snapshot y la cuenta regresiva.", "info");
}

function bindArbitrage() {
  const form = $("arbitrageControls");
  if (!form) return;
  form.onsubmit = async (event) => {
    event.preventDefault();
    await saveArbitrageConfig();
  };
  startArbitragePolling();
}

window.loadArbitrage = fetchArbitrageMonitor;
window.runArbitrageDemo = runArbitrageDemo;
window.startArbitragePolling = startArbitragePolling;
window.stopArbitragePolling = stopArbitragePolling;
