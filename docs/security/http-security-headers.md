# Política de cabeceras HTTP de seguridad

## Alcance

La política se aplica en la frontera única de ejecución de Cloudflare Worker y cubre:

- respuestas JSON de la API;
- assets estáticos servidos por el binding `ASSETS`;
- `/login` y la redirección hacia login;
- respuestas de error producidas por las rutas API.

## Política vigente

| Cabecera | Política | Propósito |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Evita MIME sniffing. |
| `X-Frame-Options` | `DENY` | Impide que la aplicación sea embebida en frames. |
| `Content-Security-Policy` | `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https://api.qvapay.com` | Restringe orígenes de contenido y conexiones del navegador. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limita información de referencia entre orígenes. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | Deshabilita capacidades del navegador que la aplicación no necesita. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Fuerza HTTPS en clientes compatibles. |

## Excepciones justificadas

La CSP mantiene `'unsafe-inline'` para `script-src` y `style-src` porque `login.html` contiene actualmente JavaScript y CSS inline. No se concede `unsafe-eval`.

Google Fonts requiere:

- `https://fonts.googleapis.com` para hojas de estilo;
- `https://fonts.gstatic.com` para fuentes.

La aplicación necesita `https://api.qvapay.com` en `connect-src` porque el navegador realiza conexiones API mediante el mismo frontend/Worker y la política conserva explícitamente ese origen como dependencia permitida.

No se permiten objetos embebidos ni framing de terceros.

## Punto de aplicación

`src/cloudflare/cloudflare-router.ts` incorpora las cabeceras a las respuestas JSON.

`src/worker.ts` aplica la misma política al resultado final del Worker, incluyendo assets, login y redirecciones. Esto evita depender exclusivamente de configuración estática de assets.

## Verificación

La prueba unitaria `src/tests/security-headers.test.ts` verifica la política declarada.

El smoke test `scripts/cloudflare-auth-smoke.mjs` verifica las mismas cabeceras durante un recorrido real de:

1. health;
2. API privada sin sesión;
3. login;
4. sesión autenticada;
5. lectura P2P autenticada;
6. logout;
7. sesión posterior al logout.

Para ejecutarlo contra una instancia desplegada, proporcionar `SMOKE_BASE_URL`, `AUTH_USERNAME` y `AUTH_PASSWORD` sólo mediante variables de entorno; nunca almacenarlos en el repositorio.
