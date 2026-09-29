# P2P Market Dashboard

## Objetivo

Proporcionar una vista de solo lectura del mercado P2P abierto de QvaPay para que el operador pueda revisar las ofertas disponibles, compararlas y posteriormente construir capacidades de análisis.

## Implementación

- Backend: Node.js + TypeScript.
- Frontend: HTML, CSS y JavaScript sin framework en esta primera versión.
- Credenciales QvaPay: variables de entorno del proceso backend.
- El backend sirve el frontend y actúa como proxy controlado hacia QvaPay.

La decisión tecnológica está registrada en `architecture/ADR-001-backend-technology-selection.md`.

## Fuente de datos

La fuente primaria es la API oficial de QvaPay:

- Endpoint: GET /p2p
- Base URL: https://api.qvapay.com
- Autenticación: credenciales de aplicación mediante headers app-id y app-secret.
- Tamaño máximo documentado por página: 100 ofertas.

La consulta se ejecuta desde el backend para evitar exponer app-secret al navegador.

## Datos visibles

La primera versión muestra:

- tipo de oferta: buy / sell;
- moneda;
- monto en QUSD;
- monto a recibir;
- tasa calculada como receive / amount;
- monto disponible;
- límites mínimo/máximo cuando existen;
- usuario ofertante;
- valoración y cantidad de valoraciones;
- operaciones completadas del usuario;
- indicadores KYC, teléfono, Telegram, VIP y Golden Check cuando están presentes.

## Filtros y ordenamiento

La interfaz expone:

- tipo;
- moneda;
- monto mínimo y máximo;
- solo VIP;
- mejor tasa;
- ratio;
- fecha de actualización;
- fecha de creación;
- monto;
- recepción;
- valoración;
- operaciones;
- orden ascendente/descendente.

## Seguridad

Esta versión no contiene credenciales QvaPay en el frontend.

No se implementan en este incremento:

- crear ofertas;
- aplicar a ofertas;
- marcar pagos;
- confirmar recepción;
- retirar fondos;
- ejecución automática.

## Limitación deliberada

La primera versión utiliza consultas bajo demanda. No se activa el Feed del mercado P2P ni SSE porque la documentación actual de QvaPay lo ofrece dentro de una suscripción de 10 USD por 30 días. La necesidad de tiempo real se evaluará después de medir el valor del dashboard con la API estándar.

## Próximas extensiones

1. Historial local de ofertas observadas.
2. Detección de cambios de precio y disponibilidad.
3. Métricas por moneda y método de pago.
4. Filtros avanzados de tasa y liquidez.
5. Alertas.
6. Análisis económico antes de cualquier ejecución automática.
