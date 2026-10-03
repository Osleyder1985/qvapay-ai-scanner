/**
 * @file arbitrage-ui.js
 * @path src/frontend/arbitrage-ui.js
 * @description Visualización del monitor server-side de arbitraje y cuenta regresiva configurable.
 * @module frontend/arbitrage
 * @status active
 */

let arbitrageMonitorTimer = null;
let arbitrageLastScanId = null;
let arbitrageLoading = false;
let arbitrageCountdownDeadline = null;

function monitorIntervalSeconds() {
  const configured = Number(S.arbitrage?.config?.intervalSeconds ?? 10);
  return Number.isInteger(configured) && configured >= 5 && configured <= 300 ? configured : 10;
}

function arbitrageMoney(value) {
  return Number.isFinite(Number(value)) ? num(value, 2) : "—";
}

function arbitragePercent(value) {
  return Number.isFinite(Number(value)) ? num(value, 2) + "%" : "—";
}

function drawArbitrageMarket() {
  const box = $("arbitrageMarketResults");
  if (!box) return;
  const previousScrollLeft = box.scrollLeft;
  const offers = [
    ...(S.arbitrage?.marketOffers || []),
    ...(S.arbitrage?.marketBuyOffers || []),
  ];
  const margin = Number(S.arbitrage?.marketSimulation?.minMarginPercent ?? S.arbitrage?.config?.minMarginPercent ?? 5);

  if (!offers.length) {
    box.innerHTML = '<div class="empty-inline">No hay ofertas abiertas para ' +
      esc(S.arbitrage?.marketSimulation?.coin || S.arbitrage?.config?.coin || "la moneda seleccionada") +
      ' en el último escaneo.</div>';
    return;
  }

  box.innerHTML =
    '<div class="table-wrap arbitrage-table-wrap"><table class="market-table arbitrage-table">' +
    '<thead><tr>' +
    '<th>Oferta</th><th>QUSD disponible</th><th>Tasa QUSD/CUP</th><th>Capital CUP</th>' +
    '<th>Venta objetivo · QUSD/CUP</th><th>Retorno CUP</th><th>Ganancia CUP</th><th>Margen</th><th>Acción</th>' +
    '</tr></thead><tbody>' +
    offers.map((offer) => {
      const min = Number(offer.orderMinQusd);
      const max = Number(offer.orderMaxQusd);
      const limitText = Number.isFinite(min) || Number.isFinite(max)
        ? 'Límites: ' + (Number.isFinite(min) ? arbitrageMoney(min) : '0') +
          ' — ' + (Number.isFinite(max) ? arbitrageMoney(max) : 'sin máximo') + ' QUSD'
        : 'Sin límite adicional';
      return '<tr>' +
        '<td><span class="type ' + esc(String(offer.type || 'sell').toLowerCase()) + '">' + esc(String(offer.type || 'sell').toUpperCase()) + '</span><small>' + esc(offer.uuid) + '</small></td>' +
        '<td><strong>' + arbitrageMoney(offer.availableQusd) + '</strong><small>' + esc(limitText) + '</small></td>' +
        '<td><strong>' + arbitrageMoney(offer.purchaseRate) + '</strong><small>CUP por 1 QUSD</small></td>' +
        '<td><strong>' + arbitrageMoney(offer.capitalRequiredFiat) + '</strong><small>CUP</small></td>' +
        '<td><strong class="arbitrage-target">' + arbitrageMoney(offer.targetSaleRate) + '</strong><small>+' + margin.toFixed(2) + '% objetivo</small></td>' +
        '<td><strong>' + arbitrageMoney(offer.targetSaleProceedsFiat) + '</strong><small>CUP</small></td>' +
        '<td><strong class="arbitrage-profit">+' + arbitrageMoney(offer.projectedGrossProfitFiat) + '</strong><small>CUP</small></td>' +
        '<td><strong class="arbitrage-profit">+' + arbitragePercent(offer.projectedGrossMarginPercent ?? margin) + '</strong><small>sobre capital</small></td>' +
        '<td><button class="button primary compact" type="button" onclick="applyArbitrageOffer(\'' + esc(String(offer.uuid)) + '\')">Aceptar</button></td>' +
        '</tr>';
    }).join("") +
    '</tbody></table></div>';
  box.scrollLeft = previousScrollLeft;
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

function syncCountdownDeadline() {
  const next = S.arbitrage?.state?.nextRunAt
    ? Date.parse(S.arbitrage.state.nextRunAt)
    : NaN;
  if (Number.isFinite(next)) {
    arbitrageCountdownDeadline = next;
    return;
  }
  if (!Number.isFinite(arbitrageCountdownDeadline) || arbitrageCountdownDeadline <= Date.now()) {
    arbitrageCountdownDeadline = Date.now() + monitorIntervalSeconds() * 1000;
  }
}

function nextSeconds() {
  syncCountdownDeadline();
  return Number.isFinite(arbitrageCountdownDeadline)
    ? Math.max(0, Math.ceil((arbitrageCountdownDeadline - Date.now()) / 1000))
    : null;
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
    syncCountdownDeadline();
    if (data.state?.scanId && data.state.scanId !== previousScan) {
      arbitrageLastScanId = data.state.scanId;
      drawArbitrage();
      if (!silent) toast("Mercado actualizado · " + data.config.coin, "success");
    } else {
      drawArbitrage();
    }
  } catch (e) {
    const existing = S.arbitrage || {};
    const message = errorText(e);
    arbitrageCountdownDeadline = Date.now() + monitorIntervalSeconds() * 1000;
    S.arbitrage = {
      ...existing,
      state: {
        ...(existing.state || {}),
        status: "error",
        lastError: message,
        nextRunAt: new Date(arbitrageCountdownDeadline).toISOString(),
      },
    };
    drawArbitrage();
    if (!silent) toast("No se pudo leer el monitor: " + errorText(e), "error");
  } finally {
    arbitrageLoading = false;
  }
}

async function applyArbitrageOffer(id) {
  const offer = [
    ...(S.arbitrage?.marketOffers || []),
    ...(S.arbitrage?.marketBuyOffers || []),
  ].find((item) => String(item.uuid) === String(id));
  if (!offer) return toast("La oferta ya no está disponible en el snapshot.", "error");
  const rate = Number(offer.purchaseRate);
  const side = String(offer.type || "sell").toLowerCase();
  const action = side === "buy" ? "vender QUSD" : "comprar QUSD";
  if (!confirm("Aceptar esta oferta para " + action + " a " + arbitrageMoney(rate) + "?")) return;
  try {
    await api("/api/p2p/" + encodeURIComponent(id) + "/apply", { method: "POST" });
    toast("Oferta aceptada por QvaPay.", "success");
    await fetchArbitrageMonitor({ silent: false });
  } catch (e) {
    toast("No se pudo aceptar la oferta: " + errorText(e), "error");
  }
}

async function saveArbitrageConfig() {
  const margin = Number($("settingsArbMargin")?.value || 5);
  const intervalSeconds = Number($("settingsArbInterval")?.value || 10);
  const coin = ($("settingsArbCoin")?.value || "BANK_CUP").trim().toUpperCase() || "BANK_CUP";
  const cupBudget = Number($("settingsArbCupBudget")?.value || 0);
  const maxBuyRateValue = $("settingsArbMaxBuyRate")?.value?.trim() ?? "";
  const minSellRateValue = $("settingsArbMinSellRate")?.value?.trim() ?? "";
  const maxBuyRate = maxBuyRateValue === "" ? null : Number(maxBuyRateValue);
  const minSellRate = minSellRateValue === "" ? null : Number(minSellRateValue);
  const autoEnabled = Boolean($("settingsArbAutoEnabled")?.checked);
  if (!Number.isFinite(margin) || margin < 0) {
    toast("El margen debe ser un número no negativo.", "error");
    return;
  }
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 5 || intervalSeconds > 300) {
    toast("El intervalo debe estar entre 5 y 300 segundos.", "error");
    return;
  }
  if (!Number.isFinite(cupBudget) || cupBudget < 0) {
    toast("El presupuesto CUP debe ser un número no negativo.", "error");
    return;
  }
  if (maxBuyRate !== null && (!Number.isFinite(maxBuyRate) || maxBuyRate <= 0)) {
    toast("La tasa máxima de compra debe ser mayor que 0.", "error");
    return;
  }
  if (minSellRate !== null && (!Number.isFinite(minSellRate) || minSellRate <= 0)) {
    toast("La tasa mínima de venta debe ser mayor que 0.", "error");
    return;
  }
  if (autoEnabled && maxBuyRate === null && minSellRate === null) {
    toast("Configura al menos una tasa límite antes de activar el bot.", "error");
    return;
  }
  try {
    const saved = await api("/api/arbitrage/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        minMarginPercent: margin,
        coin,
        intervalSeconds,
        autoEnabled,
        maxBuyRate,
        minSellRate,
        cupBudget,
      }),
    });
    // Reflect the saved cadence immediately instead of waiting for the next
    // Durable Object alarm to update the state row.
    S.arbitrage = {
      ...(S.arbitrage || {}),
      config: {
        ...(S.arbitrage?.config || {}),
        minMarginPercent: saved.minMarginPercent,
        coin: saved.coin,
        intervalSeconds: saved.intervalSeconds,
        autoEnabled: saved.autoEnabled,
        maxBuyRate: saved.maxBuyRate,
        minSellRate: saved.minSellRate,
        cupBudget: saved.cupBudget,
      },
      state: {
        ...(S.arbitrage?.state || {}),
        nextRunAt: saved.nextRunAt,
        status: "scheduled",
        lastError: null,
      },
    };
    arbitrageCountdownDeadline = Date.parse(saved.nextRunAt);
    nav();
    drawArbitrage();
    toast("Configuración de arbitraje guardada · intervalo " + intervalSeconds + " s", "success");
    await fetchArbitrageMonitor({ silent: true });
  } catch (e) {
    toast("No se pudo actualizar el monitor: " + errorText(e), "error");
  }
}

function bindArbitrageSettings() {
  const form = $("arbitrageSettingsForm");
  if (!form) return;
  form.onsubmit = async (event) => {
    event.preventDefault();
    await saveArbitrageConfig();
  };
}

function monitorTick() {
  const seconds = nextSeconds();
  drawArbitrage();
  if (seconds === 0) {
    // Do not manufacture a new 10-second deadline while the server is running.
    // The next deadline must come from the persisted monitor state.
    arbitrageCountdownDeadline = null;
    void fetchArbitrageMonitor({ silent: true });
  }
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
window.applyArbitrageOffer = applyArbitrageOffer;
window.bindArbitrageSettings = bindArbitrageSettings;
window.runArbitrageDemo = runArbitrageDemo;
window.startArbitragePolling = startArbitragePolling;
window.stopArbitragePolling = stopArbitragePolling;
