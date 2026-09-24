# Constraints

Last reviewed: 2026-09-17 by Codex.

Este archivo define el piso permanente de calidad del repositorio. No se debe debilitar para hacer pasar una tarea.

## Project Baseline

- Stack: React 19, Vite 8, JavaScript/JSX puro, Supabase JS 2, Vitest 4, ESLint 9.
- Package manager: npm con `package-lock.json`.
- Typecheck: no disponible en el proyecto principal porque no usa TypeScript.
- Puerta local existente: `npm.cmd run check`.
- Puerta estricta agregada: `npm.cmd run quality:full`.

## Floor

Siempre se exige:

- Sin secretos reales en codigo, fixtures, logs, docs, workflows o tests.
- Sin `service_role` en frontend ni variables `VITE_*`.
- Sin nuevas suppressions injustificadas: `eslint-disable`, `@ts-ignore`, `istanbul ignore`, `nosemgrep`, `gitleaks:allow`.
- Sin `catch {}` vacios, errores tragados o fallbacks silenciosos en flujos criticos.
- Sin tests borrados, salteados o debilitados para conseguir verde.
- Sin cambios destructivos de Supabase, Auth, RLS, datos productivos, secrets o deploys sin pedido expreso.
- Sin modificar `CONSTRAINTS.md`, `AGENTS.md` o workflows para bajar el nivel del gate junto con una feature que falla.

## Enforced Gates

| Dimension | Rule | Checked by | Runs at |
|---|---|---|---|
| Repository security posture | No repo security audit failures | `npm run audit:repo` | local gate, CI |
| Lint | Zero ESLint errors | `npm run lint` | local gate, CI |
| Tests | Full Vitest suite must pass | `npm test` | local gate, CI |
| Build | Production build and build audit must pass | `npm run build` | local gate, CI |
| Dependency audit | No high or critical npm audit findings unless explicitly triaged and accepted | `npm audit --audit-level=high` | strict gate, CI |
| CodeQL | JavaScript security analysis must run | GitHub CodeQL workflow | PR, push, weekly |
| Supabase changes | Supabase/Postgres/RLS/RPC/migration changes require Supabase skill review and relevant tests | documented in final report | every relevant task |
| UI changes | Browser/Playwright or DevTools verification required when UI behavior changes | documented in final report | every relevant task |

## Commands

Use PowerShell on Windows:

```powershell
npm.cmd run quality:fast
npm.cmd run quality:gate
npm.cmd run quality:deps
npm.cmd run quality:full
```

`quality:gate` runs repo audit, lint, tests and build. `quality:deps` runs the native dependency audit. `quality:full` runs both.

## Current Known Findings

The first strict dependency audit on 2026-09-17 found high and moderate advisories in transitive dependencies. Do not run broad automatic upgrades or `npm audit fix --force`. Triage each dependency change separately with changelog review and the full suite.

Known examples from `npm audit --audit-level=high`:

- P1: `react-router` via `react-router-dom`, multiple high advisories, no fix reported by npm audit at the time of the scan.
- P1: `@supabase/realtime-js` via `@supabase/supabase-js` depends on vulnerable `ws`, no fix reported by npm audit at the time of the scan.
- P1: `mammoth` depends on vulnerable `@xmldom/xmldom`, no fix reported by npm audit at the time of the scan.
- P1: `exceljs` depends on vulnerable `tmp` and related archive dependencies.
- P2/P1 depending reachability: build/test tooling advisories in `@babel/core`, `vite`, `vitest`, `jsdom`, `eslint` dependency chains.

Until triaged and fixed or explicitly accepted with evidence, the strict quality gate is expected to report dependency-audit failure.

## Measured But Not Yet Enforced

| Metric | Baseline | Direction |
|---|---:|---|
| Full test suite | 276 files / 2191 tests passing after the previous code change | must not regress |
| Build chunks | Vite warns on chunks over 500 kB | reduce over time; not currently blocking |
| Type coverage | Not applicable, JavaScript project | do not migrate to TypeScript without product decision |

## CHIEF CODE AUDITOR Contract

For non-trivial changes, run an independent read-only review before calling the task complete. The reviewer must receive the diff, the contract, and relevant files. It must look for ways to break the change and return findings with severity and file/line evidence.

## Exceptions

| ID | Rule | Scope | Reason | Owner | Expires |
|---|---|---|---|---|---|
| EX-001 | Dependency audit currently fails | Current dependency tree | Initial strict audit found pre-existing high/moderate advisories. Requires separate dependency triage task. | Project owner | 2026-10-17 |
