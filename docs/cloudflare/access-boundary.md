# Autenticación y frontera pública de Cloudflare

## Objetivo

El dashboard de QvaPay AI Scanner dejó de ejecutarse detrás del límite local-only del servidor Node al migrar a Cloudflare Workers. La exposición pública del Worker no debe sustituir ese límite por confianza implícita.

La arquitectura productiva utiliza Cloudflare Access como frontera de autenticación y autorización de acceso al Worker, y el propio Worker aplica controles adicionales sobre su API.

## Modelo de confianza

Internet → Cloudflare Access → Worker → D1 / QvaPay API

Cloudflare Access debe proteger All traffic del Worker de producción. La política Allow debe limitar el acceso a la identidad o grupo autorizado para este dashboard.

## Endpoints

### Público

| Método | Endpoint | Motivo |
|---|---|---|
| GET | /api/health | Health check no sensible |

### Autenticado

Todos los demás endpoints /api/* requieren una identidad válida de Cloudflare Access.

Esto incluye:

- /api/cloudflare/d1/health
- /api/market/snapshot
- /api/history
- /api/trends
- /api/baselines
- /api/p2p
- /api/p2p/:uuid
- /api/intelligence
- /api/account
- /api/operations
- /api/finance
- /api/auto-apply/config
- /api/auto-apply/status

### Mutaciones

Las mutaciones requieren:

1. autenticación mediante Cloudflare Access;
2. autorización mediante la política de Access que controla quién puede entrar al dashboard;
3. solicitud same-origin;
4. validación de payload y parámetros existente;
5. respuesta fail-closed ante ausencia de identidad.

Actualmente las mutaciones son:

- POST /api/p2p/:uuid/apply
- POST /api/operations/:uuid/paid
- POST /api/operations/:uuid/received
- POST /api/operations/:uuid/cancel
- POST /api/operations/:uuid/chat
- POST /api/operations/:uuid/rate

No se introduce un token estático del dashboard ni un secreto en el frontend.

## Same-origin y CSRF

El frontend y la API se sirven desde el mismo Worker. Por ello no se necesita una política CORS para el flujo normal del dashboard.

Las solicitudes mutantes verifican el header Origin y exigen que su origen coincida exactamente con el origen de la petición.

Una petición mutante sin Origin se rechaza. Esto evita utilizar la ausencia de un header como mecanismo de bypass para acciones que cambian estado.

Las solicitudes cross-origin no forman parte del contrato actual de la API.

Cloudflare Access también dispone de controles de cookies y protección CSRF propios; la aplicación no debe asumir que CORS equivale a autenticación.

## Fail-closed

El Worker comprueba ctx.access para toda la API excepto /api/health.

Si Access no autenticó la invocación: 403 Access authentication is required for this resource.

Si Access está presente pero no devuelve identidad: 403 Authenticated Access identity is unavailable.

No se acepta como sustituto:

- Authorization arbitrario enviado por el navegador;
- Bearer almacenado en JavaScript;
- DASHBOARD_API_TOKEN;
- un email enviado por el cliente;
- un header de identidad que el cliente pueda controlar.

La identidad utilizada por el Worker procede de ctx.access.

## Configuración de Cloudflare Access

En Cloudflare:

1. Abrir Workers & Pages.
2. Seleccionar qvapay-ai-scanner.
3. Abrir Access.
4. Seleccionar Protect this Worker behind Access.
5. Elegir All traffic.
6. Configurar una política Allow limitada al usuario o grupo autorizado.
7. Mantener protegidos producción y previews salvo que exista una razón documentada para una excepción.
8. Crear un bypass exclusivamente para /api/health si se necesita un health check público.

El bypass de health debe ser lo más estrecho posible. Un bypass de Access desactiva los controles de Access para el tráfico que coincide con él, por lo que no debe utilizarse como mecanismo general de acceso.

## Identidad

El Worker obtiene la identidad mediante ctx.access.getIdentity().

No se parsea manualmente el JWT de Access.

## Frontend

El frontend no contiene:

- QVAPAY_APP_ID;
- QVAPAY_APP_SECRET;
- Access Client Secret;
- API token estático;
- credenciales QvaPay.

Las llamadas del dashboard son same-origin.

## Automatización futura

Un scheduler o agente no debe reutilizar credenciales de un usuario humano ni exponerlas al frontend.

Cuando se implemente ejecución headless, deberá utilizarse una política Service Auth de Cloudflare Access con un Service Token almacenado como secret, y deberán definirse sus permisos y ciclo de rotación por separado.

Auto-Apply permanece deshabilitado.

## Pruebas

Se cubren automáticamente:

- ausencia de ctx.access → rechazo;
- identidad autenticada → aceptación;
- origen igual → aceptación;
- origen diferente → rechazo;
- ausencia de Origin en una mutación → rechazo;
- solicitudes GET → no requieren control same-origin.

La validación de producción debe comprobar además:

1. acceso sin sesión → bloqueado por Access;
2. login autorizado → dashboard disponible;
3. /api/health → disponible según la política pública configurada;
4. API autenticada → funciona;
5. mutación cross-origin → rechazada;
6. ninguna credencial aparece en el frontend;
7. no se ejecutan mutaciones QvaPay destructivas durante el smoke test.

## Referencias oficiales

- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/
- https://developers.cloudflare.com/cloudflare-one/access-controls/policies/