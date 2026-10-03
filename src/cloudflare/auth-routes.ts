/**
 * @file auth-routes.ts
 * @path src/cloudflare/auth-routes.ts
 * @description Rutas HTTP de autenticación y sesión del Worker.
 * @module cloudflare
 * @status active
 */

import {
  credentialsMatch,
  createSession,
  destroySession,
  isSameOrigin,
  requireSession,
  type SessionDatabase,
} from "./access.js";
import {
  clearLoginRateLimit,
  pruneLoginRateLimits,
  recordFailedLogin,
} from "./auth-rate-limit.js";

export interface AuthRouteEnv {
  DB: SessionDatabase;
  AUTH_USERNAME?: string;
  AUTH_PASSWORD?: string;
}

type JsonRecord = Record<string, unknown>;

type JsonResponse = (
  payload: unknown,
  status?: number,
  headers?: Record<string, string>,
) => Response;

type ReadJson = (request: Request) => Promise<unknown>;

/**
 * Atiende exclusivamente las rutas /api/auth/*.
 */
export async function handleAuthRoutes(
  request: Request,
  env: AuthRouteEnv,
  url: URL,
  json: JsonResponse,
  readJson: ReadJson,
): Promise<Response | null> {
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    if (!isSameOrigin(request)) {
      return json(
        { error: "El inicio de sesión sólo acepta solicitudes same-origin." },
        403,
      );
    }

    try {
      const body = await readJson(request);
      const username =
        body && typeof body === "object"
          ? String((body as JsonRecord).username ?? "").trim()
          : "";
      const password =
        body && typeof body === "object"
          ? String((body as JsonRecord).password ?? "")
          : "";

      if (!env.AUTH_USERNAME || !env.AUTH_PASSWORD) {
        console.error("Authentication secrets are not configured.");
        return json(
          { error: "El servicio de autenticación no está configurado." },
          503,
        );
      }

      if (
        !username ||
        !password ||
        username.length > 200 ||
        password.length > 500 ||
        !credentialsMatch(env, username, password)
      ) {
        try {
          await pruneLoginRateLimits(env.DB);
          const decision = await recordFailedLogin(
            env.DB,
            request,
            username,
            env.AUTH_PASSWORD,
          );
          if (!decision.allowed) {
            return json(
              { error: "Demasiados intentos fallidos. Inténtelo más tarde." },
              429,
              { "Retry-After": String(decision.retryAfterSeconds) },
            );
          }
        } catch (error) {
          console.error("Authentication rate limiter failed:", error);
          return json(
            { error: "El servicio de autenticación no está disponible." },
            503,
          );
        }
        return json({ error: "Credenciales inválidas." }, 401);
      }

      try {
        await clearLoginRateLimit(
          env.DB,
          request,
          username,
          env.AUTH_PASSWORD,
        );
      } catch (error) {
        console.error("Authentication rate limiter cleanup failed:", error);
        return json(
          { error: "El servicio de autenticación no está disponible." },
          503,
        );
      }

      return await createSession(request, env.DB, username);
    } catch (error) {
      console.error("Authentication session creation failed:", error);
      return json(
        { error: "El servicio de autenticación no pudo crear la sesión." },
        503,
      );
    }
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    if (!isSameOrigin(request)) {
      return json(
        { error: "El cierre de sesión sólo acepta solicitudes same-origin." },
        403,
      );
    }

    try {
      return await destroySession(request, env.DB);
    } catch {
      return json({ error: "No se pudo cerrar la sesión." }, 500);
    }
  }

  if (request.method === "GET" && url.pathname === "/api/auth/session") {
    const session = await requireSession(request, env.DB);
    if (!session.ok) return session.response;

    return json({
      authenticated: true,
      username: session.session.username,
      expiresAt: session.session.expiresAt,
    });
  }

  return null;
}
