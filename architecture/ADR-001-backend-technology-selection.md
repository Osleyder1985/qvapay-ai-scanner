# ADR-001: Selección de tecnologías de backend

## Estado

**Supersedida parcialmente por la arquitectura Cloudflare desplegada.**

Esta ADR conserva la decisión histórica de septiembre de 2026. La arquitectura de producción actual debe consultarse en `architecture/architecture-overview.md` y `docs/architecture/cloudflare-runtime-boundary.md`.

## Fecha

2026-09-29

## Contexto histórico

QvaPay AI Scanner debía evolucionar desde un dashboard P2P de solo lectura hacia una plataforma capaz de consultar QvaPay, recopilar observaciones, almacenar datos históricos, calcular métricas, generar alertas e incorporar automatización posteriormente.

En el momento de esta decisión se consideró un backend TypeScript/Node.js modular monolith, con PostgreSQL como persistencia y Python reservado para analytics/AI.

## Decisión histórica

Se adoptó TypeScript/Node.js como backend principal de aplicación, Python para analytics/AI cuando existiera una necesidad real y Go únicamente si las mediciones demostraran una necesidad de rendimiento.

Se evitó introducir microservicios prematuramente.

## Estado actual

La implementación desplegada en Cloudflare evolucionó esta decisión de infraestructura:

| Responsabilidad | Implementación actual |
|---|---|
| Runtime HTTP | Cloudflare Worker + TypeScript |
| Frontend | Assets servidos por el Worker |
| Persistencia operacional | Cloudflare D1 |
| Trabajo persistente cada 10 s | Durable Object + Alarm |
| Bootstrap/recovery | Cron Trigger de 1 minuto |
| Integración QvaPay | Cliente TypeScript en Worker |
| Analytics/AI | No es un componente obligatorio del runtime actual |

El diseño conserva el principio original de modularidad y tipado, pero **PostgreSQL ya no es la persistencia de producción del runtime Cloudflare actual**.

## Consecuencias

- La decisión tecnológica original sigue siendo útil como antecedente.
- La topología de producción actual se documenta en los artefactos Cloudflare y D1.
- No debe utilizarse esta ADR para describir la infraestructura desplegada actualmente.

## Reglas de evolución

No se introducirá otro runtime o microservicio sin una necesidad técnica demostrable y documentada mediante una nueva decisión arquitectónica.
