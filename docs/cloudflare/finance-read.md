# Lectura financiera en Cloudflare D1

## Objetivo

La migración de Cloudflare añade una frontera de lectura financiera independiente del ledger JSON del runtime Node.

La ruta:

`GET /api/cloudflare/d1/finance?uuid=<QvaPay operation UUID>`

lee exclusivamente desde la tabla `finance_ledger` mediante `D1Repository.getFinance()`.

## Seguridad

La ruta requiere:

`Authorization: Bearer <DASHBOARD_API_TOKEN>`

Si el token no coincide, responde HTTP 401.

No se exponen credenciales QvaPay al navegador y esta ruta no ejecuta ninguna mutación remota.

## Respuestas

- **200**: devuelve la proyección financiera durable, incluyendo `gross_amount_qusd`, `fee_qusd`, `net_amount_qusd` y `fee_source`.
- **400**: falta el parámetro `uuid`.
- **404**: no existe la entrada financiera solicitada.
- **503**: D1 no pudo completar la lectura.

## Frontera de migración

Este cambio no elimina `FinanceLedgerStore` ni `data/finance-ledger.json` del runtime Node.

Tampoco mueve todavía `recordSettlement()`, la conciliación remota ni las escrituras financieras al Worker. La fuente D1 queda preparada para la siguiente fase, mientras Node conserva su funcionamiento actual.

## Pruebas

La suite del Worker cubre autenticación, validación del UUID, lectura de una entrada con comisión confirmada, ausencia de entrada y health check de D1.

La aceptación de producción Cloudflare continúa pendiente hasta disponer de un recurso D1 real, secretos configurados y ejecución del Worker en el entorno objetivo.
