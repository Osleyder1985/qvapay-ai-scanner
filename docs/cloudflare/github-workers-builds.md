# Integración GitHub ↔ Cloudflare Workers Builds

## Objetivo

Conectar el Worker `qvapay-ai-scanner` con GitHub mediante **Cloudflare Workers Builds**, de forma que Cloudflare construya y despliegue automáticamente los cambios de la rama `production/cloudflare`.

La integración debe conservar `main` como rama de desarrollo/base y utilizar `production/cloudflare` como rama de producción de Cloudflare.

## Estado de la configuración del repositorio

La rama `production/cloudflare` ya contiene:

- `wrangler.toml` con `name = "qvapay-ai-scanner"`.
- Entry point `src/worker/index.ts`.
- Assets en `dist`.
- D1 binding `DB`.
- D1 database ID productivo `839d0bc1-6f86-49ff-939a-91dc238783aa`.
- Wrangler `4.145.0` fijado mediante `package.json`/lockfile.
- `AUTO_APPLY_RUNTIME_ENABLED = "false"`.
- Nombres de secretos declarados sin valores:
  - `QVAPAY_APP_ID`
  - `QVAPAY_APP_SECRET`
  - `DASHBOARD_API_TOKEN`

No se almacenan credenciales de Cloudflare ni credenciales QvaPay en Git.

## Configuración requerida en Cloudflare

En el Worker **qvapay-ai-scanner**:

1. Abrir **Settings → Builds**.
2. Conectar GitHub mediante la **Cloudflare Workers & Pages GitHub App**.
3. Seleccionar:
   - Repository: `Osleyder1985/qvapay-ai-scanner`
   - Production branch: `production/cloudflare`
   - Root directory: raíz del repositorio
4. Configurar el build command:
   `npm run build`
5. Configurar el deploy command:
   `npx wrangler deploy`
6. Mantener los builds de ramas no productivas habilitados sólo si se desea usar previews.
7. Configurar los secretos de runtime exclusivamente en Cloudflare.

## Flujo esperado

```
GitHub
  │
  │ push/merge a production/cloudflare
  ▼
Cloudflare Workers Builds
  │
  ├── npm run build
  │
  └── npx wrangler deploy
          │
          ▼
  Cloudflare Worker
          │
          ├── Static Assets
          └── D1
```

Para una rama distinta de `production/cloudflare`, Cloudflare puede ejecutar builds de preview si esa función está habilitada. Los previews no deben recibir automáticamente la configuración de producción de Auto-Apply.

## Seguridad

- Los secretos QvaPay nunca deben entrar en `wrangler.toml`, GitHub, el frontend o los assets estáticos.
- `AUTO_APPLY_RUNTIME_ENABLED` permanece en `false` hasta completar la aceptación real de QvaPay.
- La integración GitHub → Cloudflare no sustituye los controles de autorización del dashboard.
- La conexión de Workers Builds y la configuración de secretos son operaciones de cuenta Cloudflare; su estado debe verificarse desde Cloudflare antes de declarar la producción desplegada.

## Criterios de aceptación

- [ ] Worker Cloudflare conectado al repositorio correcto.
- [ ] Rama de producción = `production/cloudflare`.
- [ ] Build command = `npm run build`.
- [ ] Deploy command = `npx wrangler deploy`.
- [ ] Primer build exitoso.
- [ ] Deployment activo corresponde al commit de `production/cloudflare`.
- [ ] D1 binding `DB` resuelve el recurso productivo.
- [ ] Secretos configurados sólo en Cloudflare.
- [ ] `/api/health` responde correctamente.
- [ ] `/api/cloudflare/d1/health` confirma D1.
- [ ] Endpoints autenticados rechazan solicitudes sin token.
- [ ] No hay exposición de credenciales.
- [ ] Auto-Apply continúa deshabilitado.
- [ ] Issue #13 y master audit #39 permanecen abiertos hasta completar aceptación real.

## Evidencia externa

Cloudflare documenta que Workers Builds puede conectar un Worker existente a GitHub, seleccionar una rama de producción y ejecutar automáticamente un build y deployment en cada push. También publica el estado de los builds mediante GitHub check runs y comentarios de Pull Request.

Fuentes oficiales:

- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
