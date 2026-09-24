# Definition of Done

This repository uses a strict Definition of Done for every relevant change. A task is not complete merely because it compiles, renders, or passes a happy path.

## Required Gate

Before closing a task, verify the checks that apply to the changed surface:

- The implementation satisfies the requested behavior and preserves existing behavior.
- Relevant tests pass, and the full suite passes when shared flows can be affected.
- Lint passes.
- Build passes.
- Typecheck passes when the touched stack has a typechecker. This project is JavaScript/JSX, so the main app currently has no TypeScript typecheck.
- Security review is complete for user data, auth, permissions, Supabase, APIs, forms, uploads, storage, secrets, or external integrations.
- Supabase/PostgreSQL review is complete for database, RLS, RPC, migrations, policies, indexes, constraints, relations, and queries.
- Performance review is complete for queries, large lists, repeated requests, heavy payloads, expensive rendering, bundles, or intensive processing.
- Browser or Playwright verification is complete for UI behavior changes.
- Documentation and project constraints are updated when the development process or public behavior changes.
- Code review and adversarial review are complete for non-trivial changes.

## Blocking Conditions

Do not report `QUALITY GATE: PASS` when any of these remain open:

- P0 or P1 finding.
- Required test, lint, build, or repo audit failure.
- Known high or critical vulnerability without explicit triage and acceptance.
- Confirmed data loss, data corruption, unauthorized access, or secret exposure risk.
- A required migration, RLS, Auth, or production data safety check could not be performed.

## Reporting

Use the final report format defined in `AGENTS.md` and `CONSTRAINTS.md`. Report what was checked, what failed, what remains unverified, and the final quality status.
