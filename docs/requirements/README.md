# Requirements Baseline

**Status:** Active baseline  
**Version:** 1.0  
**Scope:** QvaPay AI Scanner  
**Baseline issue:** #33

## Purpose

This directory defines the controlled requirements baseline for the project. Requirements are identified by stable IDs so that each critical capability can be traced through architecture, implementation and verification evidence.

## Requirement classes

- **FR** — Functional requirements.
- **NFR** — Non-functional requirements.
- **SEC** — Security requirements.
- **FIN** — Financial and accounting requirements.
- **INT** — External integration requirements.
- **OPS** — Operational and reliability requirements.

## Traceability rule

A critical requirement is considered traceable when its matrix row identifies:

1. the requirement;
2. the architectural component or decision that addresses it;
3. the implementation path(s);
4. the automated test or other verification evidence;
5. its current verification status.

A missing implementation or test reference is recorded as **partial**, **planned**, or **not verified** rather than inferred to be complete.

## Controlled documents

- [Functional requirements](./functional-requirements.md)
- [Non-functional requirements](./non-functional-requirements.md)
- [Security requirements](./security-requirements.md)
- [Financial and integration requirements](./financial-integration-requirements.md)
- [Acceptance criteria](./acceptance-criteria.md)
- [Traceability matrix](./traceability-matrix.md)

## Baseline governance

Changes to requirement IDs or their acceptance criteria must be made through a reviewed repository change. Existing IDs should not be silently reused for a different requirement.
