# Objetivos medibles de calidad

**Revisión:** 2026-10-03  
**Propietario:** Engineering  
**Nota:** estos objetivos son controles internos alineados con un modelo de calidad; no constituyen certificación ISO.

| Atributo | Objetivo | Métrica | Método | Umbral | Evidencia | Entorno | Responsable | Estado |
|---|---|---|---|---|---|---|---|---|
| Adecuación funcional | Mantener contratos implementados y trazables | Tests de contrato pasantes | npm test | 100% de tests pasantes | CI Quality | CI | Engineering | Activo |
| Eficiencia de desempeño | Evitar polling de mercado por encima de política | Intervalo mínimo entre requests | tests del colector + revisión | >= 2.6 s para mercado | tests + docs | CI | Engineering | Activo |
| Compatibilidad | Mantener runtime soportado | Node major | CI support contract | Node >=22 | CI | CI | Engineering | Activo |
| Interacción | Evitar controles UI que el backend no soporta | Acciones UI sin endpoint funcional | revisión + tests/smoke | 0 | frontend + smoke | CI/prod | Engineering | Activo |
| Fiabilidad | No aceptar payloads externos incompatibles | Contratos upstream inválidos aceptados | tests de contrato | 0 casos | tests QvaPay | CI | Engineering | Activo |
| Seguridad | Bloquear acceso privado sin sesión | Requests privados sin sesión aceptados | smoke | 0 | cloudflare-auth-smoke | producción | Engineering | Activo |
| Seguridad | Bloquear mutaciones cross-origin | Mutaciones con Origin incorrecto aceptadas | tests/smoke | 0 | auth/router tests | CI/prod | Engineering | Activo |
| Seguridad | Mantener dependencias sin vulnerabilidades auditables | npm audit | Security workflow | 0 vulnerabilidades según política CI | Security | CI | Engineering | Activo |
| Mantenibilidad | Mantener TypeScript compilable | tsc --noEmit | npm run lint | 0 errores | CI Quality | CI | Engineering | Activo |
| Mantenibilidad | Evitar artefactos documentales no reproducibles | tokens de citación de asistentes | governance check | 0 | CI governance | CI | Engineering | Activo |
| Flexibilidad | Mantener separación de runtime/adaptadores | duplicación arquitectónica no justificada | revisión arquitectónica | 0 nuevas duplicaciones | ADR/architecture issues | revisión | Engineering | Activo |
| Safety | Evitar automatización financiera no verificada | Auto-Apply writes ejecutables sin persistencia/scheduler | smoke/revisión | 0 | endpoint 501 + UI disabled | producción | Engineering | Activo |

## Regla de evidencia

Una prueba local o de CI no sustituye evidencia de producción. Cuando el objetivo depende del entorno desplegado, la matriz debe señalar explícitamente la evidencia de producción y su fecha.

## Revisión

Los umbrales deben cambiarse sólo con una justificación documentada y una actualización de trazabilidad. Una mejora cosmética no debe degradar un control existente.
