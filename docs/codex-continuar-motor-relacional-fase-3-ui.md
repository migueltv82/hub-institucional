# Prompt para continuar hub-institucional con Codex — Conectar la UI del motor (Fase 3)

Copiar y pegar todo el bloque de abajo. Requiere haber leído antes `docs/codex-continuar-motor-relacional-fase-2.md` (contexto de la Fase 1 y 2, y la alerta de `.gitignore` — chequeala antes de tocar nada).

---

## Objetivo de esta sesión

Hoy la app **no lee** los datos reales de docentes/materias/alumnos que ya están cargados en el schema relacional nuevo (`careers`, `study_plans`, `subjects`, `teacher_records`, `student_records`, etc., proyecto Supabase `qwrwwansdblcixkjmibx`, institución "Instituto San Miguel", `institution_id = '3f9dd1a0-19b8-462f-bdd8-7e849d90ae04'`). Existe un lector aislado que sí sabe leer esas tablas (`src/utils/examEngine/relationalSource/`, Fase 1 de hoy) y ya está validado contra datos reales con un script de línea de comandos — pero ninguna pantalla de la app lo usa todavía.

**El objetivo de esta sesión es que un admin pueda, desde el navegador, generar una previsualización de cronograma para Instituto San Miguel usando datos reales del schema nuevo** — no un script, la UI de verdad.

## Cómo está conectado hoy (leer antes de tocar nada)

- `src/components/GeneradorCronograma.jsx` es la página principal del producto ("el corazón", según `CLAUDE.md`). Usa el hook `src/hooks/useWorkspacePersistence.js`, que llama a `fetchWorkspaceSnapshot()` (`src/services/workspaceSnapshot.js`) para traer un JSON único por institución (`workspace_snapshots.payload`).
- Ese snapshot se pasa como prop `workspaceSnapshot` a `src/features/exams/ExamEngineV21FieldTestPage.jsx` (línea ~1550 de `GeneradorCronograma.jsx`), que lee de ahí `docentes`, `horariosDocentes`, `docenteMateria`, `planesEstudio`, `cronograma` — **el mismo shape exacto que ya produce** `src/utils/examEngine/relationalSource/buildExamEngineSnapshotFromAcademicSchema.js`.
- `GeneradorCronograma.jsx` es un componente grande que además maneja roster de docentes/alumnos, uploads de Excel, acceso de alumnos, etc. — todo eso sigue atado al modelo viejo (`workspace_snapshots`) y **no hay que tocarlo** en esta sesión.

## Alcance de esta sesión (acotar, no expandir)

Incluye:
- Que `ExamEngineV21FieldTestPage` pueda recibir datos armados por `buildExamEngineSnapshotFromAcademicSchema` en vez de (o además de) `fetchWorkspaceSnapshot`, para instituciones que ya están en el schema nuevo.
- Alguna forma de que un admin logueado dispare esto desde la UI (un botón, una ruta nueva, un toggle — a definir con Miguel, no asumir).

Explícitamente fuera de alcance (no arrancar, mencionar si aparece pero no implementar):
- Guardar el cronograma generado (no hay tablas de "mesas" todavía — es la Fase futura de persistencia, ver `docs/codex-continuar-motor-relacional-fase-2.md`).
- Tocar roster de docentes/alumnos, uploads, o cualquier otra sección de `GeneradorCronograma.jsx` que no sea el flujo de generación de cronograma.
- Romper el flujo existente para instituciones que siguen sobre `workspace_snapshots` (si `examenes`/otras instituciones todavía lo usan, tiene que seguir andando igual).
- Diseñar cómo se completan las 12 materias sin titular o la disponibilidad docente — son datos, Miguel los carga aparte.

## Cómo trabajar

1. Investigar primero cuánto de `GeneradorCronograma.jsx` y `ExamEngineV21FieldTestPage.jsx` depende del shape completo de `workspace_snapshots` (campos que el lector nuevo no produce, como `cronograma` guardado o metadata de uploads) antes de proponer nada.
2. Presentar un plan concreto a Miguel (qué archivos, qué UI nueva o modificada) **antes de escribir código** — no asumir la solución técnica de antemano, hay más de una forma razonable de conectar esto (nueva ruta vs. flag en la existente vs. otra).
3. Preguntarle a Miguel explícitamente si esto es solo para Instituto San Miguel (piloto) o si tiene que convivir con instituciones que siguen en el modelo viejo, antes de decidir si es un flag por institución o una ruta separada.
4. Tests obligatorios para lo que se agregue (convención del proyecto).
5. Antes de cualquier commit: `grep plantillas .gitignore` (deben aparecer las 2 líneas) y `git status` limpio de sorpresas — ver la alerta en `docs/codex-continuar-motor-relacional-fase-2.md`.
6. `npm run check` en verde antes de considerar terminado.
