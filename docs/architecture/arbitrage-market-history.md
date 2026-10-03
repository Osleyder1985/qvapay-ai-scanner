# Historial de eventos y analítica de ejecución de arbitraje

## Propósito

El módulo conserva observaciones del ciclo de vida P2P de QvaPay y calcula analítica determinista aislada por moneda. El módulo es de solo lectura respecto de la ejecución financiera: no aplica, cancela, paga ni crea operaciones.

Flujo:

`QvaPay stream/webhook + reconciliación`
→ `market_events`
→ `normalización y deduplicación`
→ `últimas 500 operaciones completadas válidas por moneda`
→ `analítica de ejecución`

## Identidad y deduplicación

La identidad analítica de un estado de ciclo de vida es `offer_uuid + event`.

El `event_id` externo no se utiliza como identidad primaria porque webhook, stream y reconciliación pueden generar identificadores diferentes para la misma operación.

Para `created`, se conserva el timestamp de evento más antiguo; en empate se conserva la observación más reciente. Para los demás estados se conserva la observación más reciente y, en empate, el timestamp de evento más reciente.

## Timestamps

Se mantienen dos tiempos:

- `event_at`: cuándo ocurrió el estado según los datos disponibles de QvaPay.
- `observed_at`: cuándo fue observado localmente.

Para eventos `created`, el colector prioriza `created_at`; para estados posteriores prioriza `updated_at`, con `created_at` y `sent_at` como fallback.

El tiempo hasta completar sólo se calcula cuando existe `created` y `completed.event_at >= created.event_at`. Los timestamps inconsistentes no producen tiempos negativos ni se utilizan para fabricar una duración.

## Operaciones completadas válidas

Una operación sólo entra en las métricas de ejecución cuando:

- el estado es `completed`;
- `amount`, `receive` y `rate` son finitos y positivos;
- la tasa es coherente con `receive / amount` dentro de una tolerancia numérica de `1e-9` relativa.

Los registros inválidos no consumen posiciones de la ventana analítica.

## Ventana

La ventana predeterminada es de **500 operaciones completadas válidas y únicas por moneda**.

El endpoint permite solicitar entre 1 y 1000 operaciones. La selección se realiza sobre ejecuciones completadas, no sobre el número bruto de eventos de ciclo de vida. Una cancelación no consume una posición de la ventana de ejecuciones.

## Métricas

Por moneda se calculan:

- mínimo y máximo de tasa;
- media y mediana;
- percentiles P10, P25, P50, P75 y P90;
- VWAP;
- volumen negociado;
- conteo de operaciones completadas;
- métricas de tiempo hasta completar cuando los timestamps son válidos;
- timestamp de evento y observación más recientes;
- estado de obsolescencia cuando el consumidor proporciona un límite de antigüedad;
- estadísticas de precio de referencia separadas para `buy` y `sell` cuando existe evidencia de lado. Cada lado conserva muestra, volumen, min/max, media, mediana, percentiles, VWAP y freshness propios.

No se mezclan monedas.

## Reconciliación

La reconciliación reutiliza el historial paginado existente de operaciones propias. Para una operación reconocida se registra el evento `created` cuando existe `created_at` y el estado actual soportado.

Estados soportados:

- `open` → `created`
- `processing` → `applied`
- `paid` → `paid`
- `completed` → `completed`
- `cancelled` → `cancelled`

Los estados desconocidos se contabilizan como no soportados y no se convierten silenciosamente en `completed`.

La paginación acepta respuestas con `total` y también responde defensivamente cuando el campo falta. Si `total` está presente y contradice el número de elementos ya recuperados, la reconciliación falla cerradamente.

## Persistencia D1

La tabla `market_events` usa `dedupe_key` como clave primaria y conserva identidad de oferta, evento, estado, lado, moneda, cantidad, recepción, tasa, timestamps y origen.

Las escrituras usan `ON CONFLICT` con reglas deterministas de canonización. Las inserciones se ejecutan en lotes de 250 sentencias para evitar superar límites operativos de D1.

La consulta específica de analítica filtra en SQL las ejecuciones completadas numéricamente válidas antes de aplicar el límite de la ventana. Esto evita que registros corruptos consuman posiciones de las 500 ejecuciones válidas.

## Webhook

El webhook requiere:

- firma HMAC-SHA-256 válida;
- timestamp dentro de una ventana de cinco minutos;
- secreto proporcionado únicamente por el runtime;
- cuerpo de máximo 256 KiB.

El límite de cuerpo se aplica también durante la lectura del stream para evitar aceptar primero un payload sobredimensionado y validarlo después.

## Calidad de evidencia

Cada estadística de precio de referencia incluye un bloque `quality` determinista. `sampleCount` es el número de operaciones completadas candidatas del lado; `usableSampleCount` son las que pasan la validación de cantidad, receive y rate. Las diferencias se contabilizan como `invalidFieldExcludedCount` y `excludedSampleCount`.

`staleObservationCount` cuenta observaciones cuyo `observedAt` excede `maxAgeMs`; no se inventa una probabilidad de confianza. `lifecycleCompleteCount` cuenta operaciones terminales válidas que sustentan la estadística. `outlierExcludedCount` permanece en cero mientras no exista una política explícita de exclusión de outliers. `firstEventAt`, `lastEventAt` y `timeSpanMs` describen la cobertura temporal y `belowMinimumSample` marca muestras inferiores al `minimumSampleCount` configurado (10 por defecto).

Los metadatos describen calidad y cobertura de evidencia; no constituyen una probabilidad ni un score de confianza estadística. Los datos incompletos se conservan mediante los contadores de exclusión y no se mezclan entre monedas.

## Precio de referencia por lado

`referencePrices.buy` y `referencePrices.sell` se calculan únicamente con operaciones completadas válidas de la misma moneda y lado. Los eventos con otro lado o sin lado no se mezclan en estas estadísticas.

La mediana y los percentiles son robustos frente a valores extremos; el VWAP conserva el peso del volumen negociado. La ausencia de muestras produce `null` y no se fabrica un precio. La freshness se determina con `observed_at` frente a `maxAgeMs` cuando el consumidor lo proporciona.

Estas estadísticas son evidencia descriptiva para análisis posterior. No seleccionan automáticamente un precio, no reprician ofertas y no ejecutan operaciones.

## Limitaciones

- La analítica describe observaciones y operaciones completadas; no demuestra por sí sola liquidez futura.
- Un evento ausente no se interpreta como cancelación o finalización.
- Si falta `created`, la operación completada puede participar en métricas de precio/volumen, pero no en tiempo hasta completar.
- Un timestamp inconsistente no se corrige mediante inferencias heurísticas.
- El módulo no selecciona precios ni ejecuta estrategias de arbitraje.

## Verificación

La implementación debe mantener pruebas deterministas para normalización, deduplicación, aislamiento por moneda, ventana de 500, integridad numérica, timestamps inconsistentes, reconciliación, paginación, límites del webhook y persistencia D1.
