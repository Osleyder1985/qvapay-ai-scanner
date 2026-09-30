# Evidencia de validación real QvaPay

Este directorio está reservado para evidencia redactada de la ejecución real del checkpoint #13.

## Regla

No almacenar secretos, tokens, cookies ni cabeceras de autenticación.

## Convención

Usar nombres como `YYYY-MM-DD-market.md`, `YYYY-MM-DD-operation.md` y `YYYY-MM-DD-errors.md`.

Cada evidencia debe indicar fecha/hora, commit del scanner, endpoint, método, HTTP status, latencia, campos no sensibles observados, resultado, incidencias y relación con el criterio correspondiente de Issue #13.

Las pruebas con mocks permanecen en `src/tests/` y nunca deben presentarse como evidencia de QvaPay real.
