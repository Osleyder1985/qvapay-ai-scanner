/**
 * @file qvapay-balance.ts
 * @path src/cloudflare/qvapay-balance.ts
 * @description Valida el contrato financiero documentado para el balance de QvaPay.
 * @module cloudflare
 * @status active
 */

export interface QvaPayBalance {
  balanceUsd: number;
}

export interface QvaPayBalanceParseResult {
  ok: boolean;
  balance: QvaPayBalance | null;
  reason: string | null;
}

/**
 * Valida exclusivamente las formas documentadas de POST /v2/balance:
 * { "balance": number } o { "message": string, "data": number }.
 *
 * El campo representa el balance actual en USD. No se aceptan strings,
 * booleanos, valores no finitos, valores negativos ni envelopes anidados.
 */
export function parseQvaPayBalance(payload: unknown): QvaPayBalanceParseResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      balance: null,
      reason: "La respuesta de balance no es un objeto JSON.",
    };
  }

  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record);

  let value: unknown;

  if (
    keys.length === 1 &&
    Object.prototype.hasOwnProperty.call(record, "balance")
  ) {
    value = record.balance;
  } else if (
    keys.length === 2 &&
    typeof record.message === "string" &&
    Object.prototype.hasOwnProperty.call(record, "data")
  ) {
    value = record.data;
  } else {
    return {
      ok: false,
      balance: null,
      reason:
        "La respuesta de balance no coincide con los contratos documentados.",
    };
  }

  if (typeof value !== "number") {
    return {
      ok: false,
      balance: null,
      reason: "El campo balance debe ser un número JSON.",
    };
  }

  if (!Number.isFinite(value)) {
    return {
      ok: false,
      balance: null,
      reason: "El campo balance debe ser un número finito.",
    };
  }

  if (value < 0) {
    return {
      ok: false,
      balance: null,
      reason: "El balance USD no puede ser negativo.",
    };
  }

  return {
    ok: true,
    balance: {
      balanceUsd: value,
    },
    reason: null,
  };
}
