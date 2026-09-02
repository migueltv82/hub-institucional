# Handoff

## Actualizacion - validateStudentTeacherRoundTrip

### Cambios realizados

- Se creo `scripts/validateStudentTeacherRoundTrip.mjs`.
- El script sigue el patron de `scripts/validateTeacherAcademicSupabase.mjs`: lee `.env`/`.env.local`, exige `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_TEST_INSTITUTION_ID` y `SUPABASE_TEST_WORKSPACE_KEY`, y solo imprime presencia booleana de variables.
- Usa `SUPABASE_SERVICE_ROLE_KEY` solo dentro del script local para preparar/limpiar datos y llamar la RPC del portal; las lecturas docente/alumno se hacen con sesiones Auth reales creadas para la prueba.
- Valida inscripcion canonica `ING08` / `PROFESORADO DE INGLES` con `student_record_id`, roster docente por el mismo patron de `subjectRoster.js`, carga de asistencia/nota, lectura segura del alumno y caso legacy `profesorado-de-ingles:ing08` normalizado a canonico antes de entrar al roster.
- Limpia usuarios Auth, perfiles, membresias, padrones, titularidad, inscripciones, clase, asistencia, nota, filas de snapshot agregadas para el caso legacy y auditoria asociada a los IDs de prueba.
- Se completo el fix EPERM pendiente en `scripts/examEngineAudit/applyV2SubjectCodeReview.test.js`: ahora usa `tmpdir()` en vez de `C:/tmp`.

### Como correrlo

```bash
node scripts/validateStudentTeacherRoundTrip.mjs
```

Requiere las mismas variables locales que la validacion docente:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_TEST_INSTITUTION_ID`
- `SUPABASE_TEST_WORKSPACE_KEY`

### Primera ejecucion

La primera ejecucion no llego a tocar Supabase porque faltan variables locales:

- `SUPABASE_SERVICE_ROLE_KEY`: ausente
- `SUPABASE_TEST_INSTITUTION_ID`: ausente
- `SUPABASE_TEST_WORKSPACE_KEY`: ausente

Resultado del script: `FALLA - Validar variables de entorno locales`; cleanup `OK`.

### Validacion

`npm.cmd run check` paso completo:

- Lint: OK.
- Tests: 166 archivos passed; 1599 tests passed; 2 skipped; 1601 total.
- Build: OK.

Advertencia pendiente: Vite informa chunks grandes despues de minificar, sin romper el build.

## Cambios realizados

- Se quito de `.claude/settings.json` el permiso de smoke que incluia credenciales en texto plano.
- Se movio ese permiso a `.claude/settings.local.json`, que queda como configuracion local no versionada.
- Se agrego `.claude/settings.local.json` a `.gitignore`.
- Se reemplazaron en `docs/RUNBOOK.md` las rutas absolutas obsoletas por el placeholder `<ruta-al-repo>`.
- Se verifico que `.env` esta cubierto por `.gitignore`.
- Se reviso `git ls-files | findstr /i "env secret key"`: los candidatos trackeados son `.env.example`, `src/lib/envGuards.js` y `src/lib/envGuards.test.js`; no contienen claves reales, solo placeholders/guards/tests.

## Motivo

Evitar que una credencial operativa quede en un archivo versionado y alinear la documentacion con la regla del proyecto de no usar rutas absolutas de una PC.

## Validacion

`npm.cmd run check` fallo dentro de la sandbox por `EPERM` al crear carpetas temporales en `C:/tmp`. Se reintento fuera de la sandbox y paso completo:

- Lint: OK.
- Tests: 166 archivos passed; 1599 tests passed; 2 skipped.
- Build: OK.

Advertencia pendiente: Vite informa chunks grandes despues de minificar, sin romper el build.

## Pendiente operativo

Cambiar la contrasena expuesta en Supabase y actualizar el valor local correspondiente en `.claude/settings.local.json`.
