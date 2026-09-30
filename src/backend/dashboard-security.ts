/**
 * @file dashboard-security.ts
 * @path src/backend/dashboard-security.ts
 * @description Implements dashboard security for QvaPay AI Scanner.
 * @module backend
 * @status active
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

/**
 * Implements the isLoopbackHost operation for this module.

 * @returns The operation result.
 */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

/**
 * Prevents the dashboard from being exposed to a network before application
 * authentication/authorization exists.
 */
/**
 * Implements the assertDashboardHostIsSafe operation for this module.

 * @returns The operation result.
 */
export function assertDashboardHostIsSafe(host: string): void {
  if (!isLoopbackHost(host)) {
    throw new Error(
      "DASHBOARD_HOST debe ser local-only (127.0.0.1, ::1 o localhost). " +
      "La exposición LAN/Internet requiere autenticación/autorización explícita."
    );
  }
}
