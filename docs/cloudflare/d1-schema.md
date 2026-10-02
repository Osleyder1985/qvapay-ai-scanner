# Diseño de esquema D1 — QvaPay AI Scanner

## 1. Objetivo

Define el modelo relacional del runtime Cloudflare. D1 conserva también el estado del monitor server-side de arbitraje.

## 2. Migraciones

### 0001_initial_qvapay_scanner.sql

market_snapshots, p2p_operations, finance_ledger, auto_apply_config, auto_apply_state, auto_apply_attempts, auto_apply_applied_offers, auto_apply_vip_rejections y sync_runs.

### 0002_auto_apply_execution_lease.sql

auto_apply_execution_lease.

### 0003_cloudflare_runtime.sql

market_history y operations_ledger.

### 0006_arbitrage_monitor.sql

arbitrage_monitor_config y arbitrage_monitor_state.

## 3. arbitrage_monitor_config

Campos principales: enabled, min_margin_percent, coin, schedule_enabled, timezone, start_local, end_local, active_days_json y updated_at.

La configuración productiva por defecto es 24/7, margen 5% y BANK_CUP. Los campos de horario existen en el esquema, pero todavía no son configurables mediante el contrato público de UI/API.

## 4. arbitrage_monitor_state

Conserva status, scan_id, scanned_at, next_run_at, last_success_at, last_error, payload_json y updated_at.

payload_json contiene el último resultado serializado, incluyendo ofertas, oportunidades y cobertura. Ante un error se conserva el payload anterior y se registra el error.

## 5. Concurrencia

Las tablas singleton utilizan id = 1. ArbitrageMonitor utiliza Durable Object Alarm para programar la siguiente ejecución. El monitor actual no ejecuta mutaciones de QvaPay.

## 6. Retención

No se ejecutan purgas automáticas. El monitor conserva únicamente el último snapshot, no un histórico completo de cada ciclo.

## 7. Estado productivo

Para production/cloudflare: D1 está configurado, 0006 está incluido en el despliegue y ArbitrageMonitor está registrado en Wrangler. Auto-Apply continúa deshabilitado.
