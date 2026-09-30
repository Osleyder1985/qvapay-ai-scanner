# Auto-Apply execution lease

## Propósito

`auto_apply_execution_lease` proporciona exclusión mutua durable para una ejecución Cloudflare de Auto-Apply.

## Semántica

- Es una fila singleton (`id = 1`).
- `owner_id` identifica una ejecución, no un usuario.
- `expires_at` permite recuperar una ejecución cuyo Worker terminó inesperadamente.
- El claim se realiza mediante un `UPDATE` condicionado por ausencia de propietario o expiración.
- La liberación está condicionada al mismo `owner_id`.

## Por qué no basta `auto_apply_applied_offers`

La tabla de ofertas aplicadas protege una oferta concreta después de una aplicación, pero no evita que dos ejecuciones simultáneas hagan todo el trabajo previo y alcancen QvaPay al mismo tiempo.

El lease reduce esa ventana de concurrencia. La idempotencia por oferta continúa siendo obligatoria porque D1 y QvaPay son sistemas separados y una mutación remota no puede deshacerse con un rollback local.

## Recuperación

Si un Worker desaparece después de adquirir el lease, una ejecución posterior puede reclamarlo cuando `expires_at <= now`.

El TTL debe ser mayor que la duración esperada de una iteración completa y revisarse con métricas reales antes de activar automatización.

## Estado de migración

Esta etapa sólo añade el mecanismo de exclusión. No configura Cron/Workflows y no realiza `POST /p2p/:uuid/apply` desde Cloudflare.