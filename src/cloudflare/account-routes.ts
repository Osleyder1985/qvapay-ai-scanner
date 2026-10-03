/**
 * @file account-routes.ts
 * @path src/cloudflare/account-routes.ts
 * @description Rutas HTTP de identidad y cuenta QvaPay.
 * @module cloudflare
 * @status active
 */

import { evaluateQvaPayAccountContract } from "./qvapay-account-contract.js";
import { parseQvaPayApplicationIdentity } from "./qvapay-identity.js";
import {
  qvapay,
  readQvaPayPayload,
  type QvaPayHttpEnv,
} from "./qvapay-http.js";

type JsonResponse = (payload: unknown, status?: number) => Response;

function errorStatus(error: unknown): number {
  return error instanceof Error && error.message.includes("QVAPAY_")
    ? 500
    : 502;
}

/**
 * Atiende las rutas de cuenta e identidad de la aplicación autenticada.
 */
export async function handleAccountRoutes(
  request: Request,
  env: QvaPayHttpEnv,
  url: URL,
  json: JsonResponse,
): Promise<Response | null> {
  if (url.pathname === "/api/account" && request.method === "GET") {
    try {
      const [balance, info] = await Promise.all([
        qvapay(env, "/v2/balance", { method: "POST" }),
        qvapay(env, "/v2/info", { method: "POST" }),
      ]);
      const balancePayload = await readQvaPayPayload(balance);
      const infoPayload = await readQvaPayPayload(info);
      const contract = evaluateQvaPayAccountContract({
        identityStatus: info.status,
        identityPayload: infoPayload,
        balanceStatus: balance.status,
        balancePayload,
      });

      return json({
        account: {
          balanceUsd: contract.balanceUsd,
          user: contract.user,
          identitySource: contract.user ? "qvapay_v2_info" : "unavailable",
          identityHttpStatus: info.status,
          identityOk: info.ok,
          identityError: contract.identityError
            ? { httpStatus: info.status, message: contract.identityError }
            : null,
          balanceSource:
            contract.balanceUsd !== null
              ? "qvapay_v2_balance"
              : "qvapay_v2_balance_error",
          balanceHttpStatus: balance.status,
          balanceOk: contract.balanceUsd !== null,
          balanceError: contract.balanceError
            ? { httpStatus: balance.status, message: contract.balanceError }
            : null,
          integrationOk: contract.ok,
          integrationStatus: contract.integrationStatus,
          fetchedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      return json(
        { error: "No se pudo completar la solicitud." },
        errorStatus(error),
      );
    }
  }

  if (url.pathname === "/api/qvapay/info" && request.method === "GET") {
    try {
      const upstream = await qvapay(env, "/v2/info", { method: "POST" });
      const payload = await readQvaPayPayload(upstream);
      const identity = parseQvaPayApplicationIdentity(payload);

      return json(
        upstream.ok
          ? {
              info: {
                uuid: identity?.uuid ?? null,
                name: identity?.name ?? null,
                active: identity?.active ?? null,
                enabled: identity?.enabled ?? null,
              },
              httpStatus: upstream.status,
              ok: upstream.ok && identity !== null,
            }
          : {
              error: "QvaPay API error.",
              httpStatus: upstream.status,
              ok: false,
            },
        upstream.status,
      );
    } catch (error) {
      return json(
        { error: "No se pudo completar la solicitud." },
        errorStatus(error),
      );
    }
  }

  return null;
}
