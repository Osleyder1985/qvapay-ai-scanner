/**
 * @file backend-integration.test.ts
 * @path src/tests/backend-integration.test.ts
 * @description backend-integration.test.ts source for QvaPay AI Scanner.
 * @module tests
 * @status test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttpServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

interface MockState {
  applied: string[];
  upstreamRequests: number;
}

/**
 * Implements the listen operation for this module.
 * @param server Input used by the operation.
 * @returns The operation result.
 */
function listen(server: Server): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("No se pudo obtener el puerto del mock QvaPay."));
        return;
      }
      resolvePromise(address.port);
    });
  });
}

/**
 * Implements the close operation for this module.
 * @param server Input used by the operation.
 * @returns The operation result.
 */
async function close(server: Server): Promise<void> {
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
}

/**
 * Implements the startDashboard operation for this module.
 * @param env Input used by the operation.
 * @returns The operation result.
 */
async function startDashboard(env: NodeJS.ProcessEnv): Promise<ChildProcess> {
  const child = spawn(process.execPath, [resolve(process.cwd(), "dist/backend/server.js")], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout?.on("data", (chunk) => { output += String(chunk); });
  child.stderr?.on("data", (chunk) => { output += String(chunk); });

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("Dashboard terminó al iniciar: " + output);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${env.DASHBOARD_PORT}/api/health`);
      if (response.ok) return child;
    } catch {
      // Server is still initializing.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }

  child.kill("SIGTERM");
  throw new Error("Timeout esperando el dashboard: " + output);
}

/**
 * Implements the stopDashboard operation for this module.
 * @param child Input used by the operation.
 * @returns The operation result.
 */
async function stopDashboard(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolvePromise) => {
    const timer = setTimeout(resolvePromise, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

/**
 * Implements the request operation for this module.
 * @param port Input used by the operation.
 * @param path Input used by the operation.
 * @returns The operation result.
 */
async function request(port: number, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, init);
}

/**
 * Implements the createMockQvaPay operation for this module.
 * @param state Input used by the operation.
 * @returns The operation result.
 */
async function createMockQvaPay(state: MockState): Promise<{ server: Server; port: number }> {
  const server = createHttpServer(async (request, response) => {
    state.upstreamRequests += 1;
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/p2p" && url.searchParams.get("page") === "2" && url.searchParams.get("type") === "buy" && !url.searchParams.get("status")) {
      response.writeHead(429, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: "rate limited" }));
      return;
    }

    if (url.pathname === "/p2p" && url.searchParams.get("page") === "3" && !url.searchParams.get("status")) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 21_000));
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [] }));
      return;
    }

    if (url.pathname === "/p2p" && url.searchParams.get("status") === "completed") {
      const page = Number(url.searchParams.get("page") ?? "1");
      const offers = page === 1
        ? [{ uuid: "completed-1", status: "completed", type: "buy", coin: "BANK_CUP", amount: 10, receive: 100, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T01:00:00Z" }]
        : [{ uuid: "completed-2", status: "completed", type: "sell", coin: "BANK_CUP", amount: 4, receive: 48, created_at: "2026-09-02T00:00:00Z", updated_at: "2026-09-02T01:00:00Z" }];
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: offers, total: 2, per_page: 1 }));
      return;
    }

    if (url.pathname === "/p2p" && request.method === "GET" && url.searchParams.get("my") === "1" && !url.searchParams.get("status")) {
      const page = Number(url.searchParams.get("page") ?? "1");
      const pages = {
        1: [
          { uuid: "operation-1", status: "completed", type: "buy", coin: "BANK_CUP", amount: 10, receive: 100, User: { uuid: "self" } }
        ],
        2: [
          { uuid: "operation-2", status: "processing", type: "sell", coin: "BANK_CUP", amount: 5, receive: 60, Peer: { uuid: "self" } }
        ]
      } as Record<number, Array<Record<string, unknown>>>;
      const data = pages[page] ?? [];
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data, total: 2, per_page: 1 }));
      return;
    }

    if (url.pathname === "/p2p" && request.method === "GET") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        data: [{
          uuid: "offer-1",
          status: state.applied.includes("offer-1") ? "processing" : "open",
          type: "sell",
          coin: "BANK_CUP",
          amount: 9,
          receive: 9160,
          only_vip: false
        }],
        total: 1,
        per_page: 100
      }));
      return;
    }

    const match = url.pathname.match(/^\/p2p\/([^/]+)(?:\/(apply|paid|received|cancel|chat|rate))?$/);
    if (match) {
      const uuid = decodeURIComponent(match[1] ?? "");
      const action = match[2];

      if (action === "apply" && request.method === "POST") {
        state.applied.push(uuid);
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ uuid, status: "processing" }));
        return;
      }

      if (!action && request.method === "GET") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          uuid,
          status: state.applied.includes(uuid) ? "processing" : "open",
          type: "sell",
          coin: "BANK_CUP",
          amount: 9,
          receive: 9160
        }));
        return;
      }

      if (action === "received" && request.method === "POST") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ amount: 8.9775, fee: 0.0225, gross_amount: 9 }));
        return;
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, uuid, action }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "not found" }));
  });

  return { server, port: await listen(server) };
}

test("backend integration/E2E covers market read, controlled apply and tracking", async (t) => {
  const state: MockState = { applied: [], upstreamRequests: 0 };
  const mock = await createMockQvaPay(state);
  const dataDir = await mkdtemp(join(tmpdir(), "qvapay-ai-scanner-e2e-"));
  const dashboardPort = await (async () => {
    const probe = createHttpServer();
    const port = await listen(probe);
    await close(probe);
    return port;
  })();

  const env = {
    DASHBOARD_HOST: "127.0.0.1",
    DASHBOARD_PORT: String(dashboardPort),
    QVAPAY_API_BASE_URL: `http://127.0.0.1:${mock.port}`,
    QVAPAY_APP_ID: "integration-test-app",
    QVAPAY_APP_SECRET: "integration-test-secret",
    FINANCE_LEDGER_PATH: join(dataDir, "finance-ledger.json"),
    MARKET_HISTORY_PATH: join(dataDir, "market-history.json"),
    AUTO_APPLY_CONFIG_PATH: join(dataDir, "auto-apply.json"),
    OPERATIONS_LEDGER_PATH: join(dataDir, "operations-ledger.json"),
  };

  const child = await startDashboard(env);
  t.after(async () => {
    await stopDashboard(child);
    await close(mock.server);
    await rm(dataDir, { recursive: true, force: true });
  });

  const health = await request(dashboardPort, "/api/health");
  assert.equal(health.status, 200);

  const market = await request(dashboardPort, "/api/p2p?type=sell&coin=BANK_CUP");
  assert.equal(market.status, 200);
  const marketPayload = await market.json() as { data: Array<{ uuid: string }> };
  assert.equal(marketPayload.data[0]?.uuid, "offer-1");

  const apply = await request(dashboardPort, "/api/p2p/offer-1/apply", { method: "POST" });
  assert.equal(apply.status, 200);
  assert.deepEqual(state.applied, ["offer-1"]);

  const detail = await request(dashboardPort, "/api/p2p/offer-1");
  assert.equal(detail.status, 200);
  const detailPayload = await detail.json() as { qvapay: { status: string } };
  assert.equal(detailPayload.qvapay.status, "processing");
});

test("backend integration verifies sensitive validation, 429 propagation and finance pagination", async (t) => {
  const state: MockState = { applied: [], upstreamRequests: 0 };
  const mock = await createMockQvaPay(state);
  const dataDir = await mkdtemp(join(tmpdir(), "qvapay-ai-scanner-finance-"));
  const dashboardPort = await (async () => {
    const probe = createHttpServer();
    const port = await listen(probe);
    await close(probe);
    return port;
  })();

  const env = {
    DASHBOARD_HOST: "127.0.0.1",
    DASHBOARD_PORT: String(dashboardPort),
    QVAPAY_API_BASE_URL: `http://127.0.0.1:${mock.port}`,
    QVAPAY_APP_ID: "integration-test-app",
    QVAPAY_APP_SECRET: "integration-test-secret",
    FINANCE_LEDGER_PATH: join(dataDir, "finance-ledger.json"),
    MARKET_HISTORY_PATH: join(dataDir, "market-history.json"),
    AUTO_APPLY_CONFIG_PATH: join(dataDir, "auto-apply.json"),
  };

  let child = await startDashboard(env);
  t.after(async () => {
    await stopDashboard(child);
    await close(mock.server);
    await rm(dataDir, { recursive: true, force: true });
  });

  const invalidPaid = await request(dashboardPort, "/api/operations/offer-1/paid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(invalidPaid.status, 400);

  const limited = await request(dashboardPort, "/api/p2p?page=2&type=buy");
  assert.equal(limited.status, 429);

  const finance = await request(dashboardPort, "/api/finance");
  assert.equal(finance.status, 200);
  const financePayload = await finance.json() as {
    source: { remoteTotal: number; fetched: number; pagesFetched: number };
    reconciliation: { missingInLedger: string[] };
  };
  assert.equal(financePayload.source.remoteTotal, 2);
  assert.equal(financePayload.source.fetched, 2);
  assert.equal(financePayload.source.pagesFetched, 2);
  assert.deepEqual(financePayload.reconciliation.missingInLedger, []);

  await stopDashboard(child);
  child = await startDashboard(env);

  const recovered = await request(dashboardPort, "/api/finance");
  assert.equal(recovered.status, 200);
  const recoveredPayload = await recovered.json() as {
    source: { persisted: number };
  };
  assert.equal(recoveredPayload.source.persisted, 2);
});

test("backend integration enforces upstream timeout without real QvaPay credentials", { timeout: 25_000 }, async (t) => {
  const state: MockState = { applied: [], upstreamRequests: 0 };
  const mock = await createMockQvaPay(state);
  const dataDir = await mkdtemp(join(tmpdir(), "qvapay-ai-scanner-timeout-"));
  const probe = createHttpServer();
  const dashboardPort = await listen(probe);
  await close(probe);

  const env = {
    DASHBOARD_HOST: "127.0.0.1",
    DASHBOARD_PORT: String(dashboardPort),
    QVAPAY_API_BASE_URL: `http://127.0.0.1:${mock.port}`,
    QVAPAY_APP_ID: "integration-test-app",
    QVAPAY_APP_SECRET: "integration-test-secret",
    FINANCE_LEDGER_PATH: join(dataDir, "finance-ledger.json"),
    MARKET_HISTORY_PATH: join(dataDir, "market-history.json"),
    AUTO_APPLY_CONFIG_PATH: join(dataDir, "auto-apply.json"),
  };

  const child = await startDashboard(env);
  t.after(async () => {
    await stopDashboard(child);
    await close(mock.server);
    await rm(dataDir, { recursive: true, force: true });
  });

  const started = Date.now();
  const response = await request(dashboardPort, "/api/p2p?page=3");
  const elapsed = Date.now() - started;

  assert.equal(response.status, 502);
  assert.ok(elapsed >= 19_000, `timeout demasiado corto: ${elapsed}ms`);
  assert.ok(elapsed < 22_000, `timeout demasiado largo: ${elapsed}ms`);
  const payload = await response.json() as { error: string };
  assert.equal(payload.error, "No se pudo contactar con QvaPay");
});

test("backend integration reconstructs paginated operations and persists the complete snapshot", async (t) => {
  const state: MockState = { applied: [], upstreamRequests: 0 };
  const mock = await createMockQvaPay(state);
  const dataDir = await mkdtemp(join(tmpdir(), "qvapay-ai-scanner-operations-"));
  const probe = createHttpServer();
  const dashboardPort = await listen(probe);
  await close(probe);

  const env = {
    DASHBOARD_HOST: "127.0.0.1",
    DASHBOARD_PORT: String(dashboardPort),
    QVAPAY_API_BASE_URL: `http://127.0.0.1:${mock.port}`,
    QVAPAY_APP_ID: "integration-test-app",
    QVAPAY_APP_SECRET: "integration-test-secret",
    FINANCE_LEDGER_PATH: join(dataDir, "finance-ledger.json"),
    MARKET_HISTORY_PATH: join(dataDir, "market-history.json"),
    AUTO_APPLY_CONFIG_PATH: join(dataDir, "auto-apply.json"),
    OPERATIONS_LEDGER_PATH: join(dataDir, "operations-ledger.json"),
  };

  let child = await startDashboard(env);
  t.after(async () => {
    await stopDashboard(child);
    await close(mock.server);
    await rm(dataDir, { recursive: true, force: true });
  });

  const first = await request(dashboardPort, "/api/operations");
  assert.equal(first.status, 200);
  const firstPayload = await first.json() as {
    operations: { data: Array<{ uuid: string }>; total: number; pages_fetched: number; truncated: boolean };
    persistence: { persisted: number; reconciled: boolean };
    reconciliation: { missingInLedger: string[] };
  };

  assert.equal(firstPayload.operations.total, 2);
  assert.equal(firstPayload.operations.data.length, 2);
  assert.equal(firstPayload.operations.pages_fetched, 2);
  assert.equal(firstPayload.operations.truncated, false);
  assert.equal(firstPayload.persistence.persisted, 2);
  assert.equal(firstPayload.persistence.reconciled, true);
  assert.deepEqual(firstPayload.reconciliation.missingInLedger, []);

  await stopDashboard(child);
  child = await startDashboard(env);

  const recovered = await request(dashboardPort, "/api/operations");
  assert.equal(recovered.status, 200);
  const recoveredPayload = await recovered.json() as {
    persistence: { persisted: number };
  };
  assert.equal(recoveredPayload.persistence.persisted, 2);
});
