# Cloudflare Worker Auto-Apply runtime

## Composición

El runtime conecta las capas en una sola dirección:

\`Worker scheduled event -> runtime composition -> scheduler -> executor -> D1/QvaPay\`

La composición no contiene reglas de mercado. El executor sigue siendo responsable de la ejecución única, lease, límites, idempotencia y registro durable.

## Kill switch

La variable \`AUTO_APPLY_RUNTIME_ENABLED\` debe contener exactamente \`true\` (sin importar mayúsculas/minúsculas) para construir el executor desde un scheduled event. Si está ausente o tiene cualquier otro valor, el handler termina sin crear cliente QvaPay ni ejecutar D1.

Esto es una barrera adicional de seguridad. La configuración durable \`auto_apply_config.enabled\` sigue siendo la autoridad funcional de Auto-Apply.

## Secrets

Estas variables pertenecen exclusivamente al Worker:

- \`QVAPAY_APP_ID\`
- \`QVAPAY_APP_SECRET\`
- \`QVAPAY_BASE_URL\` (opcional; por defecto \`https://api.qvapay.com\`)

Las credenciales no se devuelven mediante las rutas HTTP del dashboard y no deben almacenarse en el repositorio.

## Estado de migración

Este cambio **no** configura \`[triggers]\`/Cron en \`wrangler.toml\`, no crea un binding D1 productivo y no despliega el Worker. La activación real requiere primero validar D1, Secrets, aceptación runtime y el procedimiento de rollback.
