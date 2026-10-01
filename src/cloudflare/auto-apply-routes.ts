/**
 * @file auto-apply-routes.ts
 * @path src/cloudflare/auto-apply-routes.ts
 * @description Frontera HTTP explícitamente desactivada para Auto-Apply.
 * @module cloudflare
 * @status disabled
 */
type JsonResponse = (payload: unknown, status?: number) => Response;

export function handleAutoApplyRoutes(
  request: Request,
  url: URL,
  json: JsonResponse,
): Response | null {
  if (request.method === "GET" && url.pathname === "/api/auto-apply/config") {
    return json({
      config: {
        enabled: false,
        type: "sell",
        coin: "",
        rateMin: null,
        rateMax: null,
        amountMin: null,
        amountMax: null,
        dailyMaxQusd: null,
        maxConcurrent: 1,
      },
    });
  }

  if (request.method === "GET" && url.pathname === "/api/auto-apply/status") {
    return json({
      status: {
        running: false,
        lastScanAt: null,
        lastActionAt: null,
        lastMessage:
          "Auto-Apply permanece desactivado en Cloudflare hasta añadir almacenamiento persistente y un scheduler.",
        dailyDate: new Date().toISOString().slice(0, 10),
        dailyAppliedQusd: 0,
        recentApplyAttempts: [],
        appliedOfferIds: [],
      },
    });
  }

  if (
    (request.method === "PUT" || request.method === "PATCH") &&
    url.pathname === "/api/auto-apply/config"
  ) {
    return json(
      {
        error:
          "Auto-Apply no puede persistir configuración ni ejecutar scans periódicos en esta fase de migración Cloudflare.",
      },
      501,
    );
  }

  return null;
}
