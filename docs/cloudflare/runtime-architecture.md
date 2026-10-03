# Arquitectura del runtime Cloudflare

**Baseline:** 2026-10-03  
**Estado:** Normativa  
**Issue:** #122

## Fuente única del runtime

El runtime Cloudflare productivo tiene un único entrypoint:

`wrangler.jsonc` → `src/worker.ts`

`src/worker.ts` compone únicamente adaptadores y casos de uso bajo `src/cloudflare/`. La exportación de `ArbitrageMonitor` desde ese entrypoint existe porque Wrangler necesita registrar la clase del Durable Object declarada en `wrangler.jsonc`.

No existe un segundo entrypoint productivo bajo `src/worker/index.ts` ni una implementación paralela bajo `src/backend/cloudflare/`.

## Responsabilidades

| Capa | Propietario | Responsabilidad |
|---|---|---|
| Transporte | `src/worker.ts` | Fetch, scheduled, assets y headers de respuesta |
| Routing HTTP | `src/cloudflare/cloudflare-router.ts` | Frontera /api, sesión, same-origin y composición de handlers |
| Adaptadores HTTP/API | `src/cloudflare/*-routes.ts` | Contratos HTTP por dominio |
| Persistencia | `src/cloudflare/d1.ts` y repositorios asociados | Acceso a D1 |
| Integración QvaPay | módulos de cliente/adaptación bajo `src/cloudflare/` | Comunicación server-side con QvaPay |
| Monitor durable | `src/cloudflare/arbitrage-monitor-do.ts` | Durable Object y alarmas |
| Lógica de monitor | `src/cloudflare/arbitrage-monitor.ts` | Ejecución de una iteración del monitor |
| Seguridad | `src/cloudflare/access.ts`, auth y error contracts | Sesiones, límites y errores públicos |

## Grafo de alto nivel

```text
Cloudflare Worker
└── src/worker.ts
    ├── src/cloudflare/cloudflare-router.ts
    │   ├── auth
    │   ├── market
    │   ├── operations
    │   ├── finance
    │   ├── account
    │   ├── arbitrage
    │   ├── history
    │   ├── diagnostics
    │   ├── AI Auditor
    │   └── Auto-Apply (fail-closed)
    └── src/cloudflare/arbitrage-monitor-do.ts
        └── src/cloudflare/arbitrage-monitor.ts
            └── D1 / QvaPay
```

El frontend estático se sirve mediante el binding `ASSETS`; no constituye un segundo runtime de backend.

## Regla de arquitectura

Las nuevas capacidades Cloudflare deben incorporarse a la frontera existente. No se debe crear otra implementación de Worker, router, scheduler, cliente QvaPay, repositorio o executor con una responsabilidad equivalente.

Si una migración histórica requiere conservar código no utilizado, debe clasificarse explícitamente como histórico y quedar fuera del grafo productivo; no debe mantenerse como una segunda fuente de verdad.

## Verificación automatizada

CI ejecuta `scripts/check-cloudflare-architecture.mjs`. El control verifica:

1. que Wrangler declara exactamente `src/worker.ts` como `main`;
2. que los entrypoints históricos conocidos no existen;
3. que no existe el árbol `src/backend/cloudflare/`;
4. que el entrypoint productivo importa la implementación desde `src/cloudflare/`;
5. que la clase `ArbitrageMonitor` es la misma clase declarada por Wrangler.

Este control convierte el hallazgo de #122 en una regresión verificable.
