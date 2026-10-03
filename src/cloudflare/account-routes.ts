/**
 * @file account-routes.ts
 * @path src/cloudflare/account-routes.ts
 * @description Rutas HTTP de identidad y cuenta QvaPay.
 * @module cloudflare
 * @status active
 */

import { evaluateQvaPayAccountContract } from "./qvapay-account-contract.js";
import { parseQvaPayApplicationIdentity } from "./qvapay-identity.js";
import { parseQvaPayP2PCollection } from "./qvapay-contracts.js";

function parseP2POwnerIdentity(payload: unknown): {
  uuid: string;
  username: string;
  name: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  telegram_verified: boolean | null;
  phone_verified: boolean | null;
  kyc: boolean | null;
  vip: boolean | null;
  golden_check: boolean | null;
} | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const uuid = typeof record.uuid === "string" ? record.uuid.trim() : "";
  const username =
    typeof record.username === "string" ? record.username.trim() : "";
  if (!uuid || !username) return null;
  const numberOrNull = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  return {
    uuid,
    username,
    name: typeof record.name === "string" ? record.name.trim() || null : null,
    rating_avg: numberOrNull(record.rating_avg),
    rating_count: numberOrNull(record.rating_count),
    telegram_verified:
      typeof record.telegram_verified === "boolean"
        ? record.telegram_verified
        : null,
    phone_verified:
      typeof record.phone_verified === "boolean" ? record.phone_verified : null,
    kyc: typeof record.kyc === "boolean" ? record.kyc : null,
    vip: typeof record.vip === "boolean" ? record.vip : null,
    golden_check:
      typeof record.golden_check === "boolean" ? record.golden_check : null,
  };
}
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
      const [balance, info, ownOffers] = await Promise.all([
        qvapay(env, "/v2/balance", { method: "POST" }),
        qvapay(env, "/v2/info", { method: "POST" }),
        qvapay(env, "/p2p?my=1&take=1&page=1", { method: "GET" }),
      ]);
      const balancePayload = await readQvaPayPayload(balance);
      const infoPayload = await readQvaPayPayload(info);
      const ownOffersPayload = await readQvaPayPayload(ownOffers);
      const ownCollection = ownOffers.ok
        ? parseQvaPayP2PCollection(ownOffersPayload, 0, 1)
        : null;
      // La identidad de usuario se toma del contexto P2P propio; /v2/info identifica la aplicación.
      const firstOwnOffer = ownCollection?.data?.[0] ?? null;
      // /p2p?my=1 includes offers where the authenticated account is either
      // the owner (User) or the peer (Peer). If a peer exists, that Peer is
      // the authenticated account; otherwise User is the owner account.
      const ownerUser = parseP2POwnerIdentity(
        firstOwnOffer?.Peer ?? firstOwnOffer?.User ?? null,
      );
      const contract = evaluateQvaPayAccountContract({
        identityStatus: info.status,
        identityPayload: infoPayload,
        balanceStatus: balance.status,
        balancePayload,
      });

      return json({
        account: {
          balanceUsd: contract.balanceUsd,
          user: ownerUser,
          identitySource: ownerUser ? "qvapay_p2p_owner" : "unavailable",
          identityHttpStatus: info.status,
          identityOk: ownerUser !== null,
          identityError: contract.identityError
            ? { httpStatus: info.status, message: contract.identityError }
            : null,
          p2pUser: ownerUser,
          application: {
            uuid: parseQvaPayApplicationIdentity(infoPayload)?.uuid ?? null,
            name: parseQvaPayApplicationIdentity(infoPayload)?.name ?? null,
            active: parseQvaPayApplicationIdentity(infoPayload)?.active ?? null,
            enabled:
              parseQvaPayApplicationIdentity(infoPayload)?.enabled ?? null,
          },
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
