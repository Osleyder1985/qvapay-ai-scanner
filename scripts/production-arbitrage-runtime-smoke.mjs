#!/usr/bin/env node

const baseUrl = (process.env.ARBITRAGE_SMOKE_BASE_URL || "https://qvapay-ai-scanner.osleyder-gonzalez1985.workers.dev").replace(/\/$/, "");
const token = process.env.AI_AUDITOR_TOKEN;
const timeoutMs = 15000;

if (!token) {
  throw new Error("AI_AUDITOR_TOKEN is required.");
}

async function getJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(baseUrl + path, {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      signal: controller.signal,
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(path + " returned non-JSON response (HTTP " + response.status + ").");
    }
    if (!response.ok) {
      throw new Error(path + " returned HTTP " + response.status + ": " + JSON.stringify(body));
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function getMonitor() {
  return getJson("/api/arbitrage/monitor");
}

async function getSchedulerAudit() {
  return getJson("/api/ai-audit/arbitrage-scheduler");
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

function schedulerDeadline(body) {
  const stateDeadline = body?.state?.nextRunAt ?? null;
  const alarmDeadline = body?.durableObject?.nextAlarmAt ?? null;
  const candidates = [stateDeadline, alarmDeadline]
    .filter(Boolean)
    .map((value) => ({ value, ms: Date.parse(value) }))
    .filter((entry) => Number.isFinite(entry.ms) && entry.ms > Date.now())
    .sort((left, right) => left.ms - right.ms);
  return candidates[0]?.value ?? null;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const first = await getMonitor();
const firstScheduler = await getSchedulerAudit();
assertBase(first, "initial GET");
const a = snapshot(first);
console.log("Initial monitor state:", JSON.stringify(a, null, 2));
console.log("Initial scheduler audit:", JSON.stringify(firstScheduler, null, 2));

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
let initialSchedulerDeadline = schedulerDeadline(firstScheduler);
const bootstrapDeadline = Date.now() + 90_000;

while (!initialSchedulerDeadline && Date.now() < bootstrapDeadline) {
  console.log("Waiting for the scheduled cron to bootstrap the Durable Object alarm...");
  await sleep(2000);
  const scheduler = await getSchedulerAudit();
  if (scheduler?.state?.lastError) {
    throw new Error("Production scheduler audit reports lastError during bootstrap: " + scheduler.state.lastError);
  }
  initialSchedulerDeadline = schedulerDeadline(scheduler);
}

if (!initialSchedulerDeadline) {
  throw new Error("Scheduler audit did not expose a future nextRunAt/nextAlarmAt after the cron bootstrap window.");
}

console.log("Authoritative scheduler deadline:", initialSchedulerDeadline);
const authoritativeDueMs = Date.parse(initialSchedulerDeadline);
const deadline = Math.max(Date.now() + 15_000, authoritativeDueMs + 75_000);
let previous = b;
let observedTransition = false;
let finalSchedulerDeadline = initialSchedulerDeadline;

while (Date.now() < deadline) {
  await sleep(2000);
  const current = await getMonitor();
  const scheduler = await getSchedulerAudit();
  assertBase(current, "scheduler poll");
  const s = snapshot(current);
  const schedulerState = scheduler?.state ?? {};
  const schedulerNext = schedulerDeadline(scheduler);
  if (schedulerNext) finalSchedulerDeadline = schedulerNext;

  if (schedulerState.lastError) {
    throw new Error("Production scheduler audit reports lastError: " + schedulerState.lastError);
  }

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
    "No new production scan was observed within configured interval + 75s (Cloudflare alarm tolerance). " +
    "intervalSeconds=" + interval + ", last scannedAt=" + String(previous.scannedAt) +
    ", nextRunAt=" + String(previous.nextRunAt),
  );
}

if (!finalSchedulerDeadline || Date.parse(finalSchedulerDeadline) <= Date.now()) {
  throw new Error("After a completed scan, nextRunAt was not scheduled in the future.");
}

console.log("Production arbitrage scheduler smoke: PASS");
console.log(JSON.stringify({
  configuredIntervalSeconds: interval,
  initialScanId: a.scanId,
  initialScannedAt: a.scannedAt,
  completedScanId: previous.scanId,
  completedScannedAt: previous.scannedAt,
  nextRunAt: finalSchedulerDeadline,
}, null, 2));
