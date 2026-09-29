# ADR-001: Selección de tecnologías de backend

## Estado

Aceptada

## Fecha

2026-09-29

## Contexto

QvaPay AI Scanner debe evolucionar desde un dashboard P2P de solo lectura hacia una plataforma capaz de:

- consultar la API oficial de QvaPay;
- recopilar observaciones históricas del mercado P2P;
- almacenar y consultar series históricas;
- calcular métricas y detectar cambios o anomalías;
- generar alertas;
- incorporar análisis estadístico y capacidades de inteligencia artificial;
- incorporar automatización solamente después de validar economía, seguridad y reglas operativas;
- funcionar inicialmente con coste de infraestructura cero o mínimo.

La API P2P de QvaPay tiene límites de frecuencia documentados. Actualmente el listado del mercado P2P está limitado a 25 solicitudes por minuto por cuenta, por lo que el problema inicial es predominantemente de integración I/O, almacenamiento y control de frecuencia, no de rendimiento extremo de CPU.

QvaPay también documenta un feed P2P mediante SSE como servicio de 10 USD por 30 días. Por ahora el proyecto no depende de ese servicio y utilizará la API estándar.

## Decisión

Se adopta una arquitectura de **TypeScript/Node.js como backend principal de aplicación**, con **Python reservado para analytics/AI cuando exista una necesidad real de sus ecosistemas especializados**.

Go queda como tecnología disponible para una futura extracción de componentes concretos si las mediciones del sistema demuestran una necesidad real de rendimiento, concurrencia o consumo de recursos que justifique la separación.

La primera implementación seguirá siendo un **modular monolith**, no microservicios.

### Distribución

| Responsabilidad | Tecnología inicial |
|---|---|
| HTTP/API de aplicación | Node.js + TypeScript |
| Integración QvaPay | TypeScript |
| P2P collector/workers | TypeScript |
| Validación y modelos de aplicación | TypeScript |
| Dashboard backend | TypeScript |
| Persistencia | PostgreSQL |
| Analytics/ML/AI | Python, cuando sea necesario |
| Componentes de alto rendimiento | Go, solo si las mediciones lo justifican |

## Criterios

Se evaluaron:

1. Integración HTTP con QvaPay.
2. Concurrencia y operaciones I/O.
3. SSE/eventos y futura automatización.
4. Tipado y mantenibilidad.
5. Acceso a PostgreSQL y background workers.
6. Ecosistema de análisis e IA.
7. Velocidad de desarrollo en Windows 11.
8. Coste de herramientas.
9. Facilidad de despliegue.
10. Capacidad de separar posteriormente componentes sin rehacer el dominio.

## Evaluación cualitativa

### Python

**Ventajas**
- Excelente ecosistema para análisis de datos, ML e IA.
- `asyncio` permite concurrencia para trabajo I/O-bound.
- Desarrollo rápido.
- Adecuado para el backend actual y para experimentos.

**Desventajas**
- Para el backend de aplicación, TypeScript ofrece un contrato de tipos más fuerte de extremo a extremo.
- Mantener toda la plataforma en Python puede mezclar demasiado pronto responsabilidades de aplicación y analytics.

### Node.js + TypeScript

**Ventajas**
- Excelente ajuste para APIs y cargas I/O-bound.
- TypeScript proporciona tipado estático y contratos claros.
- Encaja bien con polling, eventos, SSE, WebSockets y workers.
- Permite mantener la capa de aplicación en un solo ecosistema tipado.
- Buen ajuste para evolucionar el dashboard hacia una aplicación completa.

**Desventajas**
- No es la mejor herramienta del proyecto para ML/analytics especializado.
- El ecosistema npm exige control de dependencias y versiones.

### Go

**Ventajas**
- Lenguaje compilado, tipado y eficiente.
- Concurrencia de primera clase mediante goroutines y channels.
- Biblioteca HTTP estándar robusta.
- Excelente candidato para workers de alto rendimiento.

**Desventajas**
- No aporta una ventaja suficiente para el volumen actual conocido.
- Ecosistema de ML/analytics menos adecuado para el objetivo principal.
- Introducirlo ahora agregaría un tercer lenguaje sin evidencia de necesidad.

## Consecuencias positivas

- El backend deja de depender del servidor Python experimental.
- Se obtiene un backend fuertemente tipado para el dominio de la aplicación.
- Se mantiene Python disponible para la parte donde aporta mayor valor: analytics/AI.
- Se evita introducir Go prematuramente.
- Se conserva la opción de separar workers o servicios en el futuro.

## Consecuencias negativas

- El proyecto tendrá dos lenguajes cuando se incorpore analytics/AI en Python.
- La interfaz entre TypeScript y Python deberá definirse explícitamente.
- Existe coste de aprendizaje y mantenimiento de dos toolchains.

## Reglas de evolución

No se creará un microservicio separado únicamente por preferencia tecnológica.

Se considerará separar un componente solamente cuando exista evidencia como:

- necesidad de escalarlo independientemente;
- aislamiento de fallos;
- requisitos de ejecución incompatibles;
- consumo de recursos significativamente diferente;
- despliegue independiente necesario;
- límites técnicos demostrados del modular monolith.

Go se incorporará solamente después de medir el cuello de botella y documentar la decisión.

## Referencias técnicas

- QvaPay API: autenticación, rate limiting y capacidades P2P.
- Python `asyncio`: concurrencia para I/O.
- Go `net/http`: cliente/servidor HTTP y concurrencia segura.
