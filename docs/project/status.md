# Estado del proyecto

## Baseline
**Septiembre de 2026 — saneamiento post-auditoría.**

El sistema ya contiene integración funcional con QvaPay, lectura P2P, aplicación controlada, seguimiento de operaciones, Auto-Apply con controles, historial, inteligencia determinista de mercado, tendencias, baselines, cuenta/finanzas y centro de operaciones.

## Fase actual
**Sanitation & Engineering Baseline**

El objetivo inmediato no es añadir nuevas capacidades de trading/IA. Es reducir deuda técnica y riesgos identificados por la auditoría.

## Orden de trabajo
1. Seguridad y frontera de despliegue.
2. Arquitectura y requisitos.
3. Collector/scheduler central de mercado.
4. Operaciones y reconciliación financiera.
5. Testing de integración/E2E.
6. CI/CD y reproducibilidad.
7. Documentación, JSDoc y encabezados.
8. Git/GitHub y release baseline.
9. Validación real de QvaPay.
10. Retomar inteligencia/IA/automatización avanzada.

## Regla de cambio
Cualquier nueva capacidad con efectos financieros requiere requisito, riesgo, decisión arquitectónica, prueba y criterio de rollback antes de fusionarse.