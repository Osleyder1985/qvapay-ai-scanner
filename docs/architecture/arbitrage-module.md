# Módulo de arbitraje

## Propósito

El módulo analiza el mercado P2P de QvaPay y construye simulaciones de arbitraje sin ejecutar operaciones. La arquitectura separa motor matemático, adquisición de mercado, monitor persistente y presentación.

## Semántica

SELL significa adquirir QUSD pagando la moneda cotizada. BUY significa vender QUSD y recibir la moneda cotizada. El aislamiento por coin es obligatorio.

## Motor

El motor normaliza ofertas, valida tipos y cantidades, respeta liquidez y límites de orden y calcula oportunidades dentro de la misma moneda.

La lógica vigente no utiliza maxAgeMs como criterio del monitor. Las ofertas no se descartan únicamente por antigüedad.

## Monitor server-side

1. ArbitrageMonitor recibe/activa una alarma.
2. Consulta el mercado P2P mediante el Worker.
3. El análisis normaliza y calcula la simulación.
4. Se genera el snapshot.
5. D1 persiste configuración, estado y payload.
6. El monitor programa la siguiente alarma aproximadamente 10 segundos después.
7. El frontend consulta el snapshot persistido.

El navegador no inicia el escaneo.

## Simulación

La configuración actual expone moneda y margen mínimo, predeterminado 5%.

Para cada SELL compatible se calcula cantidad QUSD, tasa de compra, capital requerido, tasa objetivo, retorno, ganancia bruta y margen bruto.

## API

- GET /api/arbitrage/scan
- GET /api/arbitrage/monitor
- POST /api/arbitrage/monitor

El monitor es explícitamente de solo lectura.

## Persistencia

La migración 0006_arbitrage_monitor.sql crea arbitrage_monitor_config y arbitrage_monitor_state. payload_json conserva el último resultado serializado. Ante errores transitorios se conserva el payload anterior.

## Scheduling

Cloudflare Cron se utiliza para garantizar el arranque del Durable Object al menos una vez por minuto. La frecuencia de 10 segundos la proporciona Durable Object Alarm, no Cron.

El calendario lógico por defecto es 24/7. Los campos de horario existen en D1 para una etapa posterior.

## Limitaciones

La consulta tiene cobertura máxima configurada; D1 recibe escrituras frecuentes; las comisiones no se inventan; y una tasa objetivo no reserva ni garantiza una oferta de salida.
