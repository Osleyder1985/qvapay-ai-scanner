/**
 * @file qvapay-identity.ts
 * @path src/cloudflare/qvapay-identity.ts
 * @description Valida la identidad autoritativa de la aplicación QvaPay.
 * @module cloudflare
 * @status active
 */

export interface QvaPayApplicationIdentity {
  uuid: string;
  name: string;
  active: boolean | null;
  enabled: boolean | null;
}

export function parseQvaPayApplicationIdentity(
  payload: unknown,
): QvaPayApplicationIdentity | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const uuid = typeof record.uuid === "string" ? record.uuid.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";

  if (!uuid || !name) return null;

  return {
    uuid,
    name,
    active: typeof record.active === "boolean" ? record.active : null,
    enabled: typeof record.enabled === "boolean" ? record.enabled : null,
  };
}
