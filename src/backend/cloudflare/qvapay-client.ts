/**
 * @file qvapay-client.ts
 * @path src/backend/cloudflare/qvapay-client.ts
 * @description Fetch-only QvaPay HTTP client shared by Cloudflare Worker and tests.
 * @module backend/cloudflare
 * @status migration
 */

export interface QvaPayClientConfig {
  baseUrl?: string;
  appId: string;
  appSecret: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface QvaPayHttpResult<T = unknown> {
  status: number;
  ok: boolean;
  payload: T | null;
  headers: Headers;
}

export interface QvaPayClient {
  getP2P(query?: URLSearchParams): Promise<QvaPayHttpResult>;
  getOwnP2P(status?: string): Promise<QvaPayHttpResult>;
  applyP2POffer(uuid: string): Promise<QvaPayHttpResult>;
}

const DEFAULT_BASE_URL = "https://api.qvapay.com";
const DEFAULT_TIMEOUT_MS = 20_000;

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  return url.toString().replace(/\/$/, "");
}

function parsePayload(text: string): unknown | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createQvaPayClient(config: QvaPayClientConfig): QvaPayClient {
  if (!config.appId.trim() || !config.appSecret.trim()) {
    throw new Error("QvaPay app credentials are required.");
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = config.fetchImpl ?? fetch;

  const request = async (
    path: string,
    init: RequestInit = {},
  ): Promise<QvaPayHttpResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      headers.set("app-id", config.appId);
      headers.set("app-secret", config.appSecret);
      headers.set("User-Agent", "qvapay-ai-scanner-cloudflare/1.0");

      const response = await fetchImpl(new URL(path, baseUrl), {
        ...init,
        headers,
        signal: init.signal ?? controller.signal,
      });

      const text = await response.text();

      return {
        status: response.status,
        ok: response.ok,
        payload: parsePayload(text),
        headers: response.headers,
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    getP2P: (query) => {
      const suffix = query?.toString();
      return request("/p2p" + (suffix ? "?" + suffix : ""));
    },

    getOwnP2P: (status) => {
      const query = new URLSearchParams({
        my: "1",
        take: "100",
        orderBy: "updated_at",
        orderType: "desc",
      });
      if (status) query.set("status", status);
      return request("/p2p?" + query.toString());
    },

    applyP2POffer: (uuid) => {
      const normalized = uuid.trim();
      if (!normalized || normalized.length > 200) {
        return Promise.reject(new Error("Invalid QvaPay offer UUID."));
      }
      return request("/p2p/" + encodeURIComponent(normalized) + "/apply", {
        method: "POST",
      });
    },
  };
}
