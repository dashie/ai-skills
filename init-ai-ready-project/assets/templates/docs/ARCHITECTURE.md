# Architecture — {{PROJECT_NAME}}

This document follows [arc42](https://arc42.org) and uses C4 diagrams written in
PlantUML. Every diagram in this document is a `plantuml` fenced block; no other diagram
format is used. Product intent lives in [PRODUCT.md](./PRODUCT.md); decisions and their
rationale live in [ADR.md](./ADR.md).

## 1. Introduction and goals

{{ARCHITECTURE_OVERVIEW}}

## 2. Constraints

{{CONSTRAINTS}}

## 3. Context and scope

```plantuml
@startuml
{{CONTEXT_DIAGRAM}}
@enduml
```

{{CONTEXT_NOTES}}

## 4. Solution strategy

{{SOLUTION_STRATEGY}}

<!-- skill:block:arch-principles section="## 4. Solution strategy" -->
### Architecture principles

Fixed principles that constrain every design decision and every change:

- **Simplicity first (KISS).** The architecture is the simplest one that satisfies the
  requirements: the fewest components, layers, dependencies, and configuration knobs
  that work. Complexity is admitted only with a documented constraint and recorded in
  [ADR.md](./ADR.md).
- **Modular by default.** The system is split into modules with one responsibility
  each, behind a published contract. Modules are independently testable, independently
  evolvable, and independently debuggable: no dependency on another module's
  internals, no dependency cycles, no change that ripples across unrelated modules.
- **Tests with every change.** Every development effort ships with the tests of the
  part it touches. Testability is an architectural property: a module that cannot be
  tested in isolation, without starting the others, is not modular enough.
<!-- skill:end:arch-principles -->

## 5. Building block view

```plantuml
@startuml
{{CONTAINER_DIAGRAM}}
@enduml
```

{{COMPONENTS}}

### Component contracts

{{COMPONENT_CONTRACTS}}

### Data model

{{DATA_MODEL}}

## 6. Runtime view

{{RUNTIME_VIEW}}

## 7. Deployment view

{{DEPLOYMENT_VIEW}}

## 8. Cross-cutting concepts

{{CROSS_CUTTING_CONCEPTS}}

## 9. Architecture decisions

See [ADR.md](./ADR.md). Decisions are recorded there and are not duplicated here.

## 10. Quality requirements

{{QUALITY_REQUIREMENTS}}

## 11. Risks and technical debt

{{ARCHITECTURE_ASSUMPTIONS}}

## 12. Glossary

See [GLOSSARY.md](./GLOSSARY.md).

## Invariants

Properties that must hold after every change. Each invariant names how it is
enforced or verified.

{{INVARIANTS}}
