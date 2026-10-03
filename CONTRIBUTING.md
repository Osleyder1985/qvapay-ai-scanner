# Contributing

## Convenciones

Los nombres técnicos del repositorio se escriben en inglés: archivos, directorios, ramas, commits, Issues y Pull Requests.

El contenido descriptivo debe estar en español; los comentarios explicativos y JSDoc del código mantenido siguen la misma convención, salvo identificadores, nombres propios y nomenclatura normativa de APIs externas.

## Flujo

1. Crear o seleccionar un Issue.
2. Para cambios del runtime o del producto desplegado, partir de `production/cloudflare`.
3. Crear una rama de trabajo con nombre descriptivo en inglés.
4. Implementar un cambio pequeño y trazable.
5. Ejecutar las verificaciones aplicables.
6. Crear un Pull Request contra `production/cloudflare` cuando el cambio afecte al runtime productivo.
7. Revisar evidencia y mantener trazabilidad.
8. No usar `main` como baseline del runtime Cloudflare; esa rama permanece histórica durante la migración de gobernanza.

## Seguridad

Nunca incluir credenciales, tokens, secretos, claves privadas o información sensible en commits.