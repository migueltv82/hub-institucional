# AUD.I2a — Auditoría independiente de importación de historia académica

Fecha: 2026-10-19 (America/Buenos_Aires). Auditor: Codex, CHIEF CODE AUDITOR, revisión propia independiente del implementador.
Tarjeta: https://trello.com/c/pah2RK2z
Commit auditado: `e761829f455d1cb9fa591fd68f018bce537b2fd4`.

**VEREDICTO: FAIL.** Hallazgos reproducidos: 1 P1 y 1 P2. Sin P0 ni P3 identificados. No se corrigió la implementación.

## Alcance y entorno

- RPC `academic_admin_import_student_history(uuid,text,jsonb)` y sus grants en `07_academic_operations.sql`.
- `studentHistoryImport.js`, `StudentHistoryImportSection.jsx`, `mapStudentPortalGrade`, harness y tests de I2a.
- Lectura del contrato de elegibilidad de `08_exam_tables.sql:609–625`; no se modificó ese archivo ni los archivos de F1.
- Copia aislada de `release/v1`, sincronizada con `git pull --rebase`, HEAD exactamente `e761829`. El checkout compartido tenía cambios sin commit de 03.5c y HEAD separado: se preservó íntegro.
- Docker local `supabase_db_codex-baseline-local-7725bdda`. Cada harness creó una base con nombre y marcador aleatorios y comprobó su eliminación.
- Sin lecturas de `.env`, credenciales de producción, SQL remoto, deploy, PR nuevo ni cambios en `main`.

## P1 — Una importación concurrente puede prevalecer sobre la nota docente y habilitar una mesa

Ubicación: `supabase/schema/07_academic_operations.sql:1779–1796` (comprobación separada del INSERT), y `:1806–1815` (upsert sin coordinación con la escritura docente).
Consumidor afectado: `supabase/schema/08_exam_tables.sql:609–625`, que decide por la última condición no-pending ordenada por `updated_at`, luego `created_at`.

La RPC comprueba que no exista una nota no-pending de otro tipo, pero no serializa esa comprobación con `academic_teacher_upsert_student_grade`. Las claves únicas difieren por `grade_type`, de modo que `final` e `historia` pueden insertarse simultáneamente. Los timestamps de los triggers provienen de `now()`, es decir, del comienzo de la transacción, no del orden de confirmación de las escrituras.

### Reproducción ejecutada

Usar el fixture A/B y los identificadores exportados por `validateStudentHistoryImportLocal.mjs` y `validateExamEligibilityParityLocal.mjs` en una base descartable. Borrar solo las notas del alumno sintético y asegurar su cursada y la asignación titular del docente. Para hacer determinista la ventana entre comprobación e INSERT, instalar **solo en esa base descartable**:

```sql
create function public.audit_history_delay() returns trigger
language plpgsql as $delay$
begin
  if new.grade_type = 'historia' then perform pg_sleep(3); end if;
  return new;
end $delay$;
create trigger audit_history_delay before insert on public.student_grades
for each row execute function public.audit_history_delay();
```

1. Sesión T: `BEGIN; SELECT pg_sleep(1.5);` y luego, como el docente autenticado y asignado, llamar a `academic_teacher_upsert_student_grade` con `grade_type='final'`, intento 1, condición `libre`; `COMMIT`.
2. A los 300 ms del comienzo de T, sesión H: como admin A, importar una fila `regular` de la misma materia/carrera/legajo con fecha histórica `15/12/2024`; confirmar.
3. H pasa la comprobación antes de que T haya escrito y queda esperando en el trigger. T escribe y confirma `libre`. H inserta después la historia.
4. Ejecutar `enrollSql()` del harness como el alumno: devuelve **`registered`**.

Resultado observado en el run independiente `730d292018b6e2b3`:

| grade_type | condición | updated_at (UTC) |
|---|---|---|
| historia | regular | 2026-10-19T16:25:54.210587+00:00 |
| final | libre | 2026-10-19T16:25:53.878737+00:00 |

La fila docente no se sobrescribe físicamente, pero pierde autoridad funcional ante la historia. Se viola la promesa de que la importación nunca gana a la operación docente y se permite una inscripción que debería quedar bloqueada por `libre`.

Recomendación para Claude: coordinar importación y escritura docente sobre la misma identidad académica y volver a comprobar bajo esa coordinación; cubrir ambas intercalaciones y el re-import. No alcanza con bloquear únicamente la fila `historia`, porque la fila docente usa otra clave. Mantener la regla de última condición no-pending y su espejo; no corregir este hallazgo debilitando la elegibilidad.

## P2 — El fallback por DNI vincula una historia al legajo de otra carrera

Ubicación: `supabase/schema/07_academic_operations.sql:1759–1765`, posterior persistencia en `:1802`.

La primera búsqueda filtra carrera; si no encuentra coincidencias, la segunda elimina ese filtro. Un único DNI encontrado en el workspace se acepta aunque su legajo tenga una carrera distinta y explícita.

### Reproducción ejecutada

1. En una transacción sobre el fixture A/B, sin notas del alumno sintético, cambiar `student_records.career` del legajo A a `OTHER CAREER`.
2. Como admin A, importar DNI `30111222`, carrera `FIX-A`, materia `FIX-A-01`, condición `regular`.
3. La RPC responde `importadas=1`, `rechazadas=0`.
4. El JOIN de la nota importada con su legajo devuelve:

```json
{"grade_program":"Fixture Career A","record_career":"OTHER CAREER"}
```

Impacto: asociación académica incorrecta entre carrera y legajo; no es una fuga entre instituciones. La ambigüedad entre dos legajos de la misma carrera sí se rechaza correctamente.

Recomendación para Claude: distinguir un legajo sin carrera de uno que contradice expresamente la carrera importada y rechazar la contradicción; si se desea permitir legajos multicarrera, definir y verificar su vínculo canónico antes de reutilizarlos.

## Qué se verificó

### Pruebas solicitadas

```text
npx vitest run scripts/validateStudentHistoryImportLocal.test.js src/services/studentHistoryImport.test.js src/components/generadorCronograma/StudentHistoryImportSection.test.jsx
3 archivos / 13 tests: PASS.

node scripts/validateStudentHistoryImportLocal.mjs
Run 90f0954ada500c50: 8 casos PASS; cleanup databases=0, errors=[].
```

### Escenarios propios, base descartable

Run `730d292018b6e2b3`; 14 escenarios adicionales. La finalización técnica del runner y los casos originales resultaron PASS; **esto no convierte los resultados adversariales en aprobación funcional**. Los dos resultados incorrectos anteriores determinan el FAIL de esta auditoría.

| Escenario | Resultado observado |
|---|---|
| null, número, string y array como elementos | 4 rechazos por fila, `FALTAN_DATOS` |
| 1001 filas en una llamada | `22023`, `STUDENT_HISTORY_TOO_MANY_ROWS` |
| DNI `30.111.222`, nota `8,50` | Importación aceptada |
| Institución suspendida, actor staff | `42501`, sin importación |
| Workspace sin el legajo | `ALUMNO_NO_ENCONTRADO` |
| Dos legajos con mismo DNI y carrera | `ALUMNO_AMBIGUO` |
| Nota docente pending | Historia aceptada; pending no bloquea por diseño |
| owner, admin, editor (tres casos) | Una fila importada por cada rol |
| Staff bloqueado | `42501` |
| Superadmin sin membresía | Importación aceptada |
| Legajo de otra carrera | FAIL, hallazgo P2 |
| Docente/importación concurrentes | FAIL, hallazgo P1; inscripción `registered` |

Ambos runs finalizaron con `cleanup.databases=0`, `cleanup.errors=[]`. El trigger y los fixtures adversariales existieron solo en la base eliminada.

### Revisión del contrato y del frontend

- SECURITY DEFINER con `search_path=""`; `anon` sin EXECUTE y `authenticated` con EXECUTE, verificados en catálogo local.
- El cuerpo exige `auth.uid()` y gestión por owner/admin/editor o superadmin. Las consultas de catálogo se acotan por institución y las de legajo por institución y workspace. No se identificó acceso entre tenants en los casos ejecutados.
- La suspensión y el bloqueo de staff se hacen efectivos por `is_member_of_institution`; superadmin conserva la excepción explícita de la arquitectura existente.
- Harness original: condición inválida, nota fuera de rango, fecha imposible/futura, catálogo ajeno, alumno ausente y legajo sin cuenta se rechazan. Re-import secuencial no duplica; notas docentes no-pending preexistentes se omiten.
- `03.5c` está en el baseline auditado. Los estados escritos por la RPC son canónicos; `pending` no es una condición admitida para importar historia.
- Componente sin cliente Supabase directo: acceso por `services/`. Lotes secuenciales de 500; error de RPC devuelto como objeto informa reporte parcial. Tests incluyen 1201 filas y error de segundo lote. No se ejecutó un fallo real de red entre lotes.
- `mapStudentPortalGrade` transforma `historia` en `final` con `origin='historia'` en el adaptador del alumno, conservando los demás campos; no modifica el mapeo docente compartido.
- No se ejecutó recorrido de navegador ni carga de un XLSX contra una base remota; los tests de componente y servicio no sustituyen esos recorridos.

## Cierre

`npm run check`: PASS (auditoría del repo, lint, 334 archivos / 2615 tests, build y auditoría de producción de 117 archivos). Aviso preexistente de chunks >500 kB. No hay typecheck en el proyecto JS. Browser/E2E no ejecutado en esta auditoría; revisión de componente mediante tests. Seguridad y corrección funcional auditadas: FAIL por P1 abierto; no se confunde el gate automatizado verde con aprobación de I2a.

**QUALITY GATE: FAIL** por el hallazgo funcional P1 de la implementación auditada. El commit de esta auditoría contiene solo evidencia y WORKLOG.

Hallazgos sin corregir y entregados para corrección por Claude. No aprobar I2a mientras siga abierto el P1. Esta auditoría no autoriza deploy ni escritura remota y no habilita I2f.

## Corrección (Claude, 2026-10-19)

### Reauditoría independiente de Codex — 2026-10-20

Revisados los correctivos `af9337b` y su estado integrado en `8ea0197`, sin modificar implementación. **P1 y P2 originales: cerrados en la base local.** Este resultado sustituye el FAIL original exclusivamente para esos hallazgos; no acredita aplicación en producción.

- P1 (`07_academic_operations.sql:576`, `:928`, `:1880`; consumidor del acta `08_exam_tables.sql:2175`): identidad y lock de transacción comunes; comprobación de notas docentes dentro del lock; trigger de timestamp con reloj real (`07:566`). Helper interno con `search_path` vacío y sin EXECUTE para PUBLIC/anon/authenticated.
- Repetí la reproducción propia original, con trigger descartable que demora tres segundos el INSERT histórico y una transacción docente iniciada antes. Ahora la nota `final:libre` queda última (10:41:34.917771 UTC frente a historia 10:41:34.902441), y el RPC devuelve `EXAM_REGULARITY_REQUIRED`, nunca `registered`.
- P2 (`07:1682–1735`, resolución compartida de DNI): el escenario propio cambia la carrera del legajo a `OTHER CAREER`. Resultado: una rechazada por `ALUMNO_DE_OTRA_CARRERA`, cero importadas y ningún vínculo de nota al legajo.
- Harness original actualizado: run `883bd9c4fb175786`, PASS, incluidos ambos órdenes concurrentes. Las dos carreras dejan `final:libre` última e inscripción denegada; cleanup de bases = 0.
- Runner adversarial independiente reutilizado: run `93f10c14314eeeea`, 14 escenarios inspeccionados, cleanup = 0. Además de los dos casos anteriores: elementos escalares, 1001 filas, DNI con puntos/nota con coma, institución suspendida, workspace inexistente, DNI ambiguo, pending docente, owner/admin/editor, bloqueo y superadmin sin membership. Los resultados conservan autorización y aislamiento esperados. El PASS del runner por sí solo no evalúa esos 14 resultados: se revisaron sus valores explícitamente.

Riesgo residual: pruebas locales sobre fixture sintético; no se ejecutó SQL remoto ni deploy, ni recorrido de navegador. No se modificaron archivos F1 ni el motor de vocales. El alcance es la corrección de los dos hallazgos originales, no una auditoría de todas las tarjetas incorporadas desde entonces.

Gate repetido: `npm.cmd run check` PASS (349 archivos / 2692 tests, lint, auditoría del repo, build y auditoría del bundle de 120 archivos). La primera ejecución falló en tres comparaciones literales LF contra un checkout CRLF de `admin-users`; se restauró LF sin diff funcional ni cambios a los tests. Ejecución final con dos workers. Suites solicitadas: 3 archivos / 14 tests PASS. Typecheck no disponible; navegador no ejecutado; aviso preexistente de chunks >500 kB. Sin nuevos hallazgos P0–P3 en este alcance. **QUALITY GATE: PASS WITH WARNINGS** (bundle y verificación exclusivamente local).

Al integrar el avance concurrente I3 (`0e0e086`) antes del push, se repitió `npm.cmd run check`: PASS, 351 archivos / 2699 tests, lint/build/auditorías (120 archivos de bundle). Se conservaron ambas entradas del WORKLOG. No se extiende el alcance de esta auditoría a I3.

Corregido por el implementador. La re-auditoría liviana queda a cargo de quien no escribió el cambio.

**P1 — carrera entre la carga docente y la importación.** Dos cambios en `07_academic_operations.sql`:

- **Un lock común para todas las escrituras de notas.** `academic_lock_student_subject(institución, workspace, alumno, materia, carrera)` es un helper interno, sin EXECUTE para roles de la API, que toma `pg_advisory_xact_lock` sobre la identidad académica. Lo llaman las tres escrituras de notas:
  - el docente (`academic_teacher_upsert_student_grade`), antes de leer y escribir;
  - la importación de historia, antes de la comprobación de notas del sistema, que así se vuelve a evaluar bajo el lock;
  - el acta de examen (`exam_save_acta_results`, F1a).
- **`updated_at` con el reloj real.** `touch_academic_operations_updated_at` usa `clock_timestamp()` en lugar de `now()`. La escritura que esperó el lock queda después de la que lo tenía. Antes ganaba la transacción que empezaba más tarde, aunque escribiera antes.

**P2 — legajo de otra carrera.** Si no hay un legajo de esa carrera, el fallback por DNI solo acepta legajos **sin** carrera cargada. Un legajo de otra carrera se rechaza con `ALUMNO_DE_OTRA_CARRERA`, que tiene su mensaje en la app.

**Pruebas.** `validateStudentHistoryImportLocal.mjs` suma estos casos:

- el rechazo `ALUMNO_DE_OTRA_CARRERA`;
- la carrera docente ↔ importación, con dos procesos psql concurrentes y en los dos órdenes:
  - el docente escribe "libre" y mantiene la transacción: la importación espera y se omite;
  - el docente abre la transacción antes y escribe "libre" después de la importación: la nota del docente queda última.

  En ambos casos el alumno **no** puede inscribirse a la mesa.

Contra el SQL anterior (HEAD `eaa0a1d`), el harness reproduce los dos bugs (run `d817e37eb9e0be58`): `historia:regular` queda como última nota y la inscripción da `registered`. Con la corrección: **PASS** (run `1cb4df7952769ddc`, cleanup 0).

**Regresiones PASS:**

| Harness | Run |
|---|---|
| 03.5b | `fca010af590a80e4` |
| F1a | `fff32a0d372d2b6a` |
| QA.1 | `26ec9dd0d104320d` |
| Paridad 03.3 | `b8bc552344b90451` |
| CHECK 03.5c | `299b373b464c9aa1` |
| 06.3 | `c65ebe1d6e60d60a` |
| Publicación | `98f3fc2a718c5049` y `3c7112b5507b7087` |

El harness de publicación forzaba `updated_at` en un INSERT, y el trigger siempre lo pisó. Ahora inserta en orden cronológico (`order by v.at`), que era lo que pretendía. Con `now()` todas las filas empataban; con el reloj real cuenta el orden de inserción.

Efecto colateral aceptado: en la vida real ya no hay empates de `updated_at` entre notas de distintas escrituras. El escenario de paridad "empate updated_at" sigue comparando el servidor con el espejo sobre los mismos datos.
