# Smoke test de autenticación Cloudflare

Este procedimiento valida de extremo a extremo la frontera de autenticación del Worker sin ejecutar mutaciones de QvaPay.

## Variables

Definir temporalmente en el entorno local:

- `SMOKE_BASE_URL`: URL del Worker desplegado.
- `AUTH_USERNAME`: usuario configurado como Worker Secret.
- `AUTH_PASSWORD`: contraseña configurada como Worker Secret.

No escribir estos valores en archivos versionados, logs persistentes ni commits.

## Ejecución

Desde la raíz del repositorio:

```bash
npm run smoke:cloudflare
```

El script comprueba, en este orden:

1. `GET /api/health` público.
2. `GET /api/p2p` sin sesión → `401`.
3. `POST /api/auth/login` same-origin.
4. Recepción de cookie `qvas_session`.
5. `GET /api/auth/session` autenticado.
6. `GET /api/p2p` autenticado y contrato `data[]`.
7. `POST /api/auth/logout`.
8. Invalidación de la sesión → `401`.

No se invocan `apply`, `paid`, `received`, `cancel`, `chat` ni `rate`.

## Limitación

Este smoke test demuestra la ruta HTTP completa y el comportamiento de sesión, pero no sustituye la validación funcional de negocio del issue #13 ni una revisión independiente de Cloudflare D1.
