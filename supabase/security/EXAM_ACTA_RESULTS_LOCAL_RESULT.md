# F1a — Acta de examen final: carga de notas y cierre (local)

Fecha: 2026-10-19. Ejecutó: Claude. Entorno: base descartable sobre `supabase_db_codex-baseline-local-7725bdda` (Postgres 17.6.1.165), con los 9 archivos del baseline y el fixture A/B. Staging y Producción: **NONE**.

## Reglas (decisión de Miguel, 18/10)

- **Quién carga:** el titular de la mesa. Secretaría (owner/admin/editor) también puede cargar, y es la única que corrige un acta cerrada, siempre con motivo.
- **Aprobación:** con 4 o más. Sin nota final se toma el promedio de escrito y oral.
- **Desaprobado y ausente:** no quitan la regularidad. El castigo por ausencia ("pierde el próximo llamado") va en F1b.

## Qué se agregó (`08_exam_tables.sql`)

- **Tabla `exam_results`:** una fila por inscripción. Checks de coherencia: el ausente va sin notas, el aprobado con 4 o más y el desaprobado con menos de 4. RLS activo sin grants: solo se accede por RPC.
- **`exam_table_caller_is_titular`:** helper interno, sin EXECUTE para roles de la API. Aplica la misma regla de titular que `get_exam_table_roster`.
- **`exam_save_acta_results(...)`:** `security definer` con `search_path = ''`. Además:
  - se carga desde el día del examen (hora argentina);
  - al cerrar exige que todos los inscriptos tengan resultado, y pasa la mesa a `completed`, que la publicación ya no reabre;
  - el aprobado va a `student_grades` (`final_exam`, `approved`) y cuenta para correlativas;
  - si un aprobado se corrige a desaprobado o ausente, esa fila se anula (soft delete).
- **`get_exam_table_roster`:** ahora devuelve `inscripcion_id`, escrito, oral, nota, resultado, `acta_cerrada` y `puede_cargar_notas`.
- **`get_exam_tables_admin_overview`:** suma `acta_cerrada`.

## Resultado

`node scripts/validateExamActaResultsLocal.mjs` → **PASS**, run `933214325c1e75f0` (primera corrida `d3bb41cd72d9d4f9`), cleanup 0. Los 16 pasos corren en orden, cada uno sobre el estado que dejó el anterior:

- **Contrato:** las dos funciones son security definer con `search_path=""`; el helper no tiene EXECUTE para ningún rol de la API; `exam_results` no da SELECT a `authenticated` ni a `anon`.
- **Bloqueos:**
  - antes del día del examen → `EXAM_NOT_TAKEN_YET`;
  - el alumno, un docente que no es titular y gestión de otra institución → 42501, sin cambios.
- **Validaciones:** ausente con nota, nota 11 e inscripción ajena se rechazan; cerrar sin cargar a todos → `EXAM_ACTA_INCOMPLETE`.
- **Carga del titular:**
  - aprueba con 8: la nota pasa a `student_grades` y la última condición queda `approved`;
  - corrige a 3 y 4 (promedio 3,5, desaprobado): la aprobación se anula y el alumno sigue `regular`;
  - cierra el acta.
- **Acta cerrada:**
  - el titular no puede cambiarla;
  - gestión sin motivo se rechaza;
  - gestión con motivo la corrige a 7: aprobado y evento `corrected`;
  - el roster del titular muestra la nota 7 y el acta cerrada;
  - gestión la corrige a ausente: se anula la aprobación y el alumno sigue `regular`.

## Regresiones (todas PASS)

| Harness | Run |
|---|---|
| Publicación de mesas | `2b7b555f9955236d` |
| Aceptación integrada QA.1 | `df2c14b3aefe1033` |
| Paridad 03.3 | `77bbe5df39213195` |
| Historia académica I2a | `3430c956f37b5a36` |
| CHECK 03.5c | `e4c78d7437340350` |
| Suspensión 06.3 | `a944e33e05a9c8be` |

## App

- **Portal docente → Mesas → Ver inscriptos:** desde el día del examen, el titular carga escrito, oral, nota final o ausente y ve el resultado en vivo; guarda y cierra. Cerrada, el acta queda en solo lectura.
- **Mesas y actas:** columna de resultado y botón "Cargar notas" o "Corregir acta (cerrada)", con motivo.
- **Acta PDF:** imprime escrito, oral y promedio (o "Ausente") y completa los totales del pie.

## Producción

No aplicado. Hay que correr `08_exam_tables.sql` (idempotente) con el OK de Miguel.

## F1b — el ausente pierde el próximo llamado (2026-10-19)

Regla de Miguel. Si un alumno queda ausente en el acta de una materia, el **primer llamado posterior** de esa materia y carrera queda bloqueado (`BLOCKED_BY_ABSENCE_PENALTY`).

- **Qué es un llamado:** el par (período, llamado), es decir (`exam_period_key` = año-mes, `exam_call_key`), de la primera mesa publicada de la materia (`confirmed`, `open`, `closed` o `completed`) posterior al examen al que faltó. Desde el llamado siguiente ya puede inscribirse.
- **Dónde está la regla:** en `exam_enrollment_assert_eligible`, así que vale igual para el portal y para la inscripción especial de secretaría. No usa `exam_absence_penalties` ni lo cambia.
- **RPC nueva `get_student_exam_absences`:** devuelve solo los ausentes del alumno que llama.
- **Espejo en el portal:** `getAbsencePenaltyForExam` compara período + llamado, igual que la base. Los ausentes llegan al portal desde esa RPC.

**Harness:** `validateExamActaResultsLocal.mjs` → **PASS**, run `24802656a0639598` y re-run `4b8ff0a1496d7244`. Con el alumno ausente en el acta:

- **Llamado siguiente** (+10 días): el servidor da `BLOCKED_BY_ABSENCE_PENALTY` y el espejo también bloquea.
- **Llamado posterior** (+45 días, otro período): el servidor da `registered` y el espejo deja inscribirse.
- **Visibilidad:** el alumno ve 1 ausente propio y otro usuario ve 0.

**Regresiones PASS:**

| Harness | Run |
|---|---|
| Publicación | `a45b4d6eee0ad234` |
| QA.1 | `4a48140a4da6ca88` |
| Paridad 03.3 | `dfc6eca2f861729d` |
| I2a | `92d624854cc41f0c` |
| 03.5b | `f61236cdee88dff4` |
| 03.5c | `4918bf0828886eed` |
| 06.3 | `7b789d5cbf05bb41` |
