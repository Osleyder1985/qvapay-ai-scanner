# Persistencia Cloudflare D1

## Objetivo

La ejecución Cloudflare del QvaPay AI Scanner utiliza D1 como almacenamiento durable para los datos que no pueden depender de la memoria de un isolate del Worker.

## Fuente de verdad

D1 es la fuente de verdad para:

- histórico de mercado;
- ledger de operaciones;
- ledger financiero;
- estructura reservada para estado/configuración de Auto-Apply.

No se utiliza KV ni memoria del Worker como fuente de verdad financiera o transaccional.

## Esquema

La migración `migrations/0001_cloudflare_runtime.sql` crea:

- `market_history`: puntos agregados por timestamp, moneda y tipo.
- `operations_ledger`: snapshot de cada operación indexada por UUID.
- `finance_ledger`: operaciones completadas y datos de conciliación de comisiones.
- `auto_apply_config`: configuración singleton preparada para una futura implementación controlada.
- `auto_apply_state`: estado singleton preparado para una futura implementación controlada.

Se crean índices para las consultas de histórico y reconciliación.

## Consistencia

Las operaciones remotas se sincronizan por UUID mediante upsert. El ledger conserva los identificadores que no aparezcan en la consulta remota para permitir detectar `staleLocal`.

Las entradas financieras conservan los datos de comisión ya registrados. Una respuesta exitosa de `received` puede actualizar `grossAmountQusd`, `feeQusd`, `netAmountQusd` y `feeSource`.

El histórico de mercado se agrega cuando se consulta la primera página del mercado. Esto evita depender de un proceso residente del Worker.

## Retención

El esquema no elimina automáticamente datos financieros ni operaciones. El histórico de mercado tampoco se purga automáticamente en esta fase. Cualquier política de retención deberá implementarse mediante una migración/versionado explícito y una tarea programada controlada.

## Migraciones

Aplicación local:

```text
npm run d1:migrate:local
```

Aplicación remota:

```text
npm run d1:migrate:remote
```

La migración remota debe ejecutarse contra la base de producción correcta y verificarse antes de desplegar código que dependa del esquema.

Cloudflare registra las migraciones aplicadas en `d1_migrations`.

## Rollback

Las migraciones D1 deben tratarse como cambios de esquema versionados. No se debe editar una migración ya aplicada para intentar revertirla. Para cambios posteriores se debe crear una nueva migración.

Una reversión de código del Worker no implica automáticamente una reversión del esquema. Antes de hacer rollback de una versión del Worker hay que comprobar que el esquema D1 requerido por esa versión siga siendo compatible.

## Auto-Apply

Auto-Apply permanece desactivado.

Esta migración **no** habilita:

- ejecución automática;
- Cron;
- aplicaciones automáticas a ofertas;
- mutaciones programadas contra QvaPay.

La tabla de Auto-Apply solo prepara la persistencia futura.

## Health check

El Worker expone:

```text
GET /api/cloudflare/d1/health
```

La respuesta debe confirmar la presencia de las tablas requeridas.

## Seguridad

Las credenciales de QvaPay no se almacenan en D1 ni en el repositorio. Continúan como secrets del Worker.

No se almacenan secretos, tokens de acceso ni credenciales de usuario en los payloads persistidos.
