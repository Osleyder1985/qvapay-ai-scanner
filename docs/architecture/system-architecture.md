# Arquitectura del sistema

## Estado
**Baseline de implementación — septiembre de 2026.**

Este documento describe la arquitectura que existe actualmente y separa las decisiones implementadas de las capacidades futuras.

## Arquitectura actual
QvaPay AI Scanner utiliza un **modular monolith** con backend Node.js/TypeScript y frontend web servido por el mismo proceso. El backend actúa como frontera de integración con QvaPay y mantiene las credenciales de aplicación fuera del navegador.

### Backend
- integración con API oficial de QvaPay;
- lectura de mercado P2P;
- aplicación controlada a ofertas;
- seguimiento de operaciones;
- Auto-Apply con controles explícitos;
- historial y métricas de mercado;
- tendencias y baselines;
- cuenta y datos financieros locales;
- centro de operaciones.

### Frontend
Aplicación web responsive con navegación por páginas y componentes reutilizables. El frontend consume rutas internas del backend para las operaciones que requieren credenciales de QvaPay.

### Persistencia
El sistema actual utiliza archivos JSON locales para determinadas funciones de historial y ledger. PostgreSQL queda como evolución futura y no es una dependencia actual.

## Decisiones de arquitectura
1. **Modular monolith antes que microservices.** No existe evidencia actual que justifique distribución operativa.
2. **Node.js + TypeScript como runtime principal.**
3. **Python solamente cuando una necesidad de análisis/ML/AI lo justifique.**
4. **Polling inicialmente para mercado.** Feed SSE/webhook de QvaPay queda como alternativa futura.
5. **Credenciales QvaPay exclusivamente en backend.**
6. **Automatización financiera progresiva y controlada.**
7. **No auto-trading completo sin validación económica, operativa y de riesgo.**

## Fronteras de confianza
El navegador es un cliente no confiable. Las credenciales de QvaPay y las acciones con efectos financieros deben permanecer detrás del backend.

Mientras no exista autenticación/autorización de aplicación, el despliegue debe tratarse como **local-only** y no exponerse a LAN/Internet.

## Evolución prevista
- servicio centralizado de snapshots de mercado;
- caché y scheduler respetando cuotas;
- persistencia robusta;
- reconciliación financiera;
- integración/E2E;
- observabilidad;
- autenticación/autorización;
- OpenAPI;
- eventual PostgreSQL si el volumen/consistencia lo exige.

Microservices, serverless y otros patrones distribuidos solamente se introducirán mediante evidencia y una decisión arquitectónica registrada.