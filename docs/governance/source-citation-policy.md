# Política de fuentes y citas del repositorio

**Estado:** Normativa  
**Idioma documental:** español  
**Propietario:** Engineering  
**Revisión:** 2026-10-03

## Regla general

El repositorio contiene documentación reproducible, no artefactos de interfaz de un asistente. No se deben almacenar referencias internas de ChatGPT ni formatos de renderizado como `cite...`, `url...` o `entity...`.

Las fuentes externas se registran como referencias Markdown normales o en una bibliografía controlada. Cada afirmación normativa o técnica dependiente de una fuente externa debe permitir que otra persona localice la fuente sin depender del historial de una conversación.

## Formatos permitidos

- Enlace Markdown a una página pública estable.
- Referencia bibliográfica con título, organización, URL y fecha de revisión.
- Referencia a un archivo o commit del propio repositorio cuando la evidencia sea interna.

## Formatos prohibidos

- Tokens `cite...`, `url...`, `entity...`.
- Identificadores internos de herramientas o conversaciones.
- Citas cuyo destino sólo exista dentro de una interfaz de asistente.

## Fuentes API

Para QvaPay se debe preferir la documentación oficial de QvaPay. La fuente normativa externa actual es:

- QvaPay API Docs: https://www.qvapay.com/docs
- QvaPay P2P list: https://www.qvapay.com/docs/p2p/list

La fecha de revisión debe actualizarse cuando cambie una decisión técnica basada en una fuente externa.

## Evidencia interna

La evidencia de CI, despliegues y auditorías debe apuntar a workflows, commits, artefactos o documentos del repositorio. No se deben copiar identificadores de una interfaz de asistente como sustituto de evidencia.
