# Acta del proyecto

## Propósito

Definir el propósito, alcance, objetivos y criterios generales del proyecto QvaPay AI Scanner.

## Alcance actual

El proyecto cubre:

- integración con las capacidades oficialmente disponibles de QvaPay;
- lectura y análisis del mercado P2P;
- persistencia de estado operacional en Cloudflare D1;
- monitorización persistente mediante Cloudflare Durable Objects;
- simulación de arbitraje en modo solo lectura;
- análisis histórico y métricas descriptivas;
- automatización únicamente cuando exista evidencia técnica, económica y operativa suficiente.

## Fuera de alcance actual

El monitor de arbitraje no ejecuta compras, ventas, aplicaciones ni otras operaciones financieras. La interfaz de arbitraje es informativa y el cálculo de beneficio es una proyección bruta basada en el escenario configurado.

La programación de horarios personalizados del monitor está preparada en el modelo de configuración, pero todavía no constituye una capacidad completa de configuración en la interfaz.

## Estado

**Activo — baseline Cloudflare desplegada y verificada.**

La implementación de producción actual utiliza Cloudflare Worker, Durable Object y D1. Los cambios relevantes deben mantener trazabilidad entre requisito, decisión, implementación, verificación y documentación.

## Criterios generales

- Evidencia antes de asumir capacidades o resultados económicos.
- Protección de credenciales desde el diseño.
- Separación estricta entre análisis/simulación y ejecución financiera.
- Aislamiento por moneda en los análisis de mercado y arbitraje.
- Cambios reproducibles y verificables.
- No declarar conformidad o certificación ISO sin una evaluación formal.
