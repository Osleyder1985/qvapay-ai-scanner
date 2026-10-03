#!/usr/bin/env node

const baseUrl = (process.env.ARBITRAGE_SMOKE_BASE_URL || "https://qvapay-ai-scanner.osleyder-gonzalez1985.workers.dev").replace(/\/$/, "");
const token = process.env.AI_AUDITOR_TOKEN;
const timeoutMs = 15000;

if (!token) {
  throw new Error("AI_AUDITOR_TOKEN is required.");
}

async function getMonitor() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(baseUrl + "/api/arbitrage/monitor", {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      signal: controller.signal,
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error("Monitor endpoint returned non-JSON response (HTTP " + response.status + ").");
    }
    if (!response.ok) {
      throw new Error("Monitor endpoint returned HTTP " + response.status + ": " + JSON.stringify(body));
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function snapshot(body) {
  const state = body?.state ?? {};
  return {
    mode: body?.mode,
    status: state.status,
    scanId: state.scanId ?? null,
    scannedAt: state.scannedAt ?? null,
    nextRunAt: state.nextRunAt ?? null,
    lastError: state.lastError ?? null,
    intervalSeconds: Number(body?.config?.intervalSeconds),
    marketOffers: body?.payload?.marketOffers ?? body?.snapshot?.marketOffers ?? null,
  };
}

function assertBase(body, label) {
  if (body?.mode !== "read-only") throw new Error(label + ": expected mode=read-only.");
  const interval = Number(body?.config?.intervalSeconds);
  if (!Number.isInteger(interval) || interval < 5 || interval > 300) {
    throw new Error(label + ": invalid configured intervalSeconds=" + String(body?.config?.intervalSeconds));
  }
  if (body?.state?.scannedAt && Number.isNaN(Date.parse(body.state.scannedAt))) {
    throw new Error(label + ": invalid scannedAt.");
  }
  if (body?.state?.nextRunAt && Number.isNaN(Date.parse(body.state.nextRunAt))) {
    throw new Error(label + ": invalid nextRunAt.");
  }
  if (body?.payload?.marketOffers != null && !Array.isArray(body.payload.marketOffers)) {
    throw new Error(label + ": marketOffers is not an array.");
  }
}

const first = await getMonitor();
assertBase(first, "initial GET");
const a = snapshot(first);
console.log("Initial monitor state:", JSON.stringify(a, null, 2));

const second = await getMonitor();
assertBase(second, "second GET");
const b = snapshot(second);
console.log("Immediate second GET:", JSON.stringify(b, null, 2));

const firstDue = a.nextRunAt ? Date.parse(a.nextRunAt) : NaN;
const secondChanged = a.scanId !== b.scanId || a.scannedAt !== b.scannedAt;
if (Number.isFinite(firstDue) && firstDue > Date.now() && secondChanged) {
  throw new Error("GET changed scan state before the persisted nextRunAt; read-only contract is violated.");
}

const interval = a.intervalSeconds;
const deadline = Date.now() + (interval + 15) * 1000;
let previous = b;
let observedTransition = false;

while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const current = await getMonitor();
  assertBase(current, "scheduler poll");
  const s = snapshot(current);

  if (s.lastError) {
    throw new Error("Production arbitrage monitor reports lastError: " + s.lastError);
  }

  if (s.scanId !== previous.scanId || s.scannedAt !== previous.scannedAt) {
    const previousAt = previous.scannedAt ? Date.parse(previous.scannedAt) : NaN;
    const currentAt = s.scannedAt ? Date.parse(s.scannedAt) : NaN;
    if (Number.isFinite(previousAt) && Number.isFinite(currentAt) && currentAt <= previousAt) {
      throw new Error("Scheduler transition did not advance scannedAt.");
    }
    if (s.status !== "running" && s.status !== "scanning") {
      throw new Error("Scheduler transition reached unexpected status=" + String(s.status));
    }
    observedTransition = true;
    console.log("Scheduler transition observed:", JSON.stringify(s, null, 2));
    previous = s;
    break;
  }

  if (s.status === "scanning") {
    console.log("Scheduler is executing the alarm; continuing to poll.");
  }
  previous = s;
}

if (!observedTransition) {
  throw new Error(
    "No new production scan was observed within configured interval + 15s. " +
    "intervalSeconds=" + interval + ", last scannedAt=" + String(previous.scannedAt) +
    ", nextRunAt=" + String(previous.nextRunAt),
  );
}

if (!previous.nextRunAt || Date.parse(previous.nextRunAt) <= Date.now()) {
  throw new Error("After a completed scan, nextRunAt was not scheduled in the future.");
}

console.log("Production arbitrage scheduler smoke: PASS");
console.log(JSON.stringify({
  configuredIntervalSeconds: interval,
  initialScanId: a.scanId,
  initialScannedAt: a.scannedAt,
  completedScanId: previous.scanId,
  completedScannedAt: previous.scannedAt,
  nextRunAt: previous.nextRunAt,
}, null, 2));
