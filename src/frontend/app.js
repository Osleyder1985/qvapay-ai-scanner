const state = {
  page: 1,
  take: 100,
  applyingOfferId: null,
  appliedOfferIds: new Set(),
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
    .replaceAll('"', "&quot;")
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

function describeQvaPayError(payload) {
  const detail = payload?.detail;

  if (typeof detail === "string" && detail) {
    return detail;
  }

  if (detail && typeof detail === "object") {
    const candidates = [
      detail.message,
      detail.error,
      detail.detail,
      detail.reason,
    ];

    const message = candidates.find(
      (value) => typeof value === "string" && value.trim()
    );

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
      {
        method: "POST",
        headers: { Accept: "application/json" },
        cache: "no-store",
      }
    );

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(describeQvaPayError(payload));
    }

    state.appliedOfferIds.add(uuid);
    $("status").textContent =
      "✅ Aplicación aceptada por QvaPay. La oferta queda asignada a tu operación.";
    await loadOffers(false);
  } catch (error) {
    $("status").textContent =
      "⚠️ " + (error instanceof Error ? error.message : String(error));
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

    const range =
      offer.order_min == null && offer.order_max == null
        ? "—"
        : number(offer.order_min) + " – " + number(offer.order_max);

    const actionLabel = applied
      ? "✓ Aplicada"
      : applying
        ? "Aplicando…"
        : "Aplicar a esta oferta";

    tr.innerHTML =
      '<td><span class="badge ' +
      escapeHtml(offer.type) +
      '">' +
      escapeHtml(offer.type) +
      "</span></td>" +
      "<td>" +
      escapeHtml(offer.coin) +
      "</td>" +
      '<td class="rate">' +
      (currentRate === null ? "—" : number(currentRate, 4)) +
      "</td>" +
      "<td>" +
      number(offer.amount) +
      "</td>" +
      "<td>" +
      number(offer.receive) +
      "</td>" +
      "<td>" +
      number(offer.available_amount) +
      "</td>" +
      "<td>" +
      range +
      "</td>" +
      "<td>" +
      escapeHtml(user.username || user.name || "—") +
      "</td>" +
      "<td>" +
      (user.rating_avg == null
        ? "—"
        : number(user.rating_avg, 2) +
          " (" +
          number(user.rating_count, 0) +
          ")") +
      "</td>" +
      "<td>" +
      number(
        (user._count?.P2P || 0) + (user._count?.P2P_Peer || 0),
        0
      ) +
      "</td>" +
      "<td>" +
      verification(user) +
      "</td>" +
      '<td><button class="apply-button secondary" type="button" data-offer-id="' +
      escapeHtml(id) +
      '"' +
      (applied || applying || !id ? " disabled" : "") +
      ">" +
      actionLabel +
      "</button></td>";

    const applyButton = tr.querySelector(".apply-button");
    if (applyButton && !applied && !applying) {
      applyButton.addEventListener("click", () => {
        void applyToOffer(offer);
      });
    }

    tbody.appendChild(tr);
  }
}

function syncBestRateOption() {
  const option = [...$("orderBy").options].find(
    (item) => item.value === "best_rate"
  );
  const valid = Boolean($("type").value && $("coin").value.trim());

  option.disabled = !valid;

  if (!valid && $("orderBy").value === "best_rate") {
    $("orderBy").value = "updated_at";
  }
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

  if ($("onlyVip").checked) {
    params.set("only_vip", "1");
  }

  return params;
}

async function loadOffers(updateStatus = true) {
  if (updateStatus) $("status").textContent = "Consultando mercado…";
  $("refreshButton").disabled = true;

  try {
    const response = await fetch("/api/p2p?" + queryString(), {
      cache: "no-store",
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Error consultando QvaPay");
    }

    renderOffers(payload);

    const total = Number(payload.total ?? payload.data?.length ?? 0);
    const perPage = Number(payload.per_page ?? state.take);
    const lastPage = Math.max(1, Math.ceil(total / perPage));

    $("totalOffers").textContent = number(total, 0);
    $("pageInfo").textContent = state.page + " / " + lastPage;
    $("paginationLabel").textContent =
      "Página " + state.page + " de " + lastPage;

    $("previousButton").disabled = state.page <= 1;
    $("nextButton").disabled = state.page >= lastPage;
    $("updatedAt").textContent = new Date().toLocaleTimeString("es-ES");
    if (updateStatus) $("status").textContent = "Mercado actualizado.";
  } catch (error) {
    $("status").textContent =
      "⚠️ " + (error instanceof Error ? error.message : String(error));
  } finally {
    $("refreshButton").disabled = false;
  }
}

["type", "coin"].forEach((id) =>
  $(id).addEventListener("input", syncBestRateOption)
);

syncBestRateOption();

$("filters").addEventListener("submit", (event) => {
  event.preventDefault();
  state.page = 1;
  void loadOffers();
});

$("refreshButton").addEventListener("click", () => {
  void loadOffers();
});

$("previousButton").addEventListener("click", () => {
  if (state.page > 1) {
    state.page--;
    void loadOffers();
  }
});

$("nextButton").addEventListener("click", () => {
  state.page++;
  void loadOffers();
});

void loadOffers();
