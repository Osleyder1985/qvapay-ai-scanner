# Validación real de QvaPay

## Objetivo

Cerrar el checkpoint #13 con evidencia observable contra la API real de QvaPay, sin confundir pruebas con mocks con aceptación real.

## Prerrequisitos

- Node.js >= 20.
- Una App de QvaPay con `app-id` y `app-secret`.
- Los permisos P2P necesarios para el tipo de operación.
- Una oferta controlada para la prueba real.
- Auto-Apply desactivado durante la validación inicial.

QvaPay documenta `https://api.qvapay.com` como base, autenticación mediante `app-id` + `app-secret`, `GET /p2p` para el mercado y `POST /p2p/:uuid/apply` para aplicar a una oferta.

## 1. Credenciales y mercado

En Git Bash:

    export QVAPAY_APP_ID="..."
    export QVAPAY_APP_SECRET="..."
    node scripts/validate-qvapay-real.mjs

El script ejecuta primero `POST /v2/info` y después `GET /p2p?take=10&page=1`. No imprime el secreto.

Registrar HTTP status, latencia, cantidad de ofertas y los campos no sensibles observados.

## 2. Aplicación controlada

El modo de mutación está bloqueado por defecto. Para ejecutarlo deben existir ambas condiciones:

    export ALLOW_REAL_MUTATION=YES
    node scripts/validate-qvapay-real.mjs --apply "<UUID>"

Antes de aplicar, verificar manualmente que la oferta sea válida, no sea propia, esté disponible y corresponda al permiso P2P habilitado para la App.

El script registra la oferta antes de aplicar, la respuesta de `apply` y la oferta después. Nunca imprime `app-secret`.

QvaPay documenta actualmente un límite de 2 aplicaciones cada 60 segundos para `apply`; no generar tráfico artificial para provocar un 429.

## 3. Seguimiento

Después de una aplicación real, comprobar en el dashboard local:

    GET /api/operations
    GET /api/p2p/<uuid>

Registrar detección, estado, rol, persistencia en `operations-ledger.json`, `recordedAt`, `lastSeenAt` y reconciliación.

Reiniciar el dashboard y repetir la lectura para demostrar recuperación.

## 4. Histórico

Comprobar:

    GET /api/history
    GET /api/trends
    GET /api/baselines

Relacionar los resultados con las ofertas observadas y registrar la cobertura temporal.

## 5. Criterio de cierre

Issue #13 solo debe cerrarse cuando cada punto pendiente tenga evidencia identificable. Build/tests con mocks demuestran ingeniería local, pero no sustituyen la aceptación contra QvaPay real.

## Seguridad

Nunca guardar `QVAPAY_APP_SECRET`, tokens, cookies ni cabeceras completas de autenticación en `evidence/`. Las pruebas con mocks deben seguir identificadas como pruebas con mocks.