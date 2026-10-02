# Market History

## Propósito

El proyecto mantiene dos capas históricas que no deben confundirse:

1. **Histórico local del backend modular**: observaciones agregadas de mercado para desarrollo y análisis descriptivo.
2. **Histórico operacional Cloudflare/D1**: persistencia de estado y eventos específicos de los módulos desplegados, incluido el monitor de arbitraje.

## Histórico local

La implementación del backend modular puede persistir observaciones agregadas en:

`data/market-history.json`

El archivo es estado de ejecución y no debe versionarse. La ruta puede cambiarse con `MARKET_HISTORY_PATH`.

Cada observación agregada por `coin + type` contiene:

- timestamp;
- sample count;
- minimum effective rate;
- median effective rate;
- maximum effective rate;
- spread.

La tasa efectiva es:

`receive / amount`

La retención predeterminada del collector local es de 10.000 puntos agregados.

## Colección local

El backend modular realiza una colección inicial y posteriormente una colección periódica. Esta capa no es el mecanismo que mantiene vivo el monitor de arbitraje desplegado.

## API

`GET /api/history`

Parámetros opcionales:

- `coin`
- `type`
- `limit` (máximo 1000 por solicitud)

`GET /api/trends` calcula cambios descriptivos sobre las observaciones almacenadas.

`GET /api/baselines` calcula una referencia aritmética reciente. No es una predicción ni una recomendación.

## Monitor de arbitraje y D1

El monitor server-side utiliza Cloudflare D1 para persistir configuración y estado. Su snapshot no sustituye automáticamente al histórico local: representa el último estado de ejecución del monitor.

El detalle de las tablas del monitor se documenta en `docs/cloudflare/d1-schema.md` y `docs/cloudflare/d1-persistence.md`.

## Importante

Un snapshot actual no equivale a un histórico de operaciones completadas.

Las estadísticas de operaciones ejecutadas requieren eventos de ciclo de vida explícitos y una fuente de datos con suficiente cobertura. No se deben inferir operaciones completadas simplemente porque una oferta desaparezca del mercado.

## Estado

Este documento describe la coexistencia de la capa histórica local y la persistencia operacional Cloudflare. Las nuevas capacidades históricas deben declarar explícitamente qué fuente, ventana y unidad monetaria utilizan.
