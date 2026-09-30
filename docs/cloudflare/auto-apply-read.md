# Lectura durable de Auto-Apply en D1

Esta etapa añade una frontera de lectura para el estado persistente de Auto-Apply en Cloudflare. No sustituye todavía el motor Node ni ejecuta acciones contra QvaPay.

## Ruta

`GET /api/cloudflare/d1/auto-apply`

Requiere:

`Authorization: Bearer <DASHBOARD_API_TOKEN>`

La respuesta contiene:

- `config`: configuración persistida en `auto_apply_config`, o `null` si no existe.
- `state`: estado persistido en `auto_apply_state`, o `null` si no existe.
- `source.persistence`: siempre `d1`.

La proyección convierte `enabled` de SQLite (0/1) a booleano y conserva límites, fechas, contadores y último mensaje sin recalcularlos en el Worker.

## Seguridad

La ruta es de lectura y está protegida por el token de dashboard. No expone credenciales QvaPay y no ejecuta mutaciones.

## Frontera de migración

Esta etapa **no**:

- activa Auto-Apply;
- reemplaza `AutoApplyEngine` de Node;
- ejecuta `apply`, pago, cancelación u otra mutación QvaPay;
- implementa Cron o Workflows;
- configura un D1 de producción.

D1 queda como fuente de lectura para esta ruta. La ejecución duradera deberá separarse posteriormente en scheduler/executor y validarse de forma independiente.

## Pruebas

La suite cubre:

- rechazo 401 sin autorización;
- lectura conjunta de configuración y estado;
- ausencia de filas persistentes.

CI y Security deben permanecer verdes antes de fusionar esta etapa.
