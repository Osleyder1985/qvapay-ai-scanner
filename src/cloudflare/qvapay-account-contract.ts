/**
 * @file qvapay-account-contract.ts
 * @path src/cloudflare/qvapay-account-contract.ts
 * @description Evalúa conjuntamente los contratos de identidad y balance de QvaPay.
 * @module cloudflare
 * @status active
 */

import { parseQvaPayApplicationIdentity } from "./qvapay-identity.js";
import { parseQvaPayBalance } from "./qvapay-balance.js";

export type QvaPayAccountIntegrationStatus = "verified" | "degraded" | "failed";

export interface QvaPayAccountUpstream {
  identityStatus: number;
  identityPayload: unknown;
  balanceStatus: number;
  balancePayload: unknown;
}

export interface QvaPayAccountContract {
  ok: boolean;
  integrationStatus: QvaPayAccountIntegrationStatus;
  user: ReturnType<typeof parseQvaPayApplicationIdentity>;
  balanceUsd: number | null;
  identityValid: boolean;
  balanceValid: boolean;
  identityError: string | null;
  balanceError: string | null;
}

/**
 * Combina las respuestas independientes de identidad y balance.
 *
 * - verified: identidad y balance son contratos válidos.
 * - degraded: exactamente una dependencia crítica es válida.
 * - failed: ninguna dependencia crítica es válida.
 *
 * Un HTTP 2xx no basta: el payload debe cumplir su contrato.
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
      : {
          ok: false,
          balance: null,
          reason: "QvaPay devolvió un estado HTTP no exitoso.",
        };

  const identityValid = identity !== null;
  const balanceValid = balance.ok;
  const validDependencies = Number(identityValid) + Number(balanceValid);
  const integrationStatus: QvaPayAccountIntegrationStatus =
    validDependencies === 2
      ? "verified"
      : validDependencies === 1
        ? "degraded"
        : "failed";

  return {
    ok: integrationStatus === "verified",
    integrationStatus,
    user: identity,
    balanceUsd: balance.balance?.balanceUsd ?? null,
    identityValid,
    balanceValid,
    identityError: identity
      ? null
      : "QvaPay no devolvió una identidad válida para la aplicación autenticada.",
    balanceError: balanceValid
      ? null
      : (balance.reason ?? "QvaPay no devolvió un balance válido."),
  };
}
