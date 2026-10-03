# Contrato de Cuenta QvaPay

## Fuente autoritativa

La identidad de Cuenta procede exclusivamente de POST /v2/info, autenticado con QVAPAY_APP_ID y QVAPAY_APP_SECRET. La respuesta se valida con parseQvaPayApplicationIdentity.

Las respuestas P2P no son fuente de identidad propietaria. Un campo User procedente de una oferta no puede seleccionar ni reemplazar account.user.

## Contrato de balance

POST /v2/balance se valida con parseQvaPayBalance. Se aceptan únicamente estas formas exactas:

- { balance: number }
- { message: string, data: number }

El número representa USD. Se aceptan 0 y valores finitos no negativos. Se rechazan strings numéricos, booleanos, valores no finitos, negativos, campos adicionales, envelopes anidados y payloads sin contrato.

HTTP 200 no implica contrato válido: identidad y balance se validan independientemente y /api/account solo declara integrationStatus: verified cuando ambos contratos son válidos.

## Seguridad y diagnóstico

El Worker nunca devuelve QVAPAY_APP_SECRET ni el payload completo de QvaPay. Los errores de contrato se reducen a mensajes sanitizados.

## Trazabilidad

- Identidad: src/cloudflare/qvapay-identity.ts
- Balance: src/cloudflare/qvapay-balance.ts
- Integración: src/cloudflare/qvapay-account-contract.ts
- Transporte: src/cloudflare/account-routes.ts
- Tests: src/tests/qvapay-account-contract.test.ts
