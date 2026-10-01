/**
 * @file access.ts
 * @path src/cloudflare/access.ts
 * @description Cloudflare Access authentication and same-origin protections.
 * @module cloudflare
 * @status active
 */

export interface AccessIdentity {
  email?: string;
  name?: string;
  sub?: string;
  groups?: unknown[];
  [key: string]: unknown;
}

export interface AccessRuntime {
  getIdentity(): Promise<AccessIdentity | null | undefined>;
}

export interface WorkerAccessContext {
  access?: AccessRuntime;
}

export type AccessCheck =
  | { ok: true; identity: AccessIdentity }
  | { ok: false; response: Response };

export async function requireAccess(
  ctx: WorkerAccessContext,
): Promise<AccessCheck> {
  if (!ctx.access) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: "Access authentication is required for this resource.",
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      ),
    };
  }

  const identity = await ctx.access.getIdentity();
  if (!identity) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: "Authenticated Access identity is unavailable.",
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      ),
    };
  }

  return { ok: true, identity };
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function requiresSameOrigin(request: Request): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
}
