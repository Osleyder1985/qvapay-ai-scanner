/**
 * @file qvapay-contracts.ts
 * @path src/cloudflare/qvapay-contracts.ts
 * @description Contratos mínimos y validadores para respuestas externas de QvaPay.
 * @module cloudflare
 * @status active
 */

export type QvaPayRecord = Record<string, unknown>;

export interface QvaPayCollection {
  data: QvaPayRecord[];
  total: number;
  perPage: number;
}

export interface QvaPayActionResponse {
  payload: QvaPayRecord;
}

/**
 * Valida la envoltura paginada utilizada por las respuestas P2P.
 * Los campos numéricos deben llegar como números; no se realizan coerciones.
 */
export function parseQvaPayCollection(
  payload: unknown,
  fallbackTotal = 0,
  fallbackPerPage = 100,
): QvaPayCollection | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return null;

  const data = payload.data.filter(isRecord);
  if (data.length !== payload.data.length) return null;

  const total =
    payload.total === undefined ? fallbackTotal : finiteNumber(payload.total);
  const perPage =
    payload.per_page === undefined
      ? fallbackPerPage
      : finitePositiveNumber(payload.per_page);

  if (total === null || perPage === null) return null;
  return { data, total, perPage };
}

/**
 * Valida una respuesta de acción sin interpretar campos de negocio
 * que pueden variar entre versiones del API.
 */
export function parseQvaPayActionResponse(
  payload: unknown,
): QvaPayActionResponse | null {
  return isRecord(payload) ? { payload } : null;
}

export function isRecord(value: unknown): value is QvaPayRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function finiteNonNegativeNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

export function finitePositiveNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}
