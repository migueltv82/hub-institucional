# Orchestration Patterns

This reference defines safe coordination between the main agent, reviewers, and specialist personas.

## Allowed Pattern

- The main session owns orchestration.
- The main session may ask an independent reviewer to inspect a bounded artifact.
- Reviewer agents work read-only unless the user or main session explicitly assigns implementation work.
- Findings return to the main session, which reconciles them against the contract and decides the next action.

## Anti-Patterns

### A. Reviewer as Rubber Stamp

Do not ask a reviewer whether the change is good. Ask for concrete ways the change can fail under the stated contract.

### B. Personas Invoking Personas

A persona or subagent must not spawn another persona as part of its own review workflow. Nested review chains make responsibility unclear and can create unbounded orchestration loops. If a subagent needs fresh-context review, it should report that need to the main session.

### C. Context-Free Verdicts

Do not approve or reject without the artifact, the contract, and enough related context to evaluate the change.

### D. Review Without Reconciliation

Reviewer output is evidence, not authority. The main session must classify each finding as actionable, contract misread, trade-off, duplicate, or noise.

## Stop Conditions

Stop the review loop when:

- No P0/P1 findings remain.
- Remaining findings are documented warnings or accepted trade-offs.
- The artifact has not changed since the previous review and another review would add no new evidence.
- The user explicitly accepts a documented residual risk.
