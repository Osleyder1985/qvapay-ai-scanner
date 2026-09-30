# Diseño de esquema D1 — QvaPay AI Scanner

## 1. Objetivo
Define el modelo relacional inicial para sustituir la persistencia JSON del runtime Node cuando QvaPay AI Scanner migre a Cloudflare Workers + D1.

## 2. Principios
- D1 es la fuente de verdad para estado persistente de negocio y ejecución.
- KV no sustituye D1: se reserva para cache/configuración de baja criticidad.
- UUID de QvaPay es la clave natural de una operación.
- Las escrituras repetidas deben ser idempotentes.
- Las sincronizaciones remotas son upsert, nunca reemplazos destructivos.
- El historial de mercado es append-oriented y consultable por ventana temporal.
- El ledger financiero conserva el UUID de operación y la información de fee.
- Auto-Apply separa configuración, estado diario, intentos y rechazos VIP.
- Timestamps en UTC como ISO-8601 TEXT.
- Importes/tasas REAL en esta fase para conservar semántica con el código Node existente.

## 3. Tablas

### market_snapshots
Equivale a data/market-history.json y MarketHistoryPoint. Columnas: id INTEGER PK, captured_at TEXT, coin TEXT, type TEXT, samples INTEGER, min_rate REAL, median_rate REAL, max_rate REAL, spread REAL, created_at TEXT.
Índice principal: (coin, type, captured_at DESC).

### p2p_operations
Fuente persistente del historial reconstruido desde QvaPay. Sustituye operations-ledger.json. UUID QvaPay es PK. Conserva type, status, amount, receive, current_user_id, User/Peer desnormalizados para consultas, recorded_at, last_seen_at y raw_json.
Índices: (status,last_seen_at DESC), (type,status,last_seen_at DESC), last_seen_at DESC.

### finance_ledger
Fuente financiera derivada de operaciones completadas. UUID es PK y referencia lógica a p2p_operations.uuid. Conserva amount, receive, gross_amount_qusd, fee_qusd, net_amount_qusd y fee_source. Las escrituras deben ser upsert preservando recorded_at y fees ya confirmados.

### auto_apply_config
Configuración singleton id=1: enabled, type, coin, rate_min, rate_max, amount_min, amount_max, daily_max_qusd, max_concurrent, updated_at.

### auto_apply_state
Estado singleton id=1: daily_date, daily_applied_qusd, last_scan_at, last_action_at, last_message, updated_at. No se persiste running: en Workers será una propiedad de la ejecución actual.

### auto_apply_execution_lease
Lease singleton para exclusión mutua de ejecuciones Cloudflare. Conserva owner_id, acquired_at, expires_at y updated_at. Un lease expirado puede ser recuperado por una ejecución posterior.

### auto_apply_attempts
Registro durable de intentos: offer_uuid, attempted_at, http_status, success, amount_qusd, response_json, reason. Sustituye recentApplyAttempts y permite imponer 2 intentos/60 s mediante consulta D1.

### auto_apply_applied_offers
Idempotencia explícita: offer_uuid PK, applied_at, amount_qusd. Sustituye appliedOfferIds.

### auto_apply_vip_rejections
Cooldown persistente: offer_uuid PK, rejected_at, expires_at, reason.

### sync_runs
Auditoría de sincronizaciones: started_at, finished_at, pages_fetched, remote_count, ledger_count, missing_in_ledger_count, stale_local_count, truncated, status y error_message.

## 4. Idempotencia
Operaciones hacen upsert por UUID. Finanzas hacen upsert por UUID y preservan fees confirmados. Auto-Apply registra intentos y resultados y usa offer_uuid para impedir una segunda aplicación.

Una transacción D1 no puede deshacer una mutación ya aceptada por QvaPay. El diseño requiere estado de intento y reconciliación; no se asume atomicidad distribuida.

## 5. Retención inicial
- market_snapshots: 90 días, configurable.
- auto_apply_attempts: 90 días.
- sync_runs: 180 días.
- auto_apply_vip_rejections: limpiar expirados.
- p2p_operations y finance_ledger: sin borrado automático durante la fase inicial.

## 6. Mapeo
| Persistencia actual | D1 |
|---|---|
| data/market-history.json | market_snapshots |
| data/operations-ledger.json | p2p_operations + sync_runs |
| data/finance-ledger.json | finance_ledger |
| data/auto-apply.json config | auto_apply_config |
| data/auto-apply.json state | auto_apply_state |
| recentApplyAttempts | auto_apply_attempts |
| appliedOfferIds | auto_apply_applied_offers |
| vipRejectedOffers | auto_apply_vip_rejections |
| MarketSnapshotService.cache | KV opcional / cache por request |
| MarketSnapshotService.nextAvailableAt | No persistir; controlar rate limit en arquitectura Worker |

## 7. Decisiones pendientes
1. Confirmar precisión monetaria soportada por QvaPay y decidir si REAL debe reemplazarse por unidades enteras.
2. Definir autenticación pública del dashboard.
3. Definir si Auto-Apply requiere cadencia de 30 s o si 1 minuto es suficiente.
4. Medir consumo real de D1/Workers.
5. Provisión y aceptación del recurso D1 productivo (#90).
6. Mantener la aceptación real de QvaPay (#13) separada de esta migración.

## 8. Estado
**Diseño:** baseline técnico de migración.
**Implementación:** repositorio D1 y runtime Worker implementados en `production/cloudflare`. La provisión del recurso D1 productivo, aplicación remota de migraciones y despliegue siguen pendientes del Issue #90.