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
  const normalize = (raw: unknown): QvaPayBalanceParseResult => {
    const value =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim() !== ""
          ? Number(raw.trim())
          : NaN;

    if (!Number.isFinite(value)) {
      return {
        ok: false,
        balance: null,
        reason: "El balance recibido no es un número finito.",
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
      balance: { balanceUsd: value },
      reason: null,
    };
  };

  if (typeof payload === "number" || typeof payload === "string") {
    return normalize(payload);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      balance: null,
      reason: "La respuesta de balance no contiene un objeto JSON ni un valor numérico válido.",
    };
  }

  const record = payload as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(record, "balance")) {
    return normalize(record.balance);
  }

  if (Object.prototype.hasOwnProperty.call(record, "data")) {
    const data = record.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const nested = data as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(nested, "balance")) {
        return normalize(nested.balance);
      }
    }
    return normalize(data);
  }

  return {
    ok: false,
    balance: null,
    reason: "La respuesta de balance no contiene un campo balance reconocible.",
  };
}
