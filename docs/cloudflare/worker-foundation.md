# Fundación del Worker Cloudflare

## Objetivo

Esta fase introduce únicamente la frontera de ejecución Cloudflare Worker y el
binding D1. El backend Node actual no se elimina ni se reemplaza.

## Rutas iniciales

- `GET /api/health`: verifica que el Worker esté ejecutándose.
- `GET /api/cloudflare/d1/health`: ejecuta `SELECT 1` contra D1 y verifica el binding.

## Configuración

`wrangler.toml` define:

- Worker `qvapay-ai-scanner`.
- entrypoint `src/worker/index.ts`.
- `nodejs_compat`.
- Static Assets con SPA fallback.
- binding D1 llamado `DB`.

El valor `REPLACE_WITH_PRODUCTION_D1_DATABASE_ID` es deliberadamente un
placeholder. El ID real debe configurarse fuera del repositorio antes del
despliegue.

## Seguridad

No se exponen credenciales QvaPay. Las credenciales de producción deberán
gestionarse como secrets/bindings de Cloudflare y nunca formar parte de
`wrangler.toml`.

## Estado

Esta fase no migra todavía:

- autenticación;
- endpoints P2P;
- AutoApply;
- operaciones;
- ledger financiero;
- scheduler;
- persistencia de producción.

Por tanto, no constituye aceptación de producción ni permite cerrar #13.
