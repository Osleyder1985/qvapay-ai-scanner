# Arbitrage monitor safety baseline

**Baseline:** 2026-10-03

The server-side arbitrage monitor is a read-only scanning component. It must remain fail-closed when persistent configuration is absent or invalid.

## Required invariant

A missing `arbitrage_monitor_config` row MUST NOT implicitly enable scanning.

The safe fallback is:

- `enabled: false`;
- no schedule activation;
- no upstream scan until an operator explicitly enables the monitor through the authenticated configuration route.

This prevents a deployment, migration, or database reset from silently turning periodic market polling back on.

## Auto-Apply boundary

Auto-Apply remains disabled and returns HTTP 501 for configuration mutations. The arbitrage monitor does not authorize or execute financial mutations.

## Verification

Tests must assert that a missing configuration row produces a disabled monitor state and that explicit configuration is required before scans execute.
