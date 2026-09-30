# ADR-002: Auto-Apply configurable con límites de ejecución

## Contexto

El sistema debe poder aplicar automáticamente a ofertas P2P que cumplan reglas definidas por el usuario, sin convertir la tasa u otros criterios en constantes del código.

QvaPay documenta que POST /p2p/:uuid/apply acepta credenciales de app y que tomar una oferta sell corresponde al lado de compra. La misma documentación establece un límite de 2 aplicaciones cada 60 segundos.

## Decisión

Implementar Auto-Apply como módulo dentro del monolito modular inicial.

La configuración será persistente y editable desde el dashboard:

- enabled
- type
- coin
- rateMin
- rateMax
- amountMin
- amountMax
- dailyMaxQusd
- maxConcurrent

El motor tendrá un estado operativo separado de la configuración y respetará un límite local de 2 intentos de aplicación por ventana de 60 segundos.

El motor estará desactivado por defecto y no ejecutará acciones posteriores a apply.

## Consecuencias

### Positivas

- Los criterios de selección se modifican sin recompilar.
- El app-secret permanece en el backend.
- Los límites de exposición pueden configurarse por operación, día y concurrencia.
- El motor puede evolucionar posteriormente hacia una cola persistente o un feed de eventos sin cambiar el contrato de configuración.

### Negativas

- El polling introduce latencia frente a un feed en tiempo real.
- El estado inicial se persiste en un archivo local; todavía no existe persistencia transaccional con PostgreSQL.
- La aplicación automática es una acción real sobre QvaPay, por lo que requiere pruebas controladas antes de activarse con límites altos.

## Estado

Aceptado para la primera implementación.
