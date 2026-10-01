# Integración GitHub ↔ Cloudflare Workers Builds

## Objetivo

Conectar el Worker `qvapay-ai-scanner` con GitHub mediante Cloudflare Workers Builds, de forma que Cloudflare construya y despliegue los cambios de la rama `production/cloudflare`.

La rama `production/cloudflare` es la rama de producción del Worker. La configuración efectiva del Worker está definida por `wrangler.jsonc`.

## Estado del repositorio

La rama de producción contiene:

- configuración Wrangler en `wrangler.jsonc`;
- entry point del Worker en `src/worker.ts`;
- frontend estático en `src/frontend`;
- binding D1 `DB`;
- binding de assets `ASSETS`;
- D1 productivo `qvapay-ai-scanner`;
- migraciones versionadas en `migrations/`;
- observabilidad habilitada en Wrangler.

No se utiliza `wrangler.toml`.

## Secretos

El Worker requiere:

- `QVAPAY_APP_ID`
- `QVAPAY_APP_SECRET`

Los nombres están declarados en `wrangler.jsonc` mediante `secrets.required`. Los valores sólo deben configurarse como secrets de Cloudflare o mediante los mecanismos locales de desarrollo de Wrangler; nunca deben entrar en Git.

No se debe usar una variable `vars` de Wrangler para almacenar estas credenciales.

## Configuración de Workers Builds

En el Worker `qvapay-ai-scanner`:

1. Abrir **Settings → Builds**.
2. Conectar el repositorio `Osleyder1985/qvapay-ai-scanner`.
3. Seleccionar la rama de producción `production/cloudflare`.
4. Usar como directorio raíz la raíz del repositorio.
5. Build command:
   `npm run build`
6. Deploy command:
   `npx wrangler deploy`

Workers Builds ejecuta el build y posteriormente el deploy para los commits de la rama de producción.

## Flujo esperado

```text
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
          ├── Static Assets (src/frontend)
          └── D1 (binding DB)
```

## Producción y previews

La rama `production/cloudflare` debe producir el deployment activo de producción.

Las ramas no productivas sólo deben utilizar previews si están explícitamente habilitadas en Cloudflare. Los previews no deben recibir automáticamente los secretos de producción ni habilitar Auto-Apply.

## Estado de aceptación

### Verificado

- [x] Worker desplegado y accesible mediante `workers.dev`.
- [x] Frontend servido por el Worker.
- [x] D1 binding `DB` configurado.
- [x] Migraciones D1 `0001`, `0002` y `0003` aplicadas en producción.
- [x] Secrets `QVAPAY_APP_ID` y `QVAPAY_APP_SECRET` configurados en producción.
- [x] El dashboard obtiene datos P2P reales desde QvaPay mediante el Worker.
- [x] Auto-Apply continúa deshabilitado.

### Pendiente de verificación en Cloudflare

- [ ] Workers Builds conectado al repositorio correcto.
- [ ] Rama de producción de Workers Builds = `production/cloudflare`.
- [ ] Build command = `npm run build`.
- [ ] Deploy command = `npx wrangler deploy`.
- [ ] Un build automático exitoso después de un push/merge a producción.
- [ ] El deployment automático corresponde al commit de `production/cloudflare`.

## Seguridad

- Los secretos QvaPay no se almacenan en `wrangler.jsonc`, GitHub, el frontend ni los assets estáticos.
- `secrets.required` declara los nombres sin valores.
- Auto-Apply permanece deshabilitado hasta completar su aceptación funcional y sus controles de concurrencia, límites y reconciliación.
- La configuración de Workers Builds y los secrets son recursos de cuenta Cloudflare; su estado debe verificarse desde Cloudflare antes de declarar automatización CI/CD completamente aceptada.

## Fuentes oficiales

- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
