# Configuración local

La configuración local utiliza el archivo `config/.env`.

## Credenciales de QvaPay

Copia `config/.env.example` como `config/.env` y completa localmente:

- `QVAPAY_APP_ID`
- `QVAPAY_APP_SECRET`

**Nunca** coloques credenciales reales en `config/.env.example`, commits, issues o pull requests.

El archivo `config/.env` está excluido por `.gitignore`.

## Ejecución

El script `npm start` usa el soporte nativo de archivos `.env` de Node.js para cargar `config/.env` antes de iniciar el backend.
