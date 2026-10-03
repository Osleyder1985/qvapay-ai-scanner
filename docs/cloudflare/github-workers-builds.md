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
   `npx wrangler d1 migrations apply qvapay-ai-scanner --remote && npx wrangler deploy`

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

### Evidencia verificada

- [x] El Worker tiene un entrypoint Cloudflare válido y el runtime local smoke gate pasa en CI.
- [x] La configuración del repositorio declara el binding D1 `DB` y los assets `ASSETS`.
- [x] Los nombres de secrets requeridos están declarados sin valores en Git.
- [x] Existe un workflow de verificación que correlaciona GitHub SHA → Cloudflare Workers Build → Version ID activo.
- [x] El último despliegue cuya evidencia está registrada en el repositorio puede auditarse mediante sus artefactos de deployment.

### Pendiente de verificación en Cloudflare

- [ ] Un build automático exitoso posterior al merge más reciente de `production/cloudflare`.
- [ ] El deployment activo actual corresponde al SHA actual de `production/cloudflare`.
- [ ] La versión activa al 100% coincide con el Version ID reportado por Workers Build para ese SHA.
- [ ] La evidencia del deployment actual está retenida como artefacto de GitHub Actions.
- [ ] El estado actual de Workers Builds, secrets, D1 y Access ha sido comprobado directamente en Cloudflare.

**Regla de auditoría:** no se considera verificado un deployment actual por el mero hecho de que exista la integración de Workers Builds. La aceptación requiere evidencia del SHA, build exitoso, Version ID y deployment activo.

## Seguridad

- Los secretos QvaPay no se almacenan en `wrangler.jsonc`, GitHub, el frontend ni los assets estáticos.
- `secrets.required` declara los nombres sin valores.
- El Worker de producción debe estar protegido mediante Cloudflare Access; la política de Access define quién puede acceder al dashboard.
- El Worker aplica además una frontera fail-closed con `ctx.access` y exige `same-origin` para mutaciones.
- `/api/health` es el único endpoint API definido como público; si se necesita que siga accesible sin login, debe existir un bypass de Access limitado exactamente a esa ruta.
- Auto-Apply permanece deshabilitado hasta completar su aceptación funcional y sus controles de concurrencia, límites y reconciliación.
- La configuración de Workers Builds y los secrets son recursos de cuenta Cloudflare; su estado debe verificarse desde Cloudflare antes de declarar automatización CI/CD completamente aceptada.

## Seguridad de acceso

La autenticación pública del dashboard se implementa mediante Cloudflare Access y no mediante un token estático enviado por el frontend.

Configuración requerida en Cloudflare:

- Access → `qvapay-ai-scanner` → **Protect this Worker behind Access**.
- Traffic scope: **All traffic**.
- Política **Allow** limitada al usuario o grupo autorizado.
- Bypass opcional y estrecho para `/api/health`.

El detalle del modelo se documenta en `docs/cloudflare/access-boundary.md`.

## Fuentes oficiales

- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
