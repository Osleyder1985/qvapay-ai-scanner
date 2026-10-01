# Cloudflare local runtime smoke gate

Este documento define el smoke automático del runtime local de Cloudflare ejecutado por GitHub Actions.

## Propósito

Validar la composición real del Worker mediante Wrangler antes de considerar verde el quality gate.

## Cobertura

El smoke levanta `src/worker.ts` con `wrangler dev --local` y verifica health, assets, redirección sin sesión, protección API, autenticación, sesión D1, dashboard, lectura P2P, logout, invalidación de sesión y cabeceras HTTP/CSP.

Las credenciales usadas por la prueba son efímeras y se generan durante la ejecución. No se almacenan en el repositorio.

## Ejecución CI

El job `cloudflare-runtime-smoke` depende de `quality`. Un fallo del smoke hace fallar el workflow.

## Límite

Este gate valida el runtime local compatible con Cloudflare. No sustituye el smoke contra el despliegue real de producción.
