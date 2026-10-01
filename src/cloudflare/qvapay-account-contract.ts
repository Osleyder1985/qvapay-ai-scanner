/**
 * @file qvapay-account-contract.ts
 * @path src/cloudflare/qvapay-account-contract.ts
 * @description Evalúa conjuntamente los contratos de identidad y balance de QvaPay.
 * @module cloudflare
 * @status active
 */

import { parseQvaPayApplicationIdentity } from "./qvapay-identity.js";
import { parseQvaPayBalance } from "./qvapay-balance.js";

export interface QvaPayAccountUpstream {
  identityStatus: number;
  identityPayload: unknown;
  balanceStatus: number;
  balancePayload: unknown;
}

export interface QvaPayAccountContract {
  ok: boolean;
  user: ReturnType<typeof parseQvaPayApplicationIdentity>;
  balanceUsd: number | null;
  identityError: string | null;
  balanceError: string | null;
}

/**
 * Combina las respuestas independientes de identidad y balance.
 * Un HTTP 2xx no basta: ambos contratos deben ser válidos para declarar
 * la integración de cuenta como correcta.
 */
export function evaluateQvaPayAccountContract(
  upstream: QvaPayAccountUpstream,
): QvaPayAccountContract {
  const identity =
    upstream.identityStatus >= 200 && upstream.identityStatus < 300
      ? parseQvaPayApplicationIdentity(upstream.identityPayload)
      : null;
  const balance =
    upstream.balanceStatus >= 200 && upstream.balanceStatus < 300
      ? parseQvaPayBalance(upstream.balancePayload)
      : { ok: false, balance: null, reason: "QvaPay devolvió un estado HTTP no exitoso." };

  return {
    ok: Boolean(identity && balance.ok),
    user: identity,
    balanceUsd: balance.balance?.balanceUsd ?? null,
    identityError: identity
      ? null
      : "QvaPay no devolvió una identidad válida para la aplicación autenticada.",
    balanceError: balance.ok
      ? null
      : balance.reason ?? "QvaPay no devolvió un balance válido.",
  };
}
