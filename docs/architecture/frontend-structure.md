# Frontend module structure

## Purpose

Issue #35 separates the browser application into explicit responsibilities without changing the existing frontend runtime model or introducing a build step.

## Runtime composition

The browser loads classic scripts in this order:

1. `app-core.js` — shared state, utilities, route metadata, page templates, and navigation.
2. `market-ui.js` — market filters, offer rendering, market analytics/history summaries, and market actions.
3. `operations-ui.js` — operation roles, action rules, operation rendering, chat, and operation mutations.
4. `runtime-ui.js` — account, finance, Auto-Apply, data loaders, synchronization, command palette, and polling lifecycle.
5. `app.js` — minimal composition entrypoint that invokes `init()`.

The scripts intentionally remain classic scripts rather than ES modules. Existing inline handlers such as `onclick="applyOffer(...)"` and the current server's static-file model therefore continue to work without introducing a bundler or changing the browser API surface.

## Dependency rule

The modules share the existing browser-global runtime state. The order above is part of the frontend contract and must be preserved unless the application is migrated deliberately to an explicit module/bundler dependency graph.

## Scope

This issue is a structural refactor. It does not introduce new trading behavior, change QvaPay API semantics, or alter financial calculations.

## Verification

The repository's existing backend/integration tests remain unchanged. The frontend structure is verified by source inspection and by the application composition order in `index.html`. Runtime browser verification remains part of the real-environment validation track.
