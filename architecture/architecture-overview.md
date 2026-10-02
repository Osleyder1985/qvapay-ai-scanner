# Descripción de arquitectura

## Estado

La arquitectura Cloudflare de producción ya está implementada para el Worker, persistencia D1 y monitor server-side de arbitraje. La documentación de arquitectura debe distinguir esta baseline desplegada de capacidades futuras todavía no activadas.

## Runtime de producción

El runtime principal es un Cloudflare Worker con:

- frontend estático servido mediante el binding ASSETS;
- rutas HTTP para salud, mercado, arbitraje, monitor y datos persistidos;
- binding D1 para persistencia;
- Durable Object ArbitrageMonitor para monitorización persistente;
- Durable Object Alarm para ciclos de aproximadamente 10 segundos;
- Cron Trigger de un minuto únicamente para garantizar el bootstrap del monitor;
- secrets de QvaPay fuera del repositorio.

## Arbitraje

El monitor server-side ejecuta el análisis sin depender de una pestaña o dispositivo del usuario.

Flujo:

Worker / bootstrap → ArbitrageMonitor → consulta QvaPay → normalización y simulación → D1 → frontend.

El monitor es read-only. No ejecuta apply, paid, received, cancel ni creación de órdenes.

La configuración activa por defecto es 24/7, moneda BANK_CUP y margen mínimo 5%. La configuración de horarios está preparada en D1 pero todavía no se expone públicamente.

## Persistencia

D1 mantiene la fuente de verdad del runtime Cloudflare. Las migraciones se versionan y no se editan después de aplicadas.

La migración 0006_arbitrage_monitor.sql añade las tablas singleton de configuración y estado del monitor.

## Frontend

El frontend no realiza polling directo de QvaPay para conducir el escaneo. Consume el snapshot persistido del monitor y utiliza un contador visual 10 → 0 para representar el próximo ciclo.

## Seguridad

Las credenciales de QvaPay se proporcionan mediante secrets. El monitor de arbitraje no realiza mutaciones financieras.

## Evolución

Las futuras capacidades de ejecución financiera requieren revalidación, idempotencia, conciliación, control de riesgo y autorización explícita. No deben inferirse de la existencia del monitor actual.
