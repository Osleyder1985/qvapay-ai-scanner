/**
 * @file dashboard-security.ts
 * @path src/backend/dashboard-security.ts
 * @description Implementa la seguridad del dashboard de QvaPay AI Scanner.
 * @module backend
 * @status active
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

/**
 * Implementa la operación isLoopbackHost de este módulo.

 * @returns Resultado de la operación.
 */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

/**
 * Evita que el dashboard quede expuesto a una red antes de que la
 * autenticación/autorización de la aplicación exista.
 */
/**
 * Implementa la operación assertDashboardHostIsSafe de este módulo.

 * @returns Resultado de la operación.
 */
export function assertDashboardHostIsSafe(host: string): void {
  if (!isLoopbackHost(host)) {
    throw new Error(
      "DASHBOARD_HOST debe ser local-only (127.0.0.1, ::1 o localhost). " +
        "La exposición LAN/Internet requiere autenticación/autorización explícita.",
    );
  }
}
