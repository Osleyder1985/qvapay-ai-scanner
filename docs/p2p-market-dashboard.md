# P2P Market Dashboard

## Objetivo

Proporcionar una vista de solo lectura del mercado P2P abierto de QvaPay para revisar ofertas, compararlas y alimentar capacidades de análisis.

## Estado de implementación

El documento describe la evolución funcional del dashboard original. La aplicación actualmente se despliega como **Cloudflare Worker + frontend estático**, mientras que parte del backend modular Node.js/TypeScript permanece como runtime y referencia de desarrollo local.

Las rutas públicas de la aplicación mantienen el contrato `/api/p2p`; el Worker centraliza la integración con QvaPay y protege las credenciales.

## Fuente de datos

La fuente primaria es la API oficial de QvaPay:

- Endpoint remoto: `GET /p2p`
- Base URL: `https://api.qvapay.com`
- La integración usa credenciales de aplicación en el lado servidor.
- La consulta se pagina y respeta los límites definidos por la capa de integración.

## Datos visibles

La vista de mercado puede mostrar:

- tipo de oferta: buy / sell;
- moneda;
- monto en QUSD;
- monto a recibir;
- tasa calculada como receive / amount;
- monto disponible;
- límites mínimo/máximo cuando existen;
- datos del usuario ofertante cuando QvaPay los proporciona;
- indicadores de mercado disponibles en el contrato recibido.

## Funciones relacionadas

El dashboard actual se complementa con:

- monitor de arbitraje server-side;
- historial y métricas descriptivas;
- estado persistido en D1;
- lectura de snapshots sin depender de una pestaña abierta.

## Seguridad

Las credenciales de QvaPay no se envían al navegador.

El monitor de arbitraje es de solo lectura y no ejecuta compras ni ventas.

Las capacidades de Auto-Apply son un módulo separado y deben considerarse operaciones reales sobre QvaPay; no deben confundirse con el monitor de arbitraje.

## Feed de mercado

El proyecto mantiene una frontera de integración para eventos/stream cuando corresponda. El monitor de arbitraje actual no depende de una conexión SSE abierta desde el navegador ni de un proceso local permanente.

## Próximas extensiones

Las extensiones se gestionarán mediante requisitos y decisiones trazables. Entre ellas pueden estar:

1. ampliar el histórico de operaciones completadas;
2. métricas por moneda y método de pago;
3. alertas;
4. configuración de horarios del monitor;
5. validación económica y operativa antes de cualquier automatización financiera.
