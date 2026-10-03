/**
 * @file error-contract.ts
 * @path src/cloudflare/error-contract.ts
 * @description Catálogo único de errores públicos y frontera de diagnóstico interno.
 * @module cloudflare
 * @status active
 */

export type PublicErrorCode =
  | "INTERNAL_ERROR"
  | "UPSTREAM_ERROR"
  | "UPSTREAM_CONTRACT_ERROR"
  | "D1_UNAVAILABLE"
  | "AUTH_SERVICE_UNAVAILABLE"
  | "AUTH_SESSION_CREATE_FAILED"
  | "MONITOR_STATE_READ_FAILED"
  | "MONITOR_CONFIG_ROW_MISSING"
  | "MONITOR_CONFIG_WRITE_FAILED";

const PUBLIC_MESSAGES: Record<PublicErrorCode, string> = {
  INTERNAL_ERROR: "No se pudo completar la solicitud.",
  UPSTREAM_ERROR: "No se pudo completar la solicitud con el servicio externo.",
  UPSTREAM_CONTRACT_ERROR: "La respuesta del servicio externo no es válida.",
  D1_UNAVAILABLE: "La base de datos no está disponible.",
  AUTH_SERVICE_UNAVAILABLE: "El servicio de autenticación no está disponible.",
  AUTH_SESSION_CREATE_FAILED: "El servicio de autenticación no pudo crear la sesión.",
  MONITOR_STATE_READ_FAILED: "No se pudo consultar el estado del monitor.",
  MONITOR_CONFIG_ROW_MISSING: "La configuración del monitor no está disponible.",
  MONITOR_CONFIG_WRITE_FAILED: "No se pudo actualizar la configuración del monitor.",
};

export function publicError(
  code: PublicErrorCode,
  extra: Record<string, unknown> = {},
): { error: string; code: PublicErrorCode } & Record<string, unknown> {
  return { error: PUBLIC_MESSAGES[code], code, ...extra };
}

/**
 * Registra únicamente el código de diagnóstico. Nunca serializa el objeto Error,
 * su mensaje, stack, request, payload ni credenciales.
 */
export function logInternalError(
  event: string,
  code: PublicErrorCode,
): void {
  console.error(JSON.stringify({ event, code }));
}
