# Diseño de esquema D1 — QvaPay AI Scanner

## 1. Objetivo
Define el modelo relacional utilizado por el runtime Cloudflare de QvaPay AI Scanner.

D1 es la persistencia durable del Worker. El runtime Node heredado continúa disponible para desarrollo local, pero no es la fuente de verdad de producción Cloudflare.

## 2. Principios
- D1 es la fuente de verdad para el estado persistente gestionado por el Worker.
- UUID de QvaPay es la clave natural de una operación cuando existe.
- Las escrituras repetidas deben ser idempotentes.
- Las sincronizaciones remotas son upsert y no reemplazos destructivos.
- El histórico de mercado es append-oriented.
- El ledger financiero conserva el UUID de operación y la información de fee disponible.
- Auto-Apply mantiene configuración, estado, intentos, rechazos VIP y lease separados para una futura ejecución controlada.
- Timestamps se almacenan como texto ISO-8601 en UTC.
- Los importes/tasas utilizan REAL en esta fase para conservar la semántica del código existente.

## 3. Tablas del esquema

### Tablas creadas por `0001_initial_qvapay_scanner.sql`

- `market_snapshots`: snapshots de mercado del esquema inicial.
- `p2p_operations`: historial persistente de operaciones P2P.
- `finance_ledger`: ledger financiero de operaciones completadas.
- `auto_apply_config`: configuración singleton de Auto-Apply.
- `auto_apply_state`: estado singleton de Auto-Apply.
- `auto_apply_attempts`: registro durable de intentos.
- `auto_apply_applied_offers`: idempotencia por oferta aplicada.
- `auto_apply_vip_rejections`: cooldown de rechazos por falta de VIP.
- `sync_runs`: auditoría de sincronizaciones.

### Tabla añadida por `0002_auto_apply_execution_lease.sql`

- `auto_apply_execution_lease`: lease singleton para evitar ejecuciones simultáneas futuras de Auto-Apply.

### Tablas añadidas por `0003_cloudflare_runtime.sql`

- `market_history`: histórico agregado utilizado por las rutas Cloudflare de histórico, tendencias y baselines.
- `operations_ledger`: ledger/snapshot de operaciones utilizado por la reconciliación del Worker Cloudflare.

La migración `0003` extiende el esquema y no redefine las tablas anteriores.

## 4. Idempotencia
Las operaciones se actualizan por UUID.

Las entradas financieras se actualizan por UUID y conservan la información de comisión ya registrada cuando el nuevo payload no la sustituye.

Auto-Apply dispone de estructuras separadas para intentos, ofertas aplicadas, rechazos VIP y exclusión mutua. Estas tablas no activan por sí mismas ninguna ejecución automática.

Una transacción D1 no puede deshacer una mutación ya aceptada por QvaPay. Cualquier futura ejecución automática debe tratar D1 y QvaPay como sistemas separados y utilizar reconciliación.

## 5. Retención
El comportamiento desplegado actualmente **no ejecuta purgas automáticas**.

Los objetivos de retención pueden definirse posteriormente mediante una política explícita, una migración/versionado y una tarea programada controlada. No deben interpretarse como una característica activa del esquema actual.

## 6. Mapeo de persistencia

| Persistencia del runtime Node | D1 Cloudflare |
|---|---|
| `data/market-history.json` | `market_snapshots` |
| histórico agregado del Worker | `market_history` |
| `data/operations-ledger.json` | `p2p_operations` |
| ledger de operaciones del Worker | `operations_ledger` |
| `data/finance-ledger.json` | `finance_ledger` |
| configuración de Auto-Apply | `auto_apply_config` |
| estado de Auto-Apply | `auto_apply_state` |
| intentos recientes | `auto_apply_attempts` |
| ofertas aplicadas | `auto_apply_applied_offers` |
| rechazos VIP | `auto_apply_vip_rejections` |
| ejecuciones de sincronización | `sync_runs` |
| exclusión mutua Cloudflare | `auto_apply_execution_lease` |

## 7. Rutas Cloudflare relacionadas
- `GET /api/cloudflare/d1/health`
- `GET /api/market/snapshot`
- `GET /api/history`
- `GET /api/trends`
- `GET /api/baselines`
- `GET /api/operations`
- `GET /api/finance`

Las rutas de mercado pueden generar nuevos puntos en `market_history` cuando consultan la primera página del mercado.

## 8. Estado de producción
Estado verificado para `production/cloudflare`:
- D1 productivo configurado con binding `DB`.
- Migraciones `0001`, `0002` y `0003` aplicadas.
- Worker desplegado.
- El dashboard obtiene datos P2P reales mediante el Worker.
- Auto-Apply continúa deshabilitado.
