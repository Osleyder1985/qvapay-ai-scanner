# Persistencia Cloudflare D1

## Objetivo

La ejecución Cloudflare de QvaPay AI Scanner utiliza D1 como almacenamiento durable para los datos que no pueden depender de la memoria de un isolate del Worker.

## Fuente de verdad

D1 es la fuente de verdad para:

- histórico de mercado persistido por el runtime Cloudflare;
- ledger de operaciones sincronizado desde QvaPay;
- ledger financiero derivado de operaciones completadas;
- estado y configuración reservados para una futura implementación controlada de Auto-Apply.

No se utiliza KV ni memoria del Worker como fuente de verdad financiera o transaccional.

## Esquema actual

La base productiva se construye mediante migraciones versionadas:

- `0001_initial_qvapay_scanner.sql`: esquema D1 inicial, incluyendo `market_snapshots`, `p2p_operations`, `finance_ledger`, las tablas de estado de Auto-Apply y `sync_runs`.
- `0002_auto_apply_execution_lease.sql`: añade `auto_apply_execution_lease` para exclusión mutua futura de ejecuciones de Auto-Apply.
- `0003_cloudflare_runtime.sql`: añade `market_history` y `operations_ledger` para el runtime Cloudflare actual.

La migración `0003` no redefine las tablas creadas por `0001`.

## Consistencia

Las operaciones remotas se sincronizan por UUID mediante upsert. El ledger conserva los identificadores locales que no aparezcan en la consulta remota para permitir detectar diferencias entre el estado remoto y el local.

Las entradas financieras conservan los datos de comisión ya registrados. Una respuesta exitosa de `received` puede actualizar `grossAmountQusd`, `feeQusd`, `netAmountQusd` y `feeSource`.

El histórico de mercado se agrega cuando el Worker consulta la primera página del mercado. Esto permite persistir snapshots sin depender de un proceso residente.

## Retención

El esquema actual no ejecuta una purga automática de datos financieros, operaciones ni histórico de mercado.

Cualquier política de retención deberá implementarse mediante una migración/versionado explícito y una tarea programada controlada. La documentación de diseño puede contener objetivos de retención futuros, pero no deben presentarse como comportamiento ya desplegado.

## Migraciones

Aplicación local:

```text
npm run d1:migrate:local
```

Aplicación remota:

```text
npm run d1:migrate:remote
```

La migración remota debe ejecutarse contra la base productiva correcta y verificarse antes de desplegar código que dependa del esquema.

Cloudflare registra las migraciones aplicadas en `d1_migrations`.

**Estado productivo verificado:** las migraciones `0001`, `0002` y `0003` fueron aplicadas en la base D1 `qvapay-ai-scanner`.

## Rollback

Las migraciones D1 deben tratarse como cambios de esquema versionados. No se debe editar una migración ya aplicada para intentar revertirla. Para cambios posteriores se debe crear una nueva migración.

Una reversión de código del Worker no implica automáticamente una reversión del esquema. Antes de hacer rollback de una versión del Worker hay que comprobar que el esquema D1 requerido por esa versión siga siendo compatible.

## Auto-Apply

Auto-Apply permanece desactivado.

Esta etapa no habilita:

- ejecución automática;
- Cron;
- aplicaciones automáticas a ofertas;
- mutaciones programadas contra QvaPay.

Las tablas correspondientes preparan persistencia y control de concurrencia para una futura implementación, pero no constituyen por sí mismas un scheduler ni ejecutan acciones.

## Health check

El Worker expone:

```text
GET /api/cloudflare/d1/health
```

La respuesta comprueba la disponibilidad de D1 y la presencia de las tablas requeridas por el runtime.

## Seguridad

Las credenciales de QvaPay no se almacenan en D1 ni en el repositorio. El Worker las recibe mediante los secrets:

- `QVAPAY_APP_ID`
- `QVAPAY_APP_SECRET`

No se almacenan secretos, tokens de acceso ni credenciales de usuario en los payloads persistidos.
