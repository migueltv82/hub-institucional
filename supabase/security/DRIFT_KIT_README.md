# KIT.1 — Drift read-only de Staging/Producción sin Codex

Sirve para STG0 y PROD0 (aprobados por Miguel el 17/10). El kit tiene dos piezas:
- `remote_drift_snapshot.sql`: **un solo SELECT**, read-only por construcción, sin filas personales ni secretos. Devuelve hashes de funciones, policies, tablas, triggers y buckets, grants de anon/authenticated, el modo de transición (`app_settings.academic_relational_transition`) y conteos agregados. Si al ambiente le faltan tablas, no falla: las informa como `null`.
- `scripts/compareDriftSnapshot.mjs`: genera el mismo snapshot sobre una base local descartable con el baseline de release/v1 y lo compara contra el remoto. Devuelve qué archivos de `supabase/schema/` hay que aplicar (en el orden del runbook) y por qué.

## Pasos para Miguel (≈5 min por ambiente)

1. Supabase Dashboard → proyecto **Hub-Institucional-Staging** (verificar el nombre arriba) → SQL Editor → New query.
2. Pegar el contenido completo de `supabase/security/remote_drift_snapshot.sql` y presionar **Run**.
3. El resultado es una sola celda `snapshot`. Copiarla entera (clic en la celda → copiar) y pegarla en el chat con Claude, o guardarla en un archivo.
4. Repetir en **Hub-Institucional** (Producción).
5. Edge Functions: en el mismo dashboard, sección Edge Functions, anotar la fecha de "last deployed" de `admin-users` y `source-file-storage`. Esto no se puede leer por SQL.

Claude corre: `node scripts/compareDriftSnapshot.mjs --remote <archivo> --label staging|production`.

## Validación del kit (local)

- Base de Supabase sin baseline: el SQL corre y reporta `app_settings_missing`. El comparador pide los 9 archivos (189 diferencias, 0 sin asignar).
- release/v1 contra sí mismo: **0 diferencias**.
- Base con el `07_academic_operations.sql` previo a 03.5b: **1 diferencia** (`academic_teacher_upsert_student_grade`, cuerpo distinto) → aplicar solo `07_academic_operations.sql`. Evidencia: `DRIFT_KIT_CONTROL_EVIDENCE.json`.
- Test focal: `scripts/compareDriftSnapshot.test.js`.

Límite: compara catálogo (objetos, cuerpos, grants, policies), no datos. Un objeto "extra" en el remoto se informa, pero no se resuelve aplicando SQL: lo revisa el Verificador.
