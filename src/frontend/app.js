const state = {
  page: 1,
  take: 100,
  applyingOfferId: null,
  appliedOfferIds: new Set(),
  activeOperationId: localStorage.getItem("qvapay.activeOperationId") || null,
  operationTimer: null,
  autoApplyStatusTimer: null,
  autoApplyConfig: null,
};

const $ = (id) => document.getElementById(id);

function offerId(offer) {
  return String(offer.uuid ?? offer.id ?? "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function number(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n)
    ? n.toLocaleString("es-ES", { maximumFractionDigits: digits })
    : "—";
}

function rate(offer) {
  const amount = Number(offer.amount);
  const receive = Number(offer.receive);
  return amount > 0 ? receive / amount : null;
}

function verification(user) {
  const checks = [];
  if (user?.kyc) checks.push("KYC");
  if (user?.phone_verified) checks.push("TEL");
  if (user?.telegram_verified) checks.push("TG");
  if (user?.vip) checks.push("VIP");
  if (user?.golden_check) checks.push("GC");

  return checks.length
    ? '<span class="verified">' + checks.join(" · ") + "</span>"
    : '<span class="unverified">—</span>';
}

function operationPayload(payload) {
  return payload?.qvapay?.p2p ??
    payload?.qvapay?.data ??
    payload?.qvapay ??
    payload?.data?.p2p ??
    payload?.data ??
    payload;
}

function operationValue(operation, keys, fallback = "—") {
  for (const key of keys) {
    const value = key.split(".").reduce((current, part) => current?.[part], operation);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function operationState(operation) {
  return String(
    operationValue(operation, ["status", "state", "p2p_status", "offer.status"], "unknown")
  ).toLowerCase();
}

function isTerminalOperationState(state) {
  return ["completed", "cancelled", "canceled", "rejected", "expired"].includes(state);
}

function renderOperation(operation) {
  const panel = $("operationPanel");
  const details = $("operationDetails");

  if (!operation || !state.activeOperationId) {
    panel.hidden = true;
    details.innerHTML = "";
    return;
  }

  const status = operationState(operation);
  const type = String(operationValue(operation, ["type", "offer.type"], "")).toUpperCase();
  const coin = operationValue(operation, ["coin", "offer.coin"]);
  const amount = operationValue(operation, ["amount", "offer.amount"]);
  const receive = operationValue(operation, ["receive", "offer.receive"]);
  const username = operationValue(operation, [
    "Peer.username", "Peer.name", "peer.username", "peer.name",
    "User.username", "User.name", "user.username", "user.name"
  ]);
  const updatedAt = operationValue(operation, ["updated_at", "updatedAt", "offer.updated_at"]);

  details.innerHTML =
    "<div><span>UUID</span><strong>" + escapeHtml(state.activeOperationId) + "</strong></div>" +
    "<div><span>Tipo</span><strong>" + escapeHtml(type || "—") + "</strong></div>" +
    '<div><span>Estado</span><strong class="operation-status">' + escapeHtml(status.toUpperCase()) + "</strong></div>" +
    "<div><span>Moneda</span><strong>" + escapeHtml(coin) + "</strong></div>" +
    "<div><span>Monto</span><strong>" + escapeHtml(number(amount)) + "</strong></div>" +
    "<div><span>Recibe</span><strong>" + escapeHtml(number(receive)) + "</strong></div>" +
    "<div><span>Contraparte</span><strong>" + escapeHtml(username) + "</strong></div>" +
    "<div><span>Actualizado</span><strong>" + escapeHtml(updatedAt === "—" ? "—" : new Date(updatedAt).toLocaleString("es-ES")) + "</strong></div>";

  panel.hidden = false;

  if (isTerminalOperationState(status)) {
    stopOperationTracking();
  }
}

function stopOperationTracking() {
  if (state.operationTimer !== null) {
    window.clearInterval(state.operationTimer);
    state.operationTimer = null;
  }
}

async function loadOperation(updateStatus = false) {
  if (!state.activeOperationId) {
    renderOperation(null);
    return;
  }

  try {
    const response = await fetch(
      "/api/p2p/" + encodeURIComponent(state.activeOperationId),
      { cache: "no-store" }
    );
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(describeQvaPayError(payload));
    }

    const operation = operationPayload(payload);
    renderOperation(operation);
    if (updateStatus) {
      $("status").textContent = "Operación actualizada desde QvaPay.";
    }
  } catch (error) {
    $("status").textContent =
      "⚠️ No se pudo actualizar la operación: " +
      (error instanceof Error ? error.message : String(error));
  }
}

function startOperationTracking() {
  stopOperationTracking();
  if (!state.activeOperationId) return;

  void loadOperation();
  state.operationTimer = window.setInterval(() => {
    void loadOperation();
  }, 10000);
}

function describeQvaPayError(payload) {
  const detail = payload?.detail;

  if (typeof detail === "string" && detail) return detail;

  if (detail && typeof detail === "object") {
    const candidates = [detail.message, detail.error, detail.detail, detail.reason];
    const message = candidates.find((value) => typeof value === "string" && value.trim());
    if (message) return message;
  }

  return payload?.error || "QvaPay rechazó la aplicación.";
}

async function applyToOffer(offer) {
  const uuid = offerId(offer);
  if (!uuid) {
    $("status").textContent = "⚠️ La oferta no tiene UUID disponible.";
    return;
  }

  if (state.applyingOfferId) return;

  const user = offer.User || {};
  const type = String(offer.type || "").toLowerCase();
  const amount = number(offer.amount);
  const receive = number(offer.receive);
  const coin = String(offer.coin || "—");
  const username = String(user.username || user.name || "—");

  let warning =
    "QvaPay asignará esta oferta a tu cuenta si la operación es aceptada.\n\n" +
    "Oferta: " + username + "\n" +
    "Tipo: " + type.toUpperCase() + "\n" +
    "Moneda: " + coin + "\n" +
    "Monto: " + amount + "\n" +
    "Recibe: " + receive;

  if (type === "buy") {
    warning +=
      "\n\n⚠️ Según la API de QvaPay, al aplicar a una oferta BUY " +
      "puede descontarse automáticamente de tu saldo el monto de garantía.";
  }

  warning += "\n\n¿Quieres aplicar a esta oferta ahora?";

  if (!window.confirm(warning)) {
    $("status").textContent = "Aplicación cancelada.";
    return;
  }

  state.applyingOfferId = uuid;
  renderOffers(window.currentOffersPayload);
  $("status").textContent = "Aplicando a la oferta en QvaPay…";

  try {
    const response = await fetch(
      "/api/p2p/" + encodeURIComponent(uuid) + "/apply",
      { method: "POST", headers: { Accept: "application/json" }, cache: "no-store" }
    );
    const payload = await response.json();

    if (!response.ok) throw new Error(describeQvaPayError(payload));

    state.appliedOfferIds.add(uuid);
    state.activeOperationId = uuid;
    localStorage.setItem("qvapay.activeOperationId", uuid);
    $("status").textContent =
      "✅ Aplicación aceptada por QvaPay. La oferta queda asignada a tu operación.";
    await loadOffers(false);
    await loadOperation(true);
    startOperationTracking();
  } catch (error) {
    $("status").textContent = "⚠️ " + (error instanceof Error ? error.message : String(error));
    renderOffers(window.currentOffersPayload);
  } finally {
    state.applyingOfferId = null;
    renderOffers(window.currentOffersPayload);
  }
}

function renderOffers(data) {
  window.currentOffersPayload = data;
  const tbody = $("offers");
  tbody.innerHTML = "";

  const offers = Array.isArray(data?.data) ? data.data : [];
  if (!offers.length) {
    tbody.appendChild($("emptyTemplate").content.cloneNode(true));
    return;
  }

  for (const offer of offers) {
    const user = offer.User || {};
    const currentRate = rate(offer);
    const id = offerId(offer);
    const applied = state.appliedOfferIds.has(id);
    const applying = state.applyingOfferId === id;
    const tr = document.createElement("tr");
    const range = offer.order_min == null && offer.order_max == null
      ? "—"
      : number(offer.order_min) + " – " + number(offer.order_max);

    const actionLabel = applied ? "✓ Aplicada" : applying ? "Aplicando…" : "Aplicar a esta oferta";

    tr.innerHTML =
      '<td><span class="badge ' + escapeHtml(offer.type) + '">' + escapeHtml(offer.type) + "</span></td>" +
      "<td>" + escapeHtml(offer.coin) + "</td>" +
      '<td class="rate">' + (currentRate === null ? "—" : number(currentRate, 4)) + "</td>" +
      "<td>" + number(offer.amount) + "</td>" +
      "<td>" + number(offer.receive) + "</td>" +
      "<td>" + number(offer.available_amount) + "</td>" +
      "<td>" + range + "</td>" +
      "<td>" + escapeHtml(user.username || user.name || "—") + "</td>" +
      "<td>" + (user.rating_avg == null ? "—" : number(user.rating_avg, 2) + " (" + number(user.rating_count, 0) + ")") + "</td>" +
      "<td>" + number((user._count?.P2P || 0) + (user._count?.P2P_Peer || 0), 0) + "</td>" +
      "<td>" + verification(user) + "</td>" +
      '<td><button class="apply-button secondary" type="button" data-offer-id="' + escapeHtml(id) + '"' +
      (applied || applying || !id ? " disabled" : "") + ">" + actionLabel + "</button></td>";

    const applyButton = tr.querySelector(".apply-button");
    if (applyButton && !applied && !applying) {
      applyButton.addEventListener("click", () => { void applyToOffer(offer); });
    }

    tbody.appendChild(tr);
  }
}

function syncBestRateOption() {
  const option = [...$("orderBy").options].find((item) => item.value === "best_rate");
  const valid = Boolean($("type").value && $("coin").value.trim());
  option.disabled = !valid;
  if (!valid && $("orderBy").value === "best_rate") $("orderBy").value = "updated_at";
}

function queryString() {
  const params = new URLSearchParams({
    page: String(state.page),
    take: String(state.take),
    orderBy: $("orderBy").value,
    orderType: $("orderType").value,
  });

  for (const id of ["type", "coin", "min", "max"]) {
    const value = $(id).value.trim();
    if (value) params.set(id, value);
  }
  if ($("onlyVip").checked) params.set("only_vip", "1");
  return params;
}

async function loadOffers(updateStatus = true) {
  if (updateStatus) $("status").textContent = "Consultando mercado…";
  $("refreshButton").disabled = true;

  try {
    const response = await fetch("/api/p2p?" + queryString(), { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Error consultando QvaPay");

    renderOffers(payload);
    const total = Number(payload.total ?? payload.data?.length ?? 0);
    const perPage = Number(payload.per_page ?? state.take);
    const lastPage = Math.max(1, Math.ceil(total / perPage));
    $("totalOffers").textContent = number(total, 0);
    $("pageInfo").textContent = state.page + " / " + lastPage;
    $("paginationLabel").textContent = "Página " + state.page + " de " + lastPage;
    $("previousButton").disabled = state.page <= 1;
    $("nextButton").disabled = state.page >= lastPage;
    $("updatedAt").textContent = new Date().toLocaleTimeString("es-ES");
    if (updateStatus) $("status").textContent = "Mercado actualizado.";
  } catch (error) {
    $("status").textContent = "⚠️ " + (error instanceof Error ? error.message : String(error));
  } finally {
    $("refreshButton").disabled = false;
  }
}

function setAutoApplyField(id, value) {
  $(id).value = value === null || value === undefined ? "" : value;
}

function renderAutoApplyConfig(config) {
  state.autoApplyConfig = config;
  $("autoApplyEnabled").checked = Boolean(config.enabled);
  $("autoApplyType").value = config.type || "sell";
  $("autoApplyCoin").value = config.coin || "";
  setAutoApplyField("autoApplyRateMin", config.rateMin);
  setAutoApplyField("autoApplyRateMax", config.rateMax);
  setAutoApplyField("autoApplyAmountMin", config.amountMin);
  setAutoApplyField("autoApplyAmountMax", config.amountMax);
  setAutoApplyField("autoApplyDailyMax", config.dailyMaxQusd);
  $("autoApplyConcurrent").value = config.maxConcurrent ?? 1;
}

function nullableNumberFromInput(id) {
  const value = $(id).value.trim();
  return value === "" ? null : Number(value);
}

function autoApplyFormPayload(enabledOverride) {
  return {
    enabled: enabledOverride ?? $("autoApplyEnabled").checked,
    type: $("autoApplyType").value,
    coin: $("autoApplyCoin").value.trim().toUpperCase(),
    rateMin: nullableNumberFromInput("autoApplyRateMin"),
    rateMax: nullableNumberFromInput("autoApplyRateMax"),
    amountMin: nullableNumberFromInput("autoApplyAmountMin"),
    amountMax: nullableNumberFromInput("autoApplyAmountMax"),
    dailyMaxQusd: nullableNumberFromInput("autoApplyDailyMax"),
    maxConcurrent: Number($("autoApplyConcurrent").value),
  };
}

async function saveAutoApplyConfig(event) {
  event.preventDefault();
  const enabling = $("autoApplyEnabled").checked;

  if (enabling && !state.autoApplyConfig?.enabled) {
    const confirmed = window.confirm(
      "⚠️ Vas a activar Auto-Apply.\n\n" +
      "El sistema podrá ejecutar POST /p2p/:uuid/apply automáticamente en QvaPay " +
      "cuando una oferta cumpla las reglas configuradas.\n\n" +
      "¿Activar Auto-Apply?"
    );
    if (!confirmed) {
      $("autoApplyEnabled").checked = false;
      return;
    }
  }

  $("autoApplySaveButton").disabled = true;
  $("autoApplyConfigStatus").textContent = "Guardando configuración…";

  try {
    const response = await fetch("/api/auto-apply/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(autoApplyFormPayload()),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo guardar la configuración.");
    renderAutoApplyConfig(payload.config);
    $("autoApplyConfigStatus").textContent = "✅ Configuración guardada.";
    await loadAutoApplyStatus();
  } catch (error) {
    $("autoApplyConfigStatus").textContent = "⚠️ " + (error instanceof Error ? error.message : String(error));
  } finally {
    $("autoApplySaveButton").disabled = false;
  }
}

async function loadAutoApplyConfig() {
  try {
    const response = await fetch("/api/auto-apply/config", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo cargar Auto-Apply.");
    renderAutoApplyConfig(payload.config);
  } catch (error) {
    $("autoApplyConfigStatus").textContent = "⚠️ " + (error instanceof Error ? error.message : String(error));
  }
}

async function loadAutoApplyStatus() {
  try {
    const response = await fetch("/api/auto-apply/status", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo consultar el estado.");
    const status = payload.status;
    $("autoApplyRuntimeState").textContent = status.running ? "ACTIVO" : "PAUSADO";
    $("autoApplyDailyValue").textContent = number(status.dailyAppliedQusd) + " QUSD";
    $("autoApplyLastScan").textContent = status.lastScanAt ? new Date(status.lastScanAt).toLocaleTimeString("es-ES") : "—";
    $("autoApplyLastAction").textContent = status.lastActionAt ? new Date(status.lastActionAt).toLocaleTimeString("es-ES") : "—";
    $("autoApplyMessage").textContent = status.lastMessage || "—";
  } catch (error) {
    $("autoApplyMessage").textContent = "⚠️ " + (error instanceof Error ? error.message : String(error));
  }
}

["type", "coin"].forEach((id) => $(id).addEventListener("input", syncBestRateOption));
syncBestRateOption();

$("filters").addEventListener("submit", (event) => {
  event.preventDefault();
  state.page = 1;
  void loadOffers();
});

$("refreshButton").addEventListener("click", () => { void loadOffers(); });
$("refreshOperationButton").addEventListener("click", () => { void loadOperation(true); });
$("autoApplyForm").addEventListener("submit", saveAutoApplyConfig);

$("previousButton").addEventListener("click", () => {
  if (state.page > 1) { state.page--; void loadOffers(); }
});

$("nextButton").addEventListener("click", () => {
  state.page++;
  void loadOffers();
});

void loadAutoApplyConfig();
void loadAutoApplyStatus();
state.autoApplyStatusTimer = window.setInterval(() => { void loadAutoApplyStatus(); }, 5000);
void loadOffers();