# Examenes

Aplicacion React + Vite para gestionar mesas de examen por institucion, operar padrones academicos y conectar portales reales de alumnos y docentes.

El proyecto funciona en modo local demo y en modo remoto con Supabase multi-tenant.

> Este repo es `examenes`. No mezclarlo con `examenes-v3` / Institutional Hub, que es otro proyecto.

## Que incluye

- Dashboard institucional para administradores.
- Carga de planillas de horarios docentes, plan de estudios, correlatividades, alumnos y docentes.
- Generacion de cronogramas de mesas de examen.
- Confirmacion de mesas, edicion manual y exportaciones.
- Gestion de alumnos: listado, filtros, edicion en modal y baja.
- Gestion de docentes: listado, filtros, edicion en modal y baja.
- Alta masiva de accesos de alumnos desde el padron.
- Alta masiva de accesos docentes desde la planilla de docentes.
- Portal de alumno con dashboard, materias, estado academico, calificaciones e inscripcion a mesas.
- Portal docente con dashboard, materias propias, roster, asistencia y notas.
- Panel Super Admin para instituciones, usuarios, roles, bloqueos y reseteo de contrasenas.

## Producción

- [Preparación para producción](docs/PRODUCTION_READINESS.md): definición del MVP, ambientes, checklist go/no-go y exclusiones del primer release.
- [Alcance obligatorio del primer release](docs/PRODUCTION_SCOPE.md): flujos por rol y criterios verificables de aceptación.

Estos documentos definen los requisitos de salida; no certifican un despliegue ni la aplicación de SQL en producción.

## Stack

- React 19
- Vite
- React Router
- TanStack Query
- Tailwind CSS v4
- Supabase Auth, RLS, Storage y Edge Functions
- ExcelJS, Mammoth y PapaParse para importacion/exportacion
- Vitest + Testing Library

## Arranque local

```powershell
npm.cmd install
npm.cmd run dev
```

URL local:

```text
http://127.0.0.1:4173/
```

Tambien funciona:

```powershell
npm.cmd start
```

## Scripts

```powershell
npm.cmd run dev         # servidor local en 127.0.0.1:4173
npm.cmd run dev:strict  # igual que dev, pero falla si el puerto esta ocupado
npm.cmd start           # alias de npm.cmd run dev
npm.cmd run lint        # ESLint
npm.cmd test            # suite de Vitest
npm.cmd run build       # build de produccion + auditoria de dist
npm.cmd run audit:repo  # revisa archivos trackeados contra secretos y artefactos temporales
npm.cmd run audit:prod  # revisa dist existente; no genera el build
npm.cmd run check       # audit:repo + lint + test + build
npm.cmd run preview     # sirve dist en 127.0.0.1:4174
```

## Variables de entorno

Crear `.env` en la raiz:

```text
VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_PUBLISHABLE_KEY
VITE_DISABLE_AUTH=false
```

Notas:

- `VITE_DISABLE_AUTH=true` deja la app en modo demo local.
- No poner `SERVICE_ROLE_KEY` en `.env` del frontend.
- La `SERVICE_ROLE_KEY` solo va como secret de Supabase Functions.
- La app bloquea el arranque si detecta una `service_role` expuesta con prefijo `VITE_`.

## Roles y accesos

La app enruta automaticamente segun `profiles.account_role`:

- `superadmin`: panel Super Admin.
- `admin_instituto`: dashboard institucional.
- `alumno`: portal de alumno.
- `docente`: portal docente.

Tambien se aceptan aliases internos:

- Alumno: `alumno`, `student`.
- Docente: `docente`, `profesor`, `teacher`.

## Planillas

Desde el dashboard institucional se pueden descargar y cargar estas plantillas.

### Horarios docentes

Define la disponibilidad y carga academica.

Columnas principales:

```text
profesor, carrera, materia, dia, inicio, fin, bloqueo, aula
```

Notas:

- `profesor` debe coincidir con el nombre completo de la planilla Docentes.
- `bloqueo` permite fechas donde el docente no puede integrar mesa.
- Los datos personales del docente no van aca.

### Docentes

Define los datos personales y permite crear accesos docentes.

Columnas principales:

```text
nombre, apellido, dni, telefono, estado
```

Notas:

- El DNI se usa como usuario operativo y contrasena inicial para el portal docente.
- Las materias y horas del portal docente se calculan desde Horarios docentes.

### Alumnos

Define el padron estudiantil y permite crear accesos de alumnos.

Columnas principales:

```text
email, apellido_y_nombre, carrera, anio, dni, legajo, telefono, estado
```

Notas:

- El email se usa como usuario.
- `apellido_y_nombre` permite cargar el nombre completo en una sola columna. Formato recomendado: `Apellido, Nombre`.
- El DNI se usa como contrasena inicial.
- El anio permite ordenar y filtrar la carga masiva dentro de cada carrera.
- En XLSX se puede cargar una hoja por carrera y la carrera se toma del nombre de la hoja.
- En CSV la columna carrera sigue siendo obligatoria.
- El portal de alumno cruza el usuario con el padron por email o id.

### Plan de estudios

Define materias por carrera.

Columnas principales:

```text
carrera, materia, nombre, anio
```

### Correlatividades

Define requisitos previos entre materias.

Columnas principales:

```text
carrera, materia, nombre, correlativas
```

## Dashboard institucional

El dashboard institucional concentra:

- Descarga de plantillas.
- Carga y reemplazo de archivos.
- Limpieza de datasets.
- Alta de accesos de alumnos y docentes.
- Gestion editable de alumnos y docentes.
- Periodo de generacion.
- Generacion de cronograma.
- Exportaciones.
- Indicadores operativos.

Los botones de Inputs son:

- `Seleccionar` cuando no hay archivo.
- `Reemplazar` cuando ya hay archivo cargado.
- `Limpiar` para borrar el dataset.

## Gestion de alumnos

El administrador puede:

- Ver listado.
- Filtrar por nombre, apellido, DNI, carrera y anio.
- Editar datos en modal.
- Borrar registros del padron.

Los cambios se guardan en el snapshot del workspace.

## Gestion de docentes

El administrador puede:

- Ver docentes detectados.
- Filtrar por nombre, DNI, telefono y materia.
- Editar datos personales en modal.
- Borrar un docente.

Importante:

- La ficha personal viene de la planilla Docentes.
- Las materias y horas se toman de Horarios docentes.
- Si se edita o borra un docente y eso afecta horarios, el cronograma queda marcado para regenerar.

## Portales

### Portal de alumno

Incluye:

- Dashboard academico.
- Avance de carrera.
- Materias.
- Estado academico.
- Calificaciones.
- Mesas de examen, con bloqueo de inscripcion si no existe condicion regular vigente.

### Portal docente

Incluye:

- Dashboard docente.
- Horarios.
- Mesas asignadas.
- Materias propias.
- Alumnos inscriptos por materia.
- Carga de asistencia y notas.

Los portales comparten IDs canonicos para materia y carrera:

```text
subject_id = codigo de materia
program_id = nombre de carrera
```

Ejemplo:

```text
subject_id = ING08
program_id = PROFESORADO DE INGLES
```

El slug historico del portal alumno solo queda como referencia visual o legacy.
Las escrituras contra Supabase deben usar IDs canonicos y `student_record_id`
cuando exista.

## Supabase

La configuracion vive en:

```text
supabase/setup_multi_tenant/
supabase/functions/admin-users/
supabase/security/
```

Opcion recomendada en SQL Editor: seguir el flujo documentado en:

```text
supabase/setup_multi_tenant/00_README.md
```

Para una base nueva, ejecutar primero `00_base_schema.sql` y despues las migraciones academicas 01-12 en orden.

`00_base_schema.sql` crea el esquema base: instituciones, perfiles, memberships,
padrones, snapshots, archivos de workspace, bucket de Storage, helpers, RPCs
administrativas, indices y seeds. Las migraciones 01-12 agregan la capa
academica relacional: materias, inscripciones, asistencia, notas, portales y
bloqueo de mesas por condicion regular.

Despues ejecutar:

```text
supabase/security/rls_negative_tests.sql
```

Resultado esperado:

```text
SECURITY_TESTS_OK
```

### Edge Function admin-users

La funcion `admin-users` crea usuarios Auth y administra operaciones seguras sin exponer `service_role` al navegador.

Acciones relevantes:

- `bulk_create_students`
- `bulk_create_teachers`
- `student_portal_mutation`
- `create_tenant_with_admin`
- `create_or_assign_institution_user`
- `set_user_password`

Deploy:

```powershell
npx supabase functions deploy admin-users --project-ref TU_PROJECT_REF --no-verify-jwt
```

Antes del deploy, configurar `SERVICE_ROLE_KEY` y `ADMIN_USERS_ALLOWED_ORIGINS`
como secrets de la funcion. Ver el paso a paso en `supabase/docs/deploy_admin_users.md`.

Si aparece `Accion no soportada: bulk_create_teachers`, falta desplegar la Edge Function actualizada.

## Validacion docente-alumno

Para validar el circuito completo contra Supabase real:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "..."
$env:SUPABASE_TEST_INSTITUTION_ID = "..."
$env:SUPABASE_TEST_WORKSPACE_KEY = "main"
node scripts/validateStudentTeacherRoundTrip.mjs
```

El script inscribe un alumno de prueba, verifica que aparezca en el roster
docente, carga asistencia y nota, comprueba la lectura del portal alumno, cubre
el caso legacy en slug y limpia los datos al final. Usar solo con una
institucion de prueba.

## Snapshot de workspace

El estado operativo se guarda en `workspace_snapshots.payload`.

Claves principales:

```text
horariosDocentes
docentes
planesEstudio
correlatividades
alumnos
students
estadoAcademico
academicStatusRows
enrollments
grades
examEnrollments
academicStatus
uploadedFiles
fechaInicio
fechaFin
cronograma
requiereRegeneracion
```

Para habilitar la clave `docentes` en snapshots existentes:

```sql
update public.workspace_snapshots
set payload = jsonb_set(
  coalesce(payload, '{}'::jsonb),
  '{docentes}',
  coalesce(payload -> 'docentes', '[]'::jsonb),
  true
)
where not (coalesce(payload, '{}'::jsonb) ? 'docentes');

update public.workspace_snapshots
set payload = jsonb_set(
  coalesce(payload, '{}'::jsonb),
  '{uploadedFiles,docentes}',
  coalesce(payload #> '{uploadedFiles,docentes}', 'null'::jsonb),
  true
)
where not (coalesce(payload #> '{uploadedFiles}', '{}'::jsonb) ? 'docentes');
```

## Verificacion

Antes de merge a `main` y antes de desplegar la versión candidata, desde la raíz del repo:

```powershell
npm.cmd run check
```

Estado esperado:

- `audit:repo` OK y ESLint sin errores.
- Suite de Vitest sin fallos; consultar el conteo real de la ejecución.
- Build de producción generado y `audit:prod` OK.
- Cadena completa finalizada con código de salida `0`.

La referencia histórica de README/CLAUDE.md era de aproximadamente 1600 tests (1602 pasando, 2 omitidos, 1604 total en 166 archivos); no es un conteo verificado de la versión actual ni un umbral que permita ignorar fallos.

`check` ejecuta `audit:repo → lint → test → build`; `build` incluye `audit:prod`. Se detiene en el primer fallo y deja las etapas siguientes sin verificar. No hacer merge ni desplegar con un check incompleto. Ver el [procedimiento obligatorio del runbook](docs/RUNBOOK.md#puerta-de-calidad-obligatoria-antes-de-merge-y-despliegue) y la [evidencia de preparación para producción](docs/PRODUCTION_READINESS.md).

La advertencia de chunks grandes por `excel-vendor` y `docx-vendor` es conocida. Esos paquetes pesan por soporte XLSX/DOCX y estan separados del codigo principal.

## Integración continua

El [workflow CI](.github/workflows/ci.yml) se ejecuta en cada push a `main` y en cada PR (apertura, actualización de commits o reapertura), sin filtro de rama destino ni de archivos. Usa Ubuntu, Node 22 y caché npm basada en `package-lock.json`.

Ejecuta `npm ci`, `npm run audit:repo`, `npm run lint`, `npm test` y `npm run build`, en ese orden. El build incluye `audit:prod`. Un fallo detiene los pasos siguientes y marca el job como fallido; no se omiten tests ni controles de secretos.

No requiere secretos de GitHub ni credenciales Supabase. El único env explícito de build es `VITE_DISABLE_AUTH=false`: el modo demo está prohibido en producción. Este workflow verifica el código; no despliega ni valida una base remota.

Para impedir merges con CI fallido, configurar en GitHub la protección de `main` y exigir el check `Calidad (Node 22)`. El archivo YAML no activa por sí solo esa protección. Ver el [procedimiento de CI del runbook](docs/RUNBOOK.md#integración-continua-en-github-actions) y los fallos locales conocidos en [preparación para producción](docs/PRODUCTION_READINESS.md).

## Estructura principal

```text
src/
  App.jsx
  auth/
  pages/
  components/
  components/generadorCronograma/
  hooks/
  services/
  utils/
  modules/alumnos/
  modules/docentes/
  styles/

supabase/
  setup_multi_tenant/
  functions/admin-users/
  security/
  docs/
```

## Runbook breve

Si algo no inicia:

- Confirmar que estas en la raiz del proyecto.
- Ejecutar `npm install`.
- Revisar que el puerto `4173` no este ocupado.
- Usar `npm.cmd run dev:strict` para diagnosticar puerto.
- Verificar `.env`.

Comando habitual:

```powershell
npm.cmd install
npm.cmd run dev:strict
```
