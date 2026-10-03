# Ciclo de vida de ramas

**Revisión:** 2026-10-03

## Estados

### Activa

Una rama tiene un PR abierto, una tarea de implementación en curso o una necesidad operativa explícita. Debe poder asociarse a un Issue o PR.

### Histórica

La rama terminó su trabajo mediante merge o cierre y ya no representa una línea de desarrollo. Puede conservarse temporalmente para auditoría, pero no debe recibir cambios.

### Superseded

La rama fue reemplazada por otra implementación o arquitectura. No debe recibir nuevos commits y debe documentar el reemplazo cuando sea necesario.

## Política

1. Crear una sola rama de trabajo por hallazgo o cambio coherente.
2. No crear nuevas ramas paralelas para un hallazgo que ya tiene una rama activa.
3. Al fusionar un PR, eliminar la rama temporal cuando GitHub permita su eliminación.
4. Al cerrar un PR sin merge, marcar la rama como histórica o superseded según corresponda.
5. Las ramas tmp/* y test/* son temporales por definición y deben eliminarse al terminar su propósito.
6. Las ramas feat/*, fix/*, docs/*, chore/* y security/* no son ramas de larga vida.
7. Una rama de larga vida sólo puede conservarse si su propósito está documentado.
8. production/cloudflare y main son las únicas ramas de integración de larga vida contempladas en esta baseline.

## Auditoría

La revisión periódica debe registrar:
- ramas activas con Issue/PR;
- ramas históricas/superseded;
- ramas temporales pendientes de eliminación;
- excepciones justificadas.

La eliminación física de ramas es una operación administrativa de GitHub y debe realizarse con permisos de administración del repositorio.
