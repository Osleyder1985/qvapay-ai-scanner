# Auditoría integral del sistema — 2026-09

## Propósito
Establecer una línea base de saneamiento técnico, documental, de seguridad y de ingeniería antes de continuar ampliando inteligencia, automatización o capacidades financieras.

## Alcance
- arquitectura y documentación;
- requisitos y trazabilidad;
- código TypeScript y frontend;
- pruebas;
- seguridad;
- integración con QvaPay;
- límites de consulta y resiliencia;
- operaciones y finanzas;
- Git/GitHub;
- CI/CD y reproducibilidad;
- calidad, riesgos y cumplimiento.

## Hallazgos críticos

### C-01 — Frontera de seguridad del dashboard
El backend expone rutas con efectos financieros/operativos. La aplicación no debe considerarse segura para exposición remota mientras no exista autenticación y autorización a nivel de aplicación, o una garantía verificable de ejecución exclusivamente local.

**Acción:** definir y aplicar una frontera de confianza explícita antes de cualquier despliegue LAN/Internet.

### C-02 — Consumo distribuido de la API de QvaPay
Mercado, inteligencia, historial, Auto-Apply, cuenta, operaciones y finanzas pueden originar consultas independientes. Esto dificulta respetar el límite de consultas y provoca duplicación de lecturas.

**Acción:** introducir un servicio central de snapshots de mercado con caché, deduplicación, scheduler y backoff.

### C-03 — Contabilidad financiera incompleta
La contabilidad inicial sirve como modelo operativo, pero requiere conciliación completa, paginación histórica y tratamiento explícito de comisiones de QvaPay.

**Acción:** diseñar ledger y reconciliación basados en operaciones completadas y datos verificables de QvaPay.

## Hallazgos altos
- H-01: arquitectura principal desactualizada.
- H-02: requisitos y trazabilidad insuficientemente formalizados.
- H-03: ausencia de integración/E2E.
- H-04: ausencia de CI/CD.
- H-05: ausencia de lockfile reproducible.
- H-06: falta de contrato OpenAPI.
- H-07: documentación JSDoc y encabezados de archivo no sistemáticos.
- H-08: frontend con demasiadas responsabilidades concentradas.
- H-09: centro de operaciones limitado en histórico/paginación.
- H-10: falta de threat model y registro formal de riesgos.

## Criterio de saneamiento
No se considerará cerrada esta fase hasta que los riesgos críticos estén controlados, exista trazabilidad mínima entre requisitos, arquitectura, código y pruebas, y el sistema pueda verificarse reproduciblemente.

## Marco de referencia
Se utilizarán, según corresponda, ISO/IEC/IEEE 12207, ISO/IEC/IEEE 29148, ISO/IEC/IEEE 42010, ISO/IEC/IEEE 15289, ISO/IEC 25010, ISO/IEC 25040, ISO/IEC 27001, ISO/IEC 27002, ISO 31000, OWASP Top 10 y NIST SSDF.

Estas referencias no implican conformidad ni certificación.