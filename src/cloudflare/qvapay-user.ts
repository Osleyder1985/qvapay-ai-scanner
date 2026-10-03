/**
 * @file qvapay-user.ts
 * @path src/cloudflare/qvapay-user.ts
 * @description Valida la identidad del usuario propietario observada en una respuesta P2P.
 * @module cloudflare
 * @status active
 */

export interface QvaPayUserIdentity {
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
}

export function parseQvaPayUserIdentity(
  payload: unknown,
): QvaPayUserIdentity | null {
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
      typeof record.phone_verified === "boolean"
        ? record.phone_verified
        : null,
    kyc: typeof record.kyc === "boolean" ? record.kyc : null,
    vip: typeof record.vip === "boolean" ? record.vip : null,
    golden_check:
      typeof record.golden_check === "boolean" ? record.golden_check : null,
  };
}
