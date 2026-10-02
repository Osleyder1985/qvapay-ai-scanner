# Arbitrage Scanner

## Objetivo

El módulo de arbitraje detecta oportunidades potenciales sobre el mercado P2P observado por el sistema. Esta primera etapa es exclusivamente **Scanner Mode**: analiza datos y no ejecuta mutaciones contra QvaPay.

## Invariante principal: aislamiento por moneda

Cada oportunidad pertenece a una única moneda.

Una oferta BUY sólo puede emparejarse con una oferta SELL cuando ambas tienen exactamente la misma moneda normalizada. El motor no convierte monedas, no estima tipos de cambio externos y no crea pares entre BANK_CUP, ETECSA, CLASICA, USDT u otros códigos diferentes.

## Normalización

El normalizador exige:

- uuid;
- type igual a buy o sell;
- coin;
- amount;
- available_amount;
- receive;
- updated_at o created_at como timestamp válido.

Los campos financieros deben ser numéricos, finitos y positivos. La liquidez disponible no puede superar el amount declarado.

No se aplican sustituciones silenciosas. Si QvaPay no entrega available_amount, la oferta se rechaza para este motor en lugar de asumir que amount equivale a liquidez disponible.

## Detección

Para cada moneda:

1. se separan las ofertas BUY y SELL;
2. se selecciona la tasa BUY válida más baja;
3. se selecciona la tasa SELL válida más alta;
4. se calcula el spread;
5. se limita la cantidad por la liquidez explícita de ambos lados y por el capital máximo configurado.

Las tasas se calculan como receive / amount, manteniendo la convención ya utilizada por el dashboard.

## Beneficio

Para una cantidad Q:

- capital = Q × buyRate
- grossProfit = Q × (sellRate - buyRate)
- grossMargin = grossProfit / capital × 100

El beneficio neto requiere datos de comisiones proporcionados por una fuente externa al motor. No se codifican porcentajes ni importes de comisión dentro del módulo.

Si alguna comisión requerida no está disponible, netProfitFiat permanece en null y feesStatus es unknown. El sistema no inventa una comisión ni transforma una comisión QUSD a fiat sin una regla de valoración explícita.

## Frescura

Una observación sólo puede participar si:

0 <= now - observedAt <= maxAgeMs

Las observaciones futuras o demasiado antiguas se excluyen.

## Seguridad operacional

Esta etapa no llama a apply, paid, received, cancel ni a ningún endpoint de mutación. La salida del motor es información de análisis, no una orden de ejecución.

## Evolución prevista

Después de cerrar esta etapa con evidencia, la secuencia prevista es:

1. Risk Engine.
2. Execution Engine con revalidación e idempotencia.
3. Settlement Engine.
4. P&L Ledger.
5. Dashboard de arbitraje.
6. Live Execution bajo controles explícitos.

Cada etapa deberá conservar el aislamiento por moneda y las restricciones de seguridad financiera.
