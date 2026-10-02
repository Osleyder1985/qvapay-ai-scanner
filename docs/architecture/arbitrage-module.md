# Módulo de arbitraje

## Propósito

El módulo detecta oportunidades potenciales entre ofertas P2P abiertas de una misma moneda y construye una propuesta de ciclo:

1. adquirir QUSD tomando una oferta `SELL`;
2. proponer la salida tomando una oferta `BUY`;
3. calcular cantidad, capital requerido y beneficio bruto;
4. mostrar la propuesta sin ejecutar ninguna operación.

El módulo actual es **exclusivamente de lectura**.

## Semántica de QvaPay

En el mercado P2P de QvaPay:

- `SELL`: el usuario que toma la oferta compra QUSD pagando la moneda.
- `BUY`: el usuario que toma la oferta vende QUSD y recibe la moneda.

Por tanto, para nuestro arbitraje:

`SELL barato -> adquisición`
`BUY caro -> salida`

## Flujo

El endpoint `GET /api/arbitrage/scan` consulta el mercado público a través del backend, normaliza las ofertas y evalúa todos los pares válidos dentro de cada moneda.

Parámetros:

- `maxCapitalFiat`: capital máximo que el ciclo puede utilizar.
- `maxAgeMs`: antigüedad máxima de una oferta.
- `coin`: filtro opcional de moneda.

El motor rechaza datos inválidos, ofertas obsoletas y timestamps futuros. La cantidad propuesta queda limitada por la liquidez disponible en ambos lados y por el capital máximo.

Cuando existen varios pares rentables, se selecciona el que maximiza el beneficio estimado; si las comisiones están configuradas, se utiliza el beneficio neto como criterio.

## Seguridad

El endpoint no llama a:

- `POST /p2p/:uuid/apply`;
- `POST /p2p/create`;
- `POST /p2p/:uuid/paid`;
- `POST /p2p/:uuid/received`;
- `POST /p2p/:uuid/cancel`.

La interfaz identifica explícitamente el modo como `SOLO LECTURA`.

## Estado actual

### Funciona

- lectura del mercado real;
- separación por moneda;
- detección de adquisición y salida;
- evaluación de todos los pares;
- control de antigüedad;
- control de liquidez;
- límite de capital;
- cálculo de beneficio bruto;
- identificación de las dos ofertas que formarían el ciclo;
- simulación visual sin dinero real;
- pruebas deterministas del motor.

### Todavía no ejecuta

- aplicar automáticamente a la oferta de adquisición;
- reservar simultáneamente las dos puntas;
- crear una oferta de venta propia;
- confirmar pagos;
- confirmar recepción;
- gestionar escrow;
- garantizar que la segunda oferta siga disponible después de adquirir la primera;
- modelar comisiones reales de cada lado si no se suministra un modelo de tarifas;
- ejecutar un ciclo atómico de arbitraje.

Estas limitaciones son intencionales en esta etapa: la primera versión debe demostrar detección y propuesta antes de habilitar cualquier movimiento de fondos.