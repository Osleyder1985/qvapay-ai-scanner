# Cloudflare Auto-Apply scheduler

El scheduler Cloudflare es deliberadamente una capa fina:

`scheduled event -> runScheduledAutoApply -> executor.executeOnce()`

No contiene reglas de mercado, límites, idempotencia ni llamadas directas a QvaPay.

## Estado de migración

La función de scheduled handler ya está aislada para poder conectarse al Worker cuando existan:

- D1 productivo;
- Secrets de QvaPay;
- configuración inicial de Auto-Apply;
- pruebas de aceptación del runtime;
- decisión explícita de activar Cron.

**El cron de producción no se activa en este cambio.**

## Seguridad

El scheduler no recibe ni expone credenciales. La creación del cliente QvaPay y la lectura de Secrets pertenecen a la futura composición del Worker.

No debe ejecutarse Auto-Apply real desde el frontend.
