# Arbitrage Scanner

## Objetivo

El módulo de arbitraje detecta y simula oportunidades potenciales sobre el mercado P2P. La capacidad actual es exclusivamente read-only / Scanner Mode: analiza datos y no ejecuta mutaciones contra QvaPay.

## Aislamiento por moneda

Cada oportunidad pertenece a una única moneda. Una oportunidad sólo puede utilizar ofertas con el mismo coin normalizado. El motor no convierte monedas ni mezcla BANK_CUP, ETECSA, CLASICA, USDT u otros códigos.

## Semántica QvaPay

- SELL: el usuario adquiere QUSD pagando la moneda cotizada.
- BUY: el usuario vende QUSD y recibe la moneda cotizada.

La simulación de compra utiliza ofertas SELL. La salida teórica puede utilizar una oferta BUY del mismo coin.

## Criterio de margen

La monitorización persistente utiliza minMarginPercent, cuyo valor predeterminado es 5%.

La antigüedad de una oferta no es un criterio de exclusión del monitor actual. No debe documentarse maxAgeMs como parámetro vigente de esta ruta.

## Simulación QUSD/CUP

Para BANK_CUP la interfaz representa explícitamente: entregar CUP → adquirir QUSD → calcular tasa objetivo → vender QUSD → recibir CUP.

Para una cantidad QUSD:

- purchaseRate = receive / amount
- capitalRequiredFiat = Q × purchaseRate
- targetSaleRate = purchaseRate × (1 + minMarginPercent / 100)
- targetSaleProceedsFiat = Q × targetSaleRate
- projectedGrossProfitFiat = targetSaleProceedsFiat - capitalRequiredFiat
- projectedGrossMarginPercent = projectedGrossProfitFiat / capitalRequiredFiat × 100

Ejemplo: 100 QUSD a 1.000 CUP/QUSD y margen 5% requieren 100.000 CUP; la tasa objetivo es 1.050, el retorno proyectado 105.000 CUP y la ganancia bruta 5.000 CUP.

Estos cálculos son simulaciones y no garantizan una oferta de salida.

## Monitorización persistente

El escaneo ya no depende del navegador. La arquitectura desplegada utiliza Cloudflare Worker, Durable Object ArbitrageMonitor, D1 y Durable Object Alarms.

El objetivo es un ciclo de aproximadamente 10 segundos. El frontend sólo visualiza el snapshot persistido. El monitor puede continuar aunque no exista ninguna pestaña abierta.

El calendario por defecto es 24/7. D1 ya contiene campos para una futura configuración de días, horario y zona horaria, pero esa configuración todavía no está expuesta por la API/UI.

## Estado y errores

Cada ciclo persiste estado, scan ID, timestamps, próxima ejecución y errores. Ante un error transitorio de QvaPay se conserva el último snapshot válido y se registra el error; el Durable Object vuelve a programar el siguiente ciclo.

La interfaz muestra 10 → 0 como cuenta regresiva de presentación; no ejecuta el escaneo.

## Seguridad operacional

El monitor es read-only. No llama a apply, paid, received, cancel ni a endpoints de creación de órdenes. La respuesta declara mode read-only y executionEnabled false.

## Endpoints

- GET /api/arbitrage/scan: análisis bajo demanda.
- GET /api/arbitrage/monitor: configuración, estado y snapshot persistidos.
- POST /api/arbitrage/monitor: actualización del margen/moneda y arranque del monitor.

## Límites conocidos

- La consulta del mercado tiene un límite de páginas y expone coverage.truncated cuando corresponde.
- Se realizan escrituras frecuentes en D1 porque se persiste el estado/snapshot de cada ciclo.
- El margen es bruto; las comisiones reales sólo pueden incorporarse con información suficiente.
- La tasa objetivo de venta es una simulación y no reserva una oferta BUY.
- La configuración de horario está preparada en D1 pero aún no forma parte del contrato público.
