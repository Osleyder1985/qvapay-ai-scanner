# Estrategia de ramas y fuente de verdad

**Revisión:** 2026-10-03

## Fuentes de verdad

- main: rama por defecto histórica del repositorio. No es la fuente de despliegue de Cloudflare.
- production/cloudflare: rama de producción y fuente de verdad del Worker actualmente desplegado.
- feature/fix/docs/chore/security/*: ramas de trabajo temporales; deben partir de la baseline que vayan a modificar y terminar en un PR.
- release/*: no se utiliza mientras no exista una necesidad de release independiente.

## Promoción a producción

1. El cambio se desarrolla en una rama de trabajo.
2. Se abre un PR contra production/cloudflare cuando el cambio pertenece al runtime productivo.
3. CI Quality, Cloudflare runtime smoke y Security deben quedar verdes.
4. El merge a production/cloudflare activa el despliegue Wrangler autenticado.
5. El workflow verifica una nueva versión Cloudflare única al 100% y conserva evidencia del despliegue.
6. main no debe recibir cambios productivos independientes que no hayan sido promovidos a production/cloudflare.

## Regla de divergencia

No se debe iniciar trabajo productivo nuevo desde main si production/cloudflare contiene la baseline activa. La divergencia actual entre ambas ramas es una deuda de gobernanza pendiente de resolución mediante una decisión explícita sobre la rama por defecto.

## Revisión

Cualquier cambio que altere la rama de despliegue debe actualizar esta política, README y el workflow CI en el mismo PR.
