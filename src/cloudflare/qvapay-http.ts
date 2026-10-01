/**
 * @file qvapay-http.ts
 * @path src/cloudflare/qvapay-http.ts
 * @description Adaptador HTTP único para las llamadas autenticadas a QvaPay.
 * @module cloudflare
 * @status active
 */

export interface QvaPayHttpEnv {
  QVAPAY_API_BASE_URL?: string;
  QVAPAY_APP_ID?: string;
  QVAPAY_APP_SECRET?: string;
}

const DEFAULT_API_BASE = "https://api.qvapay.com";

/**
 * Devuelve la URL base configurada para QvaPay.
 */
export function apiBase(env: QvaPayHttpEnv): string {
  return (env.QVAPAY_API_BASE_URL ?? DEFAULT_API_BASE).replace(/\/$/, "");
}

/**
 * Construye exclusivamente las cabeceras necesarias para autenticarse
 * contra la API de QvaPay. El secreto nunca forma parte de una respuesta.
 */
export function qvapayHeaders(env: QvaPayHttpEnv): Record<string, string> {
  if (!env.QVAPAY_APP_ID || !env.QVAPAY_APP_SECRET) {
    throw new Error("QVAPAY_CONFIG_MISSING");
  }

  return {
    Accept: "application/json",
    "app-id": env.QVAPAY_APP_ID,
    "app-secret": env.QVAPAY_APP_SECRET,
    "User-Agent": "qvapay-ai-scanner-cloudflare-worker/1.0",
  };
}

/**
 * Lee JSON de una respuesta QvaPay sin propagar errores de parseo.
 */
export async function readQvaPayPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/**
 * Ejecuta una llamada autenticada a QvaPay con timeout acotado.
 */
export async function qvapay(
  env: QvaPayHttpEnv,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(qvapayHeaders(env));
  if (init.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }

  if (init.method?.toUpperCase() === "POST" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(new URL(path, apiBase(env)), {
    ...init,
    headers,
    signal: AbortSignal.timeout(20_000),
  });
}
