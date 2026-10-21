# Punto 3 — Modelo de asignación docente (local)

Fecha: 2026-10-21. Ejecutó: Claude. Entorno: base descartable sobre `supabase_db_codex-baseline-local-7725bdda`, con los 9 archivos del baseline y el fixture A/B. Staging y Producción: **NONE** (en Prod solo se hicieron lecturas, ver abajo).

## Decisión

`subject_teacher_assignments` (06) es la **única fuente de verdad** de quién da cada materia. De ella leen el RLS, los portales, el libro docente, las mesas y la Edge `admin-users`. En cambio, `teacher_subject_assignments` (02) queda como legado del import relacional (`scripts/importNormalizedData.mjs` y la vista previa relacional del motor) y no decide permisos. En Prod está vacía.

## Qué cambia (`06_subject_teacher_assignments.sql`, idempotente)

- **Columnas nuevas:**
  - `starts_on` / `ends_on`: vigencia. En una suplencia es el período de la licencia que cubre; en una asignación terminada, `ends_on` es la fecha efectiva de fin.
  - `end_reason`: `renuncia`, `baja`, `jubilacion`, `reemplazado`, `fin_suplencia`, `error_de_carga` u `otro`.
  - `replaces_assignment_id`: a quién reemplaza.
- **Constraints:**
  - Una asignación activa no tiene motivo de fin y una inactiva **tiene que tenerlo**. El CHECK usa `is not null` explícito, porque `null in (...)` da NULL y un CHECK con NULL pasa (el harness lo detectó en la primera corrida).
  - `ends_on >= starts_on`, y una asignación no puede reemplazarse a sí misma.
  - FK compuesta `(institution_id, workspace_key, subject_id, program_id, replaces_assignment_id)`: solo se puede reemplazar a una asignación de la misma institución, workspace, materia y carrera.
- **Backfill (las fechas se toman solo si tienen formato AAAA-MM-DD y respetan fin >= inicio, así una fecha mal escrita no corta el script):**
  - Las suplencias viejas toman el vínculo y la vigencia de `metadata`, solo si apuntan a la misma materia.
  - Las bajas viejas sin motivo quedan con `otro`.
- **`academic_create_teacher_subject_leave`:**
  - Valida que la licencia no termine antes de empezar y que el docente no se reemplace a sí mismo.
  - Escribe el vínculo y la vigencia en columnas, más los nombres para mostrar ("lo reemplaza…", "reemplaza a…"). Antes la UI buscaba claves que nadie escribía.
- **`academic_update_teacher_assignment_condition`:**
  - Cierra las suplencias por el vínculo real (o por el de `metadata`, para las viejas), con motivo `fin_suplencia`.
  - No revive una asignación ya terminada.
- **Nueva `academic_end_teacher_assignment(id, motivo, fecha, notas)`:**
  - `security definer`. Solo la pueden usar owner, admin, editor o superadmin de esa institución.
  - Rechaza fecha futura, motivo inválido y asignación ya terminada.
  - Nunca borra: deja la fila `inactive` con motivo, fecha y quién la dio de baja.
  - Si el docente estaba de licencia, sus suplentes siguen a cargo y la RPC informa cuántos quedan.
- **Fase B (no incluida):** sacar `licencia` del rol y pasarla a un estado. Implica tocar todas las lecturas que filtran por rol, así que va aparte.

## Front

- `endSubjectTeacherAssignment` (RPC) reemplaza a `deactivateSubjectTeacherAssignment`, que hacía un update directo. La base ya no acepta una baja sin motivo.
- La lectura incluye las columnas nuevas. Si la base todavía no corrió el 06, sigue con las de antes.
- Ficha del docente → Materias asignadas:
  - "Dar de baja" abre un modal con motivo, fecha (local, sin fecha futura) y observaciones.
  - Los errores se ven dentro del modal.
  - Si quedan reemplazantes a cargo, se avisa.
- Etiquetas corregidas: "En licencia · lo reemplaza X hasta el dd/mm/aaaa" y "Reemplaza a Y hasta el dd/mm/aaaa".

## Resultado

`node scripts/validateTeacherAssignmentModelLocal.mjs` → **PASS**, 44/44 chequeos, runs `236ded430a955681`, `3d8af48de6367beb` y `f9206cef31b80260` (este último después de blindar las fechas del backfill), cleanup 0.

| Grupo | Chequeos |
|---|---|
| Contrato | Columnas nuevas; las 3 RPC `security definer` con EXECUTE solo para `authenticated` |
| Rechazos (sin cambio de estado) | Alumno, docente y gestión de otra institución: 42501. Motivo inválido o vacío, fecha futura, licencia que termina antes de empezar, autorreemplazo: 22023 |
| Constraints | Baja directa sin motivo: 23514. Reemplazo de otra materia: 23503. Autorreemplazo y fin antes del inicio: 23514. Control positivo: el admin sí actualiza por RLS |
| Licencia | Vínculo y vigencia en columnas; nombres; el alumno sigue viendo el aviso; el suplente accede al padrón |
| Cierre de licencia | Volver a titular cierra la suplencia con `fin_suplencia`; el suplente pierde el padrón; una suplencia futura cancelada respeta fin >= inicio |
| Baja con motivo | Renuncia con fecha y autor; el docente pierde el padrón; no se termina dos veces; cambiar la condición no la revive |
| Baja durante la licencia | Jubilación: la suplencia sigue y el suplente conserva el padrón |
| Backfill y re-ejecución | Vínculo y vigencia desde `metadata`; motivo `otro`; constraint restaurado; re-correr el 06 no toca otras filas; tercera corrida sin cambios |

**Regresión:** siguen en PASS los harness de cargas masivas (I2b), condición académica (check y escritura), publicación de mesas, suspensión de institución, búsqueda de perfiles por email e importación de historia académica.

`validateIntegratedAcceptanceLocal` falla en el paso "alumno/a own login". Falla igual sin estos cambios (verificado con `git stash`): es del entorno local de GoTrue, no de este bloque.

`npm run check`: PASS, 359 archivos y 2743 tests.

## Prod (solo lectura, 21/10)

- `subject_teacher_assignments`: 3 filas, todas `titular`/`active`/`manual` y sin `metadata`. El backfill no tiene nada que mover.
- `teacher_subject_assignments`: 0 filas.
- Las policies de la tabla coinciden con el repo, así que re-correr el 06 no afloja nada.

## Para aplicar en Prod (después de la auditoría de Codex)

1. En el SQL Editor, correr `supabase/schema/06_subject_teacher_assignments.sql` completo. Es idempotente.
2. Verificar:
   ```sql
   select
     (select count(*) from information_schema.columns where table_schema='public' and table_name='subject_teacher_assignments' and column_name in ('starts_on','ends_on','end_reason','replaces_assignment_id')) as columnas_nuevas,           -- 4
     (select count(*) from pg_constraint where conname in ('subject_teacher_assignments_end_reason_check','subject_teacher_assignments_dates_check','subject_teacher_assignments_replaces_self_check','subject_teacher_assignments_replaces_scope_fkey')) as constraints, -- 4
     (select count(*) from pg_proc where proname='academic_end_teacher_assignment') as rpc_baja,  -- 1
     (select count(*) from public.subject_teacher_assignments where status='inactive' and end_reason is null) as bajas_sin_motivo; -- 0
   ```
3. Recién después, publicar el front. Antes de correr el SQL, el botón "Dar de baja" responde que falta actualizar la base y la lectura sigue funcionando con las columnas viejas.
