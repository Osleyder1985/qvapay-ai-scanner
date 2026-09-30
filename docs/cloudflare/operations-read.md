# Lectura de operaciones en Cloudflare Worker

## Objetivo

Esta fase conecta el Worker con el repositorio D1 existente y migra **una lectura real** del dominio de operaciones. No reemplaza todavía `GET /api/operations` del runtime Node ni ejecuta mutaciones contra QvaPay.

La ruta migrada es:

`GET /api/cloudflare/d1/operations?limit=100`

## Seguridad de la fase

La ruta exige:

`Authorization: Bearer <DASHBOARD_API_TOKEN>`

El token debe configurarse como secreto/binding del Worker antes de usar la ruta en un entorno accesible desde red pública. Si el token no está configurado, la ruta responde `401`.

Esto es deliberado: el runtime Node actual mantiene el dashboard en un límite local y la migración Cloudflare no debe convertir accidentalmente las operaciones financieras en un endpoint público sin autenticación.

`GET /api/health` y `GET /api/cloudflare/d1/health` permanecen disponibles para health checks.

## Persistencia

La ruta utiliza `D1Repository.listOperations()` y lee exclusivamente de D1. No consulta QvaPay, no escribe en D1 y no ejecuta `apply`, `paid`, `received`, `cancel`, `chat` ni `rate`.

Cuando existe `raw_json`, se reconstruye el objeto de operación original para preservar el contrato de datos del dashboard. Si el JSON no puede parsearse, se utiliza la proyección normalizada almacenada en D1.

## Compatibilidad

El endpoint migrado es una **ruta interna de transición**, no un reemplazo contractual del endpoint Node:

- Node: `GET /api/operations` sigue sincronizando desde QvaPay y reconciliando el ledger local.
- Cloudflare: `GET /api/cloudflare/d1/operations` lee el estado ya persistido en D1.
- La reconciliación remota, paginación contra QvaPay y escritura del ledger permanecen fuera de esta fase.

## Criterios de aceptación

- Worker compila con el toolchain actual del repositorio.
- Existe una prueba de `401` sin token.
- Existe una prueba de lectura autenticada desde D1.
- Existe una prueba del health check D1.
- No se agregan credenciales QvaPay al repositorio.
- No se modifica el runtime Node.
- No se ejecutan mutaciones remotas.
- #13 y #39 permanecen abiertos hasta la aceptación real de producción.
