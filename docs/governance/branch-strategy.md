# Estrategia de ramas y fuente de verdad

**Revisión:** 2026-10-03

## Decisión de gobernanza

La única fuente de verdad de producción es `production/cloudflare`.

`production/cloudflare` es la rama de integración de producción y la única rama desde la que el workflow CI puede ejecutar el despliegue del Worker a Cloudflare. El repositorio debe usar `production/cloudflare` como rama por defecto de GitHub para que la navegación, los PR nuevos y la revisión humana comiencen desde la misma baseline que se despliega.

Mientras GitHub conserve temporalmente `main` como rama por defecto, `main` se considera **legacy**: no es fuente de despliegue, no debe recibir cambios productivos independientes y no debe utilizarse como baseline para trabajo del runtime Cloudflare.

## Fuentes de verdad

- `production/cloudflare`: fuente única de verdad del Worker productivo y rama objetivo para el desarrollo integrado.
- `main`: rama histórica en proceso de retiro como integración; cualquier commit posterior al punto de divergencia debe evaluarse individualmente y promoverse mediante PR, no mediante una fusión masiva.
- `feature/fix/docs/chore/security/*`: ramas de trabajo temporales; deben partir de la baseline que vayan a modificar y terminar en un PR contra `production/cloudflare` cuando afecten al runtime productivo.
- `release/*`: no se utiliza mientras no exista una necesidad de release independiente.

## Promoción a producción

1. El cambio se desarrolla en una rama de trabajo creada desde `production/cloudflare`.
2. Se abre un PR contra `production/cloudflare`.
3. CI Quality, Cloudflare runtime smoke y Security deben quedar verdes.
4. El merge a `production/cloudflare` activa el despliegue Wrangler autenticado.
5. El workflow verifica una nueva versión Cloudflare única al 100% y conserva evidencia del despliegue.
6. Ninguna rama distinta de `production/cloudflare` puede activar el job `production-deploy`.
7. `main` no debe recibir cambios productivos independientes que no hayan sido promovidos a `production/cloudflare`.

## Migración de `main`

La divergencia existente no se resuelve con un merge masivo. En la fecha de esta revisión:

- `production/cloudflare` está **1052 commits por delante** de `main`.
- `main` está **9 commits por delante** de `production/cloudflare`.
- El punto común es `d69856b38f40bf26347c39efb24c401c07a4d6ef`.

Los 9 commits exclusivos de `main` se revisan como cambios independientes antes de decidir su promoción. Entre ellos existen cambios del workflow de AI Auditor y correcciones de CI; no se debe asumir que todo el historial de `main` es automáticamente compatible con producción.

La migración segura consiste en:
1. congelar `main` como línea productiva;
2. evaluar los commits exclusivos de `main`;
3. promover sólo los cambios válidos mediante PRs trazables a `production/cloudflare`;
4. cambiar la rama por defecto de GitHub a `production/cloudflare`;
5. mantener `main` como rama histórica hasta que pueda eliminarse sin perder trazabilidad;
6. eliminar `main` sólo mediante una operación administrativa explícita después de verificar que no quedan referencias operativas.

## Reglas de prevención

- Todo workflow que despliegue Cloudflare debe estar condicionado explícitamente a `refs/heads/production/cloudflare`.
- La documentación no puede presentar `main` como fuente de producción.
- Los PR de cambios productivos deben tener `production/cloudflare` como baseline.
- Cualquier cambio que altere la rama de despliegue debe actualizar esta política, README y el workflow CI en el mismo PR.
- Una futura migración de la rama de producción requiere cambiar conjuntamente la documentación, el workflow y la protección de ramas.

## Revisión

La revisión periódica debe registrar:
- ramas activas con Issue/PR;
- ramas históricas/superseded;
- ramas temporales pendientes de eliminación;
- excepciones justificadas;
- divergencia entre ramas de integración.

La eliminación física de ramas y el cambio de rama por defecto son operaciones administrativas de GitHub y deben realizarse con permisos de administración del repositorio.