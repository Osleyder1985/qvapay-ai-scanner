# ADR-003: modular monolith as current system architecture

- **Status:** Accepted
- **Date:** 2026-09-30
- **Scope:** system architecture

## Context
The project already contains a working Node.js/TypeScript backend, web frontend, QvaPay integration, market intelligence, operations and local financial persistence.

Microservices or serverless infrastructure would add deployment and operational complexity without current evidence that the system requires distribution.

## Decision
Keep the system as a modular monolith.

Node.js/TypeScript remains the primary runtime. Domain and infrastructure boundaries are maintained inside the repository. Python is introduced only for a demonstrated analytics/ML/AI requirement.

## Consequences
### Positive
- simpler local operation;
- lower infrastructure cost;
- easier debugging and deployment;
- fewer distributed-system failure modes.

### Negative
- stronger need for internal module boundaries;
- frontend/backend files must not accumulate unrelated responsibilities;
- future extraction into services may require explicit interfaces.

## Revisit conditions
Reconsider the architecture only when measured requirements demonstrate a concrete need such as independent scaling, isolation, deployment cadence, or reliability boundaries that justify the added complexity.