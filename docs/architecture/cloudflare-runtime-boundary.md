# Cloudflare runtime boundary

## Propósito

Definir una única frontera de ejecución Cloudflare para QvaPay AI Scanner y evitar que una corrección pueda quedar aplicada en un entrypoint alternativo.

## Runtime productivo

El runtime productivo de la rama `production/cloudflare` es:

- **Entrypoint Wrangler:** `src/worker.ts`
- **Configuración:** `wrangler.jsonc`
- **Static Assets:** `src/frontend`
- **Persistencia durable:** D1 mediante el binding `DB`

`wrangler.jsonc` declara explícitamente:

```text
main = src/worker.ts
```

No existe otro entrypoint Worker operativo en la configuración actual.

## Eliminación de fronteras duplicadas

Se eliminaron los siguientes artefactos migratorios que no eran referenciados por Wrangler:

- `src/worker/index.ts`
- `src/worker/auto-apply-runtime.ts`

Ambos implementaban una segunda composición Cloudflare y podían crear una falsa superficie de producción.

El runtime programado de Auto-Apply no queda habilitado por esta limpieza. La configuración Wrangler actual no declara un trigger `[triggers]`/Cron, y la ejecución automática debe permanecer deshabilitada hasta la aceptación específica de seguridad y negocio.

## Capas arquitectónicas

La frontera Cloudflare debe seguir esta dirección:

```text
HTTP Request
    |
    v
src/worker.ts
    |
    +--> authentication / authorization
    |
    +--> application route handling
    |
    +--> QvaPay adapter calls
    |
    +--> domain calculations
    |
    +--> D1 persistence
    |
    v
HTTP Response
```

Las responsabilidades nuevas no deben crear otro entrypoint ni otra implementación paralela de las mismas operaciones.

## Regla de gobernanza

Toda nueva funcionalidad Cloudflare debe:

1. Integrarse desde `src/worker.ts` o desde un módulo importado por él.
2. Mantener una sola dirección de dependencia.
3. Tener propietario arquitectónico documentado.
4. Incorporar pruebas de la frontera correspondiente.
5. No crear un segundo Worker entrypoint sin una decisión arquitectónica explícita y documentada.

## Nota de migración

Los módulos históricos bajo `src/backend/cloudflare/` deben considerarse **candidatos a eliminación o reclasificación** hasta demostrar una referencia desde el grafo productivo. No se eliminan automáticamente en este issue porque algunos pueden contener lógica reutilizable o cobertura histórica que requiere una revisión de dependencias independiente.

## Estado de verificación

Se verificó que `wrangler.jsonc` apunta a `src/worker.ts` y que los dos entrypoints secundarios eliminados no forman parte de la configuración Wrangler actual.

La ejecución completa de `npm run quality` y la verificación de CI siguen siendo necesarias antes de cerrar el issue.
