# RB.1 — Comandos del runbook de Producción ensayados en local

Fecha: 2026-10-17. Implementado por Claude mientras Codex no estaba disponible; la auditoría queda para Codex. Evidencia: `RUNBOOK_COMMANDS_LOCAL_EVIDENCE.json`. Reproducción: `node scripts/validateRunbookCommandsLocal.mjs`.

## Método

Stack descartable (`scripts/localSupabaseStack.mjs`): baseline de 9 SQL, 2 usuarios reales creados por la GoTrue Admin API, 2 instituciones, memberships, legajo, auditoría y un objeto de Storage. Cada comando se corre **como `postgres`**, el rol que tiene el operador en un proyecto Supabase y que no es superusuario. Los bloques SQL se leen directo de `docs/RUNBOOK_PRODUCCION_V1.md`, para probar exactamente lo documentado.

## Resultados

| Paso del runbook | Resultado |
| --- | --- |
| §3.1 `pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=auth --schema=storage` como `postgres` | **OK**, archive con 833 entradas; `pg_restore --list` lo lee |
| §3.3 snapshot de catálogo | **OK** |
| §4 verificación post-SQL | **OK**: `handle_new_user_ok = t`, `firmas = 1`, `tablas_sin_rls = 0` de 40 |
| §9-R4 `pg_restore --single-transaction` sobre base vacía | **FALLA**: `schema "public" already exists` |
| §9-R4 lo mismo sobre un "proyecto nuevo" (auth/storage ya creados) | **FALLA**: `schema "auth" already exists` |
| Variante: proyecto nuevo + baseline + `--data-only` | **FALLA**: FK `auth.identities` → `auth.users` (pg_restore copia en orden alfabético) |
| Variante: lo mismo + `--disable-triggers` | **FALLA**: `must be owner of table audit_log_entries` |

Aunque se resolviera el orden de las FK, el trigger `handle_new_user` sobre `auth.users` recrearía los perfiles (rol `alumno`) y chocaría con los `public.profiles` del archive. Los ensayos DR anteriores (tq01D3Bz, to6OoXZC) funcionaron porque restauraban como superusuario local, algo que el operador no tiene en Supabase.

## Conclusión y cambios al runbook

- El backup del §3 y las verificaciones §3.3/§4 quedan **acreditados tal cual**.
- El **restore manual del archive no es un camino viable** para un restore completo. §9-R4 se reescribió: el restore completo es el **gestionado por Supabase** (backups diarios/PITR), y el archive queda para verificar y para reparaciones puntuales de `public`.
- **P10 pasa a ser obligatorio**: sin backups/PITR activos en Producción no hay rollback de datos viable. Decide Miguel.

Cleanup: 0 bases, 0 contenedores, 0 archivos temporales; las bases destino extra también se borraron. Staging, Production, SQL remoto y deploy: NONE.
