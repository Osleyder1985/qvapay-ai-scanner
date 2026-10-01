# Autenticación y frontera pública de Cloudflare

## Objetivo
La migración a Cloudflare Workers eliminó el límite de red local-only que protegía al servidor Node histórico. El Worker de producción no puede confiar en que una petición pública sea legítima.

La solución productiva de este proyecto no depende de Cloudflare Zero Trust/Access. Utiliza autenticación propia del Worker con una sesión HTTP-only persistida en D1.

**Estado arquitectónico vigente:** Cloudflare Access/Zero Trust no forma parte de la frontera de autenticación de este Worker. La opción se evaluó durante la migración, pero no se adopta. Cualquier documentación que describa Access como requisito de producción debe considerarse obsoleta.

## Modelo de confianza
Internet → Worker → sesión HTTP-only → D1 / QvaPay API

Las credenciales de autenticación se mantienen como secrets del Worker. La sesión del navegador se representa mediante una cookie HttpOnly, Secure en HTTPS y SameSite=Strict.

## Secrets requeridos
Configurar fuera de Git:
- QVAPAY_APP_ID
- QVAPAY_APP_SECRET
- AUTH_USERNAME
- AUTH_PASSWORD

Ejemplo:
```text
npx wrangler secret put QVAPAY_APP_ID
npx wrangler secret put QVAPAY_APP_SECRET
npx wrangler secret put AUTH_USERNAME
npx wrangler secret put AUTH_PASSWORD
```

Los valores reales no deben aparecer en el repositorio, frontend, logs ni capturas.

## Persistencia de sesiones
La migración 0004_auth_sessions.sql crea auth_sessions.

Se almacena únicamente un SHA-256 del token aleatorio de sesión, nunca el token de sesión en texto plano.

La sesión:
- dura 7 días;
- se invalida al cerrar sesión;
- se reemplaza cuando el mismo usuario vuelve a iniciar sesión;
- se rechaza si está expirada;
- actualiza last_seen_at en cada autenticación.

La cookie no es accesible desde JavaScript.

## Endpoints
### Público
| Método | Endpoint | Motivo |
|---|---|---|
| GET | /api/health | Health check no sensible |
| GET | /login | Formulario de autenticación |

### Autenticación
| Método | Endpoint | Control |
|---|---|---|
| POST | /api/auth/login | Credenciales + same-origin |
| POST | /api/auth/logout | Sesión + same-origin |
| GET | /api/auth/session | Sesión válida |

### Privado
Todos los demás endpoints /api/* requieren una sesión válida.

También se protege el dashboard HTML servido en /.

## Mutaciones y CSRF
Las mutaciones requieren sesión válida, solicitud same-origin y validación de payload existente.

Las solicitudes mutantes sin Origin se rechazan. Las solicitudes cross-origin se rechazan.

Las mutaciones actuales incluyen:
- POST /api/p2p/:uuid/apply
- POST /api/operations/:uuid/paid
- POST /api/operations/:uuid/received
- POST /api/operations/:uuid/cancel
- POST /api/operations/:uuid/chat
- POST /api/operations/:uuid/rate

## Fail-closed
Si no existe cookie de sesión, el Worker devuelve HTTP 401.
Si la sesión no existe en D1 o está expirada, devuelve HTTP 401 y elimina la sesión inválida.

No se acepta como sustituto:
- Bearer arbitrario enviado por el navegador;
- token estático en JavaScript;
- DASHBOARD_API_TOKEN;
- email enviado por el cliente;
- headers de identidad controlables por el cliente;
- Cloudflare Access.

Cloudflare Access puede existir como una capa externa independiente en otro diseño futuro, pero no debe marcarse como requisito de esta implementación ni mezclarse con la autorización del Worker.

## Frontend
El frontend no contiene QVAPAY_APP_ID, QVAPAY_APP_SECRET, AUTH_PASSWORD, token de sesión ni credenciales QvaPay.
La cookie de sesión es HttpOnly.

## Auto-Apply
Auto-Apply continúa deshabilitado. No se habilita Cron ni ejecución headless como parte de esta remediación.

## Limitación actual
Esta autenticación proporciona una frontera de usuario única: AUTH_USERNAME + AUTH_PASSWORD.
No constituye todavía un sistema multiusuario/RBAC. Si el dashboard pasa a tener varios operadores, deberá evolucionar a identidades individuales, roles explícitos, rotación y auditoría por sujeto.

## Pruebas
Los tests cubren credenciales no configuradas, ausencia de cookie, atributos seguros de la cookie, same-origin, cross-origin y ausencia de Origin en mutaciones.

La validación de producción debe comprobar el login real, el acceso al dashboard y la protección de API sin ejecutar mutaciones QvaPay destructivas.

## Referencias
La implementación utiliza las primitivas Web Crypto y cookies HTTP del runtime de Cloudflare Workers y D1 para persistencia. No requiere habilitar Cloudflare Zero Trust para esta arquitectura.

## Regla de documentación

La fuente de verdad para la frontera de acceso es este documento y el código de `src/cloudflare/access.ts` + `src/worker.ts`. No debe documentarse `ctx.access`, una política de Access, "Protect this Worker behind Access" ni un bypass de Access como parte de la configuración requerida. La única configuración de autenticación necesaria para esta implementación son los cuatro Worker Secrets documentados arriba.
