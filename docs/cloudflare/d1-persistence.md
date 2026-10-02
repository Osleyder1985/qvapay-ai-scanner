# Persistencia Cloudflare D1

## Objetivo

La ejecución Cloudflare de QvaPay AI Scanner utiliza D1 como almacenamiento durable para los datos que no pueden depender de la memoria de un isolate del Worker.

## Fuente de verdad

D1 conserva:

- histórico de mercado;
- ledger de operaciones;
- ledger financiero;
- configuración y estado del monitor server-side de arbitraje;
- estado y configuración reservados para una futura implementación controlada de Auto-Apply.

## Esquema actual

La base se construye mediante migraciones versionadas:

- 0001_initial_qvapay_scanner.sql: esquema inicial.
- 0002_auto_apply_execution_lease.sql: lease de exclusión mutua para Auto-Apply.
- 0003_cloudflare_runtime.sql: market_history y operations_ledger.
- 0006_arbitrage_monitor.sql: arbitrage_monitor_config y arbitrage_monitor_state.

La migración 0006 no reemplaza los ledgers existentes.

## Monitor de arbitraje

D1 persiste la moneda configurada, margen mínimo, estado de ejecución, scan ID, timestamps, próxima ejecución, último error y último snapshot serializado.

Ante errores transitorios se conserva el último snapshot válido y se registra el error. El monitor no almacena un histórico completo de cada ciclo: conserva el último snapshot.

## Consistencia

Las operaciones remotas se sincronizan por UUID mediante upsert. El monitor de arbitraje es analítico y no realiza mutaciones remotas.

## Retención

No se ejecutan purgas automáticas de datos financieros, operaciones, histórico de mercado ni snapshots del monitor.

## Migraciones

Aplicación local:

npm run d1:migrate:local

Aplicación remota:

npm run d1:migrate:remote

Las migraciones aplicadas no deben editarse. Los cambios posteriores requieren una nueva migración.

## Rollback

Un rollback de código no implica rollback automático del esquema. Antes de revertir el Worker hay que comprobar compatibilidad con las migraciones aplicadas.

## Auto-Apply

Auto-Apply permanece desactivado. Sus tablas no constituyen un scheduler ni ejecutan acciones por sí mismas.

## Seguridad

Las credenciales de QvaPay no se almacenan en D1 ni en el repositorio. El Worker las recibe mediante secrets y los payloads persistidos no deben contener secretos ni tokens.
