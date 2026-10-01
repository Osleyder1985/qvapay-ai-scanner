# Source Code Documentation Standard

**Status:** Active  
**Baseline:** Issue #34  
**Applies to:** TypeScript/JavaScript source and test files; HTML/CSS source files receive the file-level header where applicable.

## Objective

Every maintained source file must explain its role, location, module and lifecycle status. Public APIs and domain logic must expose enough TSDoc/JSDoc for a maintainer to understand purpose, inputs, outputs and relevant side effects without reading the entire implementation first.

## File header

TypeScript/JavaScript files use:

```ts
/**
 * @file <file name>
 * @path <repository path>
 * @description <what the file owns>
 * @module <logical module>
 * @status active|experimental|deprecated|test
 */
```

HTML and CSS use the equivalent information in a normal block comment.

## Function and API documentation

Functions that form a module API, implement domain rules, perform I/O, mutate persistence, handle HTTP requests, or coordinate external services must have JSDoc/TSDoc containing, as applicable:

- purpose;
- `@param` for inputs;
- `@returns` for the result;
- `@throws` or an explicit effects/error note when failures are relevant;
- invariants or safety constraints when they materially affect correctness.

Small private helpers may use a concise description when their behavior is self-evident. Repeating the implementation line-by-line is discouraged.

## Language rule

Los comentarios explicativos y el contenido humano de JSDoc se redactan en español. Se mantienen sin traducir los tags JSDoc, identificadores del lenguaje, nombres propios y nomenclatura exacta de APIs o contratos externos.

## Documentation quality rule

Documentation describes the behavior actually implemented. It must not claim a capability merely because it is planned, and it must distinguish unavailable/unknown data from verified data.

## Maintenance rule

When a public API, domain rule, persistence model, security boundary, or external integration changes, its documentation must be updated in the same change.

Issue #34 establishes the baseline; future issues may improve descriptions without changing the requirement itself.
