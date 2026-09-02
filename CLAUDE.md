# CLAUDE.md — Proyecto `examenes`

Contexto permanente del repo. Leer esto antes de tocar código.

## Qué es

App de gestión académica para institutos terciarios argentinos (Academia Genia).
Tres partes que comparten la misma base Supabase:

1. **Generador de cronogramas / motor de mesas de examen** — arma tribunales aplicando reglas institucionales. Es el corazón del producto.
2. **Portal docente** (`src/modules/docentes/`) — materias propias, alumnos inscriptos, asistencia, notas.
3. **Portal alumno** (`src/modules/alumnos/`) — materias, estado académico, calificaciones, inscripción a mesas.

Multi-tenant: cada instituto es una `institution`. Hay un panel Super Admin aparte (`src/pages/SuperAdmin*`).

> Existe un repo separado `examenes-v3` (Institutional Hub), que es una reescritura en TypeScript. **No es este.** No mezclar convenciones ni migraciones entre los dos.

## Stack

React 19 + Vite 8 + **JavaScript/JSX puro, sin TypeScript** · Tailwind 4 · Zustand · TanStack Query 5 · react-router-dom 7 · Supabase JS 2 · Vitest 4 + Testing Library · exceljs / jspdf / papaparse / mammoth para import-export.

No migrar a TypeScript. Es una decisión tomada: el piloto opera bien en JS y la migración no aporta ahora.

## Comandos

Windows. En PowerShell hay que usar **`npm.cmd`**, no `npm`.

```powershell
npm.cmd run dev        # http://127.0.0.1:4173/
npm.cmd run dev:strict # falla claro si el puerto está ocupado
npm.cmd run preview    # http://127.0.0.1:4174/
npm.cmd run check      # lint + test + build — correr esto antes de cualquier commit
```

`npm run check` es la puerta de calidad, y **corta en el primer fallo**: si los tests fallan, el build no llega a correr y su estado queda desconocido. Estado esperado hoy: ESLint limpio, 1602 tests pasando en 166 archivos (2 skipped, 1604 total), build OK. Vite avisa que algunos chunks superan 500 kB minificados; es cosmético, no bloquea.

Si falla el arranque con `spawn EPERM` o problemas con `@tailwindcss/oxide`, es restricción de terminal: usar PowerShell normal o Windows Terminal, no una sandbox.

**Tests y rutas temporales:** nunca hardcodear `C:/tmp` ni ninguna ruta absoluta en un test. Windows deniega escribir en la raíz del disco y el test falla con `EPERM`. Usar `mkdtempSync(join(tmpdir(), 'prefijo-'))` con `tmpdir()` de `node:os`.

## Formato canónico de materia y carrera — LA regla que más se rompe

Docentes, Supabase y el motor trabajan con **formato canónico**:

```
subject_id  = código de materia        → "ING08"
program_id  = nombre de carrera        → "PROFESORADO DE INGLES"
```

El portal alumno históricamente usaba slugs internos (`profesorado-de-ingles:ing08`, `profesorado-de-ingles`). Eso hacía que una inscripción cargada desde el portal alumno no le apareciera al docente.

**Regla actual:** todo lo que se escribe o se lee contra Supabase va en canónico. El slug sobrevive solo como `portal_subject_id`, para uso visual/legacy del lado del alumno. Nunca se compara ni se persiste por slug.

Los campos en juego, en `studentPortalData.js` y en las tablas:

- `canonical_subject_id` / `canonical_program_id` — la verdad
- `portal_subject_id` — referencia visual del alumno, `carrera-slug:materia-slug`
- `student_record_id` — enlaza el alumno con su legajo; mandarlo siempre que exista

`studentPortalData.js` normaliza datos legacy en slug hacia canónico al leer. Si agregás una comparación de materia o carrera en cualquier lado, compará por `canonical_*`, nunca por el id crudo.

## Condición regular para inscribirse a mesa — quién decide

Desde la fase 12, un alumno solo puede inscribirse a una mesa si la **última condición no-`pending` cargada por el docente** en `student_grades` para esa materia es `regular`. Si no hay condición cargada, o si es `libre`, `promocionado`, `approved` o `failed`, la inscripción se rechaza.

**La autoridad es el RPC `upsert_exam_enrollment_from_portal`.** Es el único lugar donde la regla decide de verdad, porque es el único que el alumno no puede saltear.

`src/modules/alumnos/lib/examEligibility.js` **espeja** esa regla en el front, para poder explicarle al alumno por qué el botón está deshabilitado antes de que lo apriete. No es una segunda fuente de verdad: es una copia que existe por UX.

Por eso el espejo tiene que comparar **exactamente igual que el SQL**: match exacto de `subject_id` y `program_id`, sin normalizar mayúsculas ni tildes, y sin tratar una carrera vacía como comodín. Si el espejo es más permisivo que el RPC, la UI habilita algo que el servidor después rechaza — el peor bug posible de diagnosticar. Al tocar cualquiera de los dos lados, tocar el otro y agregar el test.

Mismo criterio para la validación replicada en `supabase/functions/admin-users/index.ts`: es defensa en profundidad, no la fuente de verdad.

## Arquitectura — reglas que ya están decididas

- **Los componentes no hablan con Supabase.** Todo acceso a red o persistencia pasa por `src/services/` o por los `services/` del módulo. Si un `.jsx` importa el cliente de Supabase, está mal.
- **La lógica de negocio testeable no vive en JSX.** Va a `src/utils/`, `src/hooks/` o `services/`.
- **Los tests viven al lado del módulo** (`archivo.test.js` junto a `archivo.js`). Agregar tests siempre que se toque motor, persistencia, parseo, roles o exportaciones.
- No duplicar carpetas para el mismo módulo. Ya se retiró una duplicación (`src/components/cronograma/`); no reintroducirla.
- Mapa completo de responsabilidades: `docs/PROJECT_STRUCTURE.md`.

## Supabase

Project ref: usar `TU_PROJECT_REF` o una variable local; no commitear refs reales.

`supabase/setup_multi_tenant/` es la **única fuente de verdad** del SQL. Migraciones numeradas, se ejecutan en orden en el SQL Editor:

```
01_academic_relational_tables        07_subject_teacher_assignment_active_unique
02_academic_transition_controls      08_teacher_source_display_fields
03_academic_portal_rpc               09_subject_enrollments_subject_id_text
04_student_portal_secure_read        10_academic_student_id_profile_fks
05_teacher_gradebook                 11_academic_portal_student_record_id
06_subject_teacher_assignment_role   12_academic_exam_enrollment_student_record_and_condition  ← última aplicada
```

El repo **no puede saber** si una migración ya se ejecutó en el SQL Editor. Para confirmarlo hay que preguntarle a la base. Para el RPC de mesas:

```sql
select p.oid::regprocedure as firma_actual
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'upsert_exam_enrollment_from_portal';
```

Cómo leer el resultado:

- **Una fila, catorce parámetros**, con `uuid` en la quinta posición (`target_student_record_id`) → fase 12 aplicada. Es el estado actual.
- **Una fila, trece parámetros** → la 12 no corrió; el front ya manda el parámetro nuevo y el portal alumno rompe.
- **Dos filas** → quedaron las dos firmas conviviendo; hay que dropear la vieja a mano.
- **Cero filas** → la función no existe en ese esquema, o se está consultando el proyecto equivocado.

Ojo con confundir salidas del SQL Editor: ejecutar una migración también responde `Success. No rows returned`, porque es DDL y no devuelve filas. Eso **no** es el resultado de la consulta de verificación. Correr la verificación aparte y leer la tabla que devuelve.

Al agregar una migración: crear el archivo numerado siguiente **y** actualizar `00_README.md`. Para bases nuevas ejecutar primero `00_base_schema.sql` y despues las migraciones 01-12 en orden desde el SQL Editor. Rollback: `99_academic_transition_rollback_to_snapshot.sql`.

Después de tocar RLS, correr `supabase/security/rls_negative_tests.sql`. Resultado esperado: `SECURITY_TESTS_OK` con `failed_count = 0`.

**Edge Function `admin-users`** (`supabase/functions/admin-users/index.ts`) — crea usuarios de Auth y resetea contraseñas del lado servidor. Después de modificarla hay que redeployarla. Verificación rápida: `GET https://TU_PROJECT_REF.supabase.co/functions/v1/admin-users` debe devolver **405** (no 404); 405 confirma que está publicada.

## Seguridad — innegociables

- `SUPABASE_SERVICE_ROLE_KEY` va **solo** como secret de Supabase Functions o en scripts locales. Nunca en `.env` del frontend, nunca con prefijo `VITE_`. `src/lib/envGuards.js` rompe el arranque si detecta `VITE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_SERVICE_ROLE_KEY` o `VITE_ADMIN_SERVICE_ROLE_KEY`.
- `VITE_DISABLE_AUTH=true` es solo modo demo local; los env guards lo bloquean en producción.
- `ADMIN_USERS_ALLOWED_ORIGINS` debe estar configurado como secret antes de publicar.
- No commitear credenciales reales en ningún archivo. `.claude/settings.json` y `.claude/settings.local.json` están en `.gitignore` justamente por esto: es fácil dejar una credencial inline dentro de una regla de permisos `Bash(...)`.
- Si la service_role se expuso: rotarla a mano desde Supabase Dashboard → Project Settings → API. No se rota desde el código.
- Si una credencial llegó a un commit, **primero rotar la credencial**, después limpiar el repo. Reescribir la historia sin rotar no arregla nada; rotar sin limpiar la historia ya deja el string inservible. Antecedente: la contraseña del tenant de smoke test quedó en el commit `cc61c0a` y se rotó.

Antes de un commit, chequeo rápido de secretos: `git log --all --oneline -S"<string>"` para el string sospechoso, y revisar que no haya `.env` ni `.claude/settings.json` en el índice.

Variables del frontend, únicas tres en Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_DISABLE_AUTH=false`.

## Convenciones de la casa

- Todo en español, sin tildes en identificadores de código.
- Rutas relativas en la documentación, nunca rutas absolutas de una PC.
- Reglas institucionales de mesas (mitad más uno, no citar dos carreras el mismo día, no mover titularidades) viven en el motor, no en la UI.

## Prueba funcional de punta a punta

Cuando se toca la conexión docente↔alumno, verificar a mano:

1. Entrar como alumno real e inscribirse a una materia.
2. Entrar como docente de esa materia.
3. El alumno debe aparecer en **Mis materias > Alumnos** con nombre y DNI.
4. Cargar asistencia y nota.
5. Volver como alumno: materias, estado académico y calificaciones deben reflejarlo.

Checklist más amplia: `docs/TESTING_CHECKLIST.md`. Operación y diagnóstico: `docs/RUNBOOK.md`.

### Validador automático

`scripts/validateStudentTeacherRoundTrip.mjs` hace ese circuito completo contra Supabase real: crea usuarios de Auth, legajo, asignación docente, inscripción, sesión de clase, asistencia y nota, verifica el roster del lado docente y la lectura del lado alumno, cubre el caso legacy en slug, y limpia todo al final.

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "..."
$env:SUPABASE_TEST_INSTITUTION_ID = "..."
$env:SUPABASE_TEST_WORKSPACE_KEY = "main"
node scripts/validateStudentTeacherRoundTrip.mjs
```

Las variables de sesión de PowerShell se pierden al cerrar la ventana, que es lo que se quiere para la service role. Alternativa: `.env.local`, que está gitignoreado.

⚠️ **Escribe filas reales en la institución que le apuntes con `SUPABASE_TEST_INSTITUTION_ID`, y la limpieza es best-effort.** Cada paso de cleanup traga su error y lo reporta al final, así que un corte a mitad de camino deja datos huérfanos. Usar una institución de prueba, nunca la de producción.

## Documentación viva

| Archivo | Para qué |
|---|---|
| `docs/PROJECT_STRUCTURE.md` | dónde vive cada responsabilidad |
| `docs/RUNBOOK.md` | levantar, validar, diagnosticar |
| `docs/SECURITY.md` | modelo de seguridad y riesgos residuales |
| `docs/TESTING_CHECKLIST.md` | prueba manual completa |
| `docs/WORKLOG.md` | horas y valor del producto |
| `supabase/setup_multi_tenant/00_README.md` | orden de migraciones |

Al terminar un bloque de trabajo, sumar la entrada correspondiente a `docs/WORKLOG.md`.
