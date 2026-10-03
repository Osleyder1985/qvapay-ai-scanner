# Auto-Apply configurable

El Auto-Apply observa el mercado P2P y puede aplicar automáticamente a ofertas que cumplan las reglas configuradas.

## Seguridad por defecto

El Auto-Apply está desactivado por defecto. No se habilita ninguna operación automática hasta que el usuario lo active desde el dashboard.

Las credenciales de QvaPay permanecen exclusivamente en el backend.

## Parámetros

- enabled: activa o desactiva el motor.
- type: sell o buy.
- coin: tick de la moneda; vacío significa cualquier moneda.
- rateMin: tasa mínima receive / amount.
- rateMax: tasa máxima receive / amount.
- amountMin: monto mínimo en QUSD.
- amountMax: monto máximo en QUSD.
- dailyMaxQusd: máximo acumulado diario en QUSD.
- maxConcurrent: máximo de operaciones P2P propias en procesamiento que el motor permite antes de pausar.

Los límites de tasa y monto son inclusivos.

## Rate limit

La API de QvaPay documenta un máximo de 2 aplicaciones cada 60 segundos para POST /p2p/:uuid/apply. El motor mantiene un límite local de intentos y nunca intenta superar ese máximo.

El escaneo del mercado se realiza cada 30 segundos en esta primera implementación. El intervalo no se expone como parámetro de negocio porque el límite y la caché de mercado de QvaPay deben gobernar esa decisión.

## Persistencia

La configuración y el estado operativo se guardan en data/auto-apply.json, que se crea automáticamente y no debe versionarse. La plantilla versionada es config/auto-apply.default.json.

## Flujo

1. El motor consulta ofertas P2P.
2. Filtra por tipo, moneda, tasa y monto.
3. Comprueba el máximo diario.
4. Comprueba el máximo de operaciones simultáneas.
5. Comprueba el límite local de aplicaciones.
6. Ejecuta POST /p2p/:uuid/apply.
7. Registra la oferta aceptada y el monto acumulado del día.

El motor no realiza automáticamente el pago fiat ni otras acciones posteriores a apply.

## Estado de Cloudflare

En `production/cloudflare`, Auto-Apply está actualmente deshabilitado. `GET /api/auto-apply/config` devuelve `enabled: false` y las mutaciones `PUT/PATCH /api/auto-apply/config` responden `501` porque todavía no existe persistencia D1 ni scheduler productivo.

Por tanto, el dashboard no debe presentar controles de configuración editables como si pudieran persistirse. La interfaz deshabilita los controles mientras el estado recibido indique que Auto-Apply está deshabilitado. Esta restricción es temporal y fail-closed; la capacidad sólo podrá volver a ser configurable cuando exista persistencia y ejecución verificables.
