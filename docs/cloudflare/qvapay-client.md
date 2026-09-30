# Cloudflare QvaPay HTTP client

## Propósito

`src/backend/cloudflare/qvapay-client.ts` define la frontera HTTP de QvaPay para el runtime Cloudflare.

La implementación usa únicamente APIs Web estándar:

- `fetch`
- `Request`
- `Response`
- `Headers`
- `URL`
- `AbortController`

No depende de `node:fs`, `node:http`, timers de aplicación ni almacenamiento local.

## Operaciones

- `getP2P(query)`: lectura del mercado P2P.
- `getOwnP2P(status)`: lectura de operaciones P2P propias.
- `applyP2POffer(uuid)`: POST de aplicación a una oferta.

La mutación está disponible como método del cliente porque forma parte de la frontera de integración, pero **este cambio no conecta el método a Cron, Workflows ni a Auto-Apply**.

## Credenciales

El cliente recibe `appId` y `appSecret` mediante configuración del runtime. Las credenciales no forman parte del frontend, del repositorio ni de los tests.

En Cloudflare deberán residir como Secrets del Worker.

## Errores y respuestas

El cliente no convierte un rechazo de QvaPay en éxito. Devuelve:

- `status`
- `ok`
- `payload`
- headers de respuesta

Esto permite que el executor registre respuestas como VIP requerido, permisos insuficientes, rate limiting u otros estados HTTP sin perder el payload de QvaPay.

## Timeout

Cada solicitud obtiene un `AbortController` con timeout configurable. El valor predeterminado es 20 segundos.

## Seguridad

Este cliente no debe ser importado por código frontend. Su responsabilidad es exclusivamente server-side/Worker.

## Siguiente frontera

El siguiente paso es conectar este cliente con un executor Cloudflare que:

1. reclame el lease D1;
2. lea configuración/estado;
3. consulte mercado y operaciones propias;
4. aplique reglas de elegibilidad;
5. compruebe idempotencia;
6. sólo ejecute una mutación cuando la política de ejecución lo permita;
7. persista intento/resultado;
8. libere el lease.

La activación mediante Cron/Workflows y el deployment real quedan fuera de este cambio.
