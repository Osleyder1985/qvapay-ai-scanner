# Cloudflare Auto-Apply executor

## Propósito

`src/backend/cloudflare/cloudflare-auto-apply-executor.ts` implementa una ejecución única y durable de Auto-Apply para el runtime Cloudflare.

El componente no crea timers y no depende de almacenamiento de proceso. Está diseñado para ser invocado posteriormente por Cron o Workflows.

## Secuencia

1. leer configuración D1;
2. salir sin mutación si Auto-Apply está deshabilitado;
3. reclamar el lease singleton;
4. leer operaciones propias en estado `processing`;
5. consultar el mercado P2P;
6. aplicar las reglas de tipo, moneda, estado, VIP, tasa y límites;
7. comprobar `auto_apply_applied_offers`;
8. ejecutar como máximo una mutación por invocación;
9. registrar el intento;
10. registrar el éxito o rechazo VIP;
11. actualizar `auto_apply_state`;
12. liberar el lease en `finally`.

## Idempotencia

La tabla `auto_apply_applied_offers` es la referencia durable para impedir repetir una oferta que ya fue aplicada.

El executor también conserva el límite de operaciones simultáneas consultando las operaciones propias de QvaPay.

## Lease

El lease D1 es singleton. Una ejecución que no consigue el lease devuelve `skipped` y no consulta ni muta QvaPay.

La duración inicial es 90 segundos. La activación futura mediante scheduler deberá garantizar que la frecuencia y el tiempo máximo de ejecución sean compatibles con este TTL.

## Rechazos VIP

Un rechazo HTTP 400 cuyo payload contiene `vip` se registra en `auto_apply_vip_rejections` con una ventana de 5 minutos.

El rechazo no incrementa `daily_applied_qusd`.

## Seguridad operacional

Este cambio no:

- configura Secrets reales;
- conecta un Worker desplegado;
- activa Cron;
- activa Workflows;
- ejecuta Auto-Apply en producción.

La mutación real sólo queda disponible cuando una futura invocación del executor esté explícitamente conectada al runtime de producción.
