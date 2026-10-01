# Cloudflare authentication architecture

## Estado vigente

La frontera de autenticación del dashboard de QvaPay AI Scanner es **Worker-native**.

El flujo productivo es:

`Internet → Cloudflare Worker → sesión HttpOnly → D1 / QvaPay API`

La autenticación utiliza:

- `AUTH_USERNAME` y `AUTH_PASSWORD` como Worker Secrets.
- Token de sesión aleatorio generado con Web Crypto.
- Cookie `qvas_session` con `HttpOnly`, `SameSite=Strict` y `Secure` bajo HTTPS.
- SHA-256 del token almacenado en D1 mediante `auth_sessions`.
- Sesiones con TTL de 7 días.
- Protección same-origin para solicitudes mutantes.

## Cloudflare Access / Zero Trust

Cloudflare Access/Zero Trust **no es un requisito de esta implementación**.

Fue evaluado durante la migración, pero no forma parte de la arquitectura adoptada. Por ello, documentación, configuración o procedimientos que indiquen cualquiera de los siguientes elementos como requisito de este Worker son obsoletos y deben corregirse:

- Protect this Worker behind Access.
- política Allow de Access para el dashboard.
- bypass de Access para `/api/health`.
- `ctx.access` como mecanismo de autenticación.
- Cloudflare Access como sustituto de la sesión D1.

Esto no impide añadir una capa externa de acceso en una arquitectura futura, pero no debe confundirse con el mecanismo de autenticación vigente.

## Superficie pública

- `GET /api/health`: público.
- `GET /login`: público.
- `POST /api/auth/login`: autenticación por credenciales + same-origin.
- `POST /api/auth/logout`: sesión + same-origin.
- `GET /api/auth/session`: sesión válida.
- El resto de `/api/*`: sesión válida.
- Dashboard HTML: sesión válida.

## Regla de seguridad

No se deben introducir tokens estáticos en el frontend, `DASHBOARD_API_TOKEN`, headers de identidad controlables por el cliente ni secretos QvaPay en assets estáticos.

Auto-Apply continúa deshabilitado.
