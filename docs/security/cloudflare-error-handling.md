# Contrato de errores públicos de Cloudflare

## Objetivo

El Worker separa los diagnósticos internos de los mensajes que atraviesan la frontera HTTP. Un error de runtime, D1, parsing o QvaPay no debe convertirse automáticamente en texto público.

## Política

- Las respuestas HTTP de error utilizan un código público estable y un mensaje genérico.
- Los objetos Error, message, stack, payloads de requests y credenciales no se serializan en respuestas HTTP.
- La observabilidad interna registra únicamente eventos y códigos sanitizados; no se registra el objeto Error.
- Los estados persistentes que puedan llegar al navegador, como arbitrage_monitor_state.last_error, almacenan códigos públicos, nunca mensajes de excepciones.
- Los valores históricos que no correspondan al catálogo conocido se normalizan al código genérico correspondiente antes de exponerlos.
- Los contratos de upstream se clasifican como errores de integración sin devolver detalles del proveedor.
- Los mensajes de validación de entrada son específicos de la validación y no contienen detalles del runtime.

## Catálogo

| Código | Uso |
| --- | --- |
| INTERNAL_ERROR | Fallo interno no clasificable |
| UPSTREAM_ERROR | Fallo de servicio externo |
| UPSTREAM_CONTRACT_ERROR | Respuesta externa incompatible |
| D1_UNAVAILABLE | D1 no disponible |
| AUTH_SERVICE_UNAVAILABLE | Dependencia de autenticación no disponible |
| AUTH_SESSION_CREATE_FAILED | Fallo creando sesión |
| MONITOR_STATE_READ_FAILED | Fallo leyendo estado del monitor |
| MONITOR_CONFIG_ROW_MISSING | Configuración requerida ausente |
| MONITOR_CONFIG_WRITE_FAILED | Fallo actualizando configuración |
| MONITOR_RUN_FAILED | Fallo de un ciclo del monitor |

## Recuperación y diagnóstico

El cliente recibe solamente el código y el mensaje público. Para investigar un incidente se utilizan los eventos sanitizados del Worker y la evidencia de CI/Cloudflare. Esto evita convertir los endpoints públicos en un canal de exfiltración de mensajes de runtime.

La sanitización es fail-closed: si un estado persistente contiene un valor histórico que no pertenece al catálogo, la API lo sustituye por MONITOR_RUN_FAILED en lugar de devolver el texto histórico.


## Trazabilidad

Issue #136: contrato de errores públicos y sanitización de diagnósticos verificados mediante CI.
