# Auto-Apply: scheduler y executor

## Problema del runtime actual

El `AutoApplyEngine` histórico combina en una misma clase:

- reglas de selección de ofertas;
- estado persistente;
- llamadas a QvaPay;
- `setInterval()` cada 30 segundos.

Ese modelo depende de un proceso Node vivo y no es una frontera adecuada para Cloudflare Workers.

## Nueva frontera

### Executor

`AutoApplyExecutor.executeOnce()` representa una sola unidad de trabajo.

El executor:

- no crea timers;
- no depende de memoria de proceso para decidir cuándo ejecutarse;
- devuelve un resultado explícito;
- puede ser invocado por Node, Cron o Workflows.

### Scheduler

`AutoApplyScheduler` decide cuándo invocar al executor.

El adaptador `createIntervalAutoApplyScheduler()` mantiene compatibilidad con el runtime Node actual, pero no define la arquitectura Cloudflare.

En Cloudflare, el scheduler futuro será externo al executor:

`Cron / Workflow -> executeOnce() -> D1 / QvaPay`

## Garantías

Una futura ejecución durable debe persistir en D1:

- estado de ejecución;
- intentos;
- ofertas aplicadas;
- rechazos VIP;
- último escaneo y última acción.

Esto permite que una instancia Worker pueda terminar después de una ejecución sin perder el estado necesario para la siguiente.

## Alcance de esta etapa

Esta etapa define únicamente la frontera de scheduling/ejecución. No activa Auto-Apply en Cloudflare, no configura Cron/Workflows y no ejecuta mutaciones QvaPay desde el Worker.

## Próxima etapa

Implementar el adaptador de ejecución Cloudflare sobre D1 y el cliente QvaPay, seguido por un scheduler Cron/Workflow controlado y pruebas de idempotencia/reintento.
