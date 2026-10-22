# Runbook

## Estado operativo vigente

Baseline local descartable PASS: 9 SQL canónicos aplicados, 40 tablas public con RLS y Staging aplicado/verificado; consultar [baseline](../supabase/baseline/STAGING_BASELINE_RESULT.md) y [validación local](../supabase/baseline/LOCAL_AB_RLS_RPC_RESULT.md). Las instrucciones posteriores de baseline parcial, diseño de RPC pendiente o Staging no inicializado son **HISTÓRICAS / SUPERADAS**, no pasos a repetir ni autorización para reaplicar SQL.

Inscripción canónica: RPC existente/validada, JWT del usuario vía `context.userClient`, `auth.uid() = actor_user_id = target_student_id`, profile/membership/legajo validados por tenant/workspace; no `adminClient`/`service_role` operativo para este flujo. [Contrato vigente](contracts/upsert_exam_enrollment_from_portal.md).

Mesas Docente v1 es read-only certificado en Staging. Confirmación, objeción, reasignación y reconciliación docente quedan DIFERIDAS post-v1; cualquier instrucción histórica para ejecutarlas no aplica al smoke v1. Production sigue **NO-GO**: branch protection remota, backup/restore, rollback, observabilidad, E2E/UAT y release closure pendientes. Vercel READY técnico no implica deploy. `EX-001` vence 2026-10-17; después requiere nueva validación, sin extensión implícita.

Guia operativa para levantar, validar y diagnosticar el proyecto.

## Arranque local

Desde la raiz del repo:

```powershell
cd <ruta-al-repo>
npm install
npm run dev
```

URL:

```text
http://127.0.0.1:4173/
```

Si queres que falle claramente cuando el puerto esta ocupado:

```powershell
npm run dev:strict
```

<a id="puerta-de-calidad-obligatoria-antes-de-merge-y-despliegue"></a>

## Quality Gate antes de merge

Desde la raíz del repo, con las dependencias instaladas, ejecutar **antes de merge a `main` y antes de desplegar la versión candidata**:

```powershell
npm run check
```

En Windows/PowerShell usar `npm.cmd run check` para evitar restricciones de ejecución de `npm.ps1`. En un checkout limpio instalar primero las dependencias del lockfile con `npm ci` (`npm.cmd ci` en PowerShell).

Según `package.json`, la cadena ejecuta en este orden:

1. `npm run audit:repo`: inspecciona archivos seguidos por Git, secretos, artefactos prohibidos y controles estáticos de seguridad.
2. `npm run lint`: ejecuta `eslint .`.
3. `npm test`: ejecuta Vitest una vez con `vitest.config.js`, sin modo watch.
4. `npm run build`: ejecuta `vite build` y, si termina bien, `npm run audit:prod` sobre el `dist/` recién generado.

`audit:prod` por separado requiere un `dist/` existente y no lo reconstruye. Para validar una entrega usar la cadena completa, no una auditoría sobre un build viejo.

Estado esperado:

- Mensaje `[repository-security-audit] OK`.
- ESLint sin errores y suite de Vitest sin fallos.
- Build generado en `dist/` y mensaje `[production-build-audit] OK`.
- Comando completo finalizado con código de salida `0` (`$LASTEXITCODE` en PowerShell).

La cadena usa `&&`: corta en el primer fallo. Las etapas posteriores quedan **sin verificar**, aunque exista un `dist/` de otra ejecución. Ante un fallo: **NO mergear**, identificar la etapa exacta y su causa, corregir el mínimo necesario y volver a ejecutar `npm run check` completo. No omitir auditorías, desactivar reglas ni agregar excepciones para ocultar secretos.

### Qué comprueba cada auditoría

| Script | Entrada y controles | Límites |
| --- | --- | --- |
| `audit:repo` | `scripts/auditRepositorySecurity.mjs`: recorre las rutas de `git ls-files` y lee su contenido actual. Detecta rutas sensibles, binarios fuera de la lista permitida, patrones de claves privadas/Supabase, asignaciones privilegiadas y JWT `service_role`; revisa estáticamente CORS, autorización de Functions y configuración local de Auth. | No recorre archivos nuevos sin tracking ni el historial Git; los patrones no detectan todo secreto posible. No acredita configuración remota ni ejecución segura de la Edge Function. |
| `audit:prod` | `scripts/auditProductionBuild.mjs`: recorre `dist/`; rechaza sourcemaps, fuentes/tests/configuración, herramientas internas, patrones de secretos/JWT privilegiados y referencias a demo. | No compila, no analiza dependencias y no acredita Auth/RLS remotos. Ejecutarlo mediante `build` garantiza un artefacto recién generado. |

Ambos devuelven salida no cero al detectar incumplimientos. En 00.2 se verificaron ocho casos sintéticos en memoria, incluidos archivos sensibles y patrones de secretos; no se usaron credenciales ni archivos `.env` reales y no se modificaron sus reglas.

### Configuraciones y puerta estricta

`lint` usa `eslint.config.js` para JavaScript/JSX y reglas React/hooks; no hay typecheck del frontend ni análisis TypeScript de la Edge Function en esta cadena. Vitest usa `vitest.config.js`, entorno `jsdom` y `src/test/setup.js` (limpieza de componentes y localStorage simulado). El test de postura de `admin-users` inspecciona texto: no ejecuta Deno ni operaciones Auth. `vite.config.js` compila con React/Tailwind, sourcemaps desactivados y chunks de vendors separados. Ninguna de estas configuraciones cambió en 00.2.

El criterio local estable es auditoría, lint, todos los tests y build aprobados, con `check` terminado en `0`; no un conteo fijo de tests. `quality:gate` es actualmente equivalente a `check`. La puerta estricta de `CONSTRAINTS.md` agrega `quality:deps` (`npm audit --audit-level=high`): después de `check`, ejecutar `npm.cmd run quality:deps`, o usar `npm.cmd run quality:full` como cadena combinada sin repetir ambos recorridos costosos. Un `check` verde no aprueba automáticamente dependencias, CI o producción; conservar el tratamiento de `EX-001` y los controles remotos exigidos.

### Diagnóstico de pruebas textuales en Windows

En 00.2 se reprodujo que `adminUsersEdgeFunctionSecurity.test.js` fallaba al buscar un delimitador LF en texto con CRLF/LF mezclados. Ahora normaliza CRLF a LF antes de extraer `persistStudentRecord` y ejecuta las mismas assertions para ambas variantes. Si vuelve a fallar, inspeccionar la extracción y el contrato de seguridad; no modificar producción ni relajar assertions para satisfacer un problema de formato.

Antes de la revisión final, inspeccionar `git status --short` y el diff de los archivos que integrarán el cambio. `audit:repo` usa `git ls-files`: los archivos nuevos sin agregar a Git no entran en su recorrido. Revisarlos antes de agregarlos y repetir el check sobre el conjunto final; no agregar `.env` reales, credenciales ni logs privados.

Guardar fecha, versión, resumen de tests y resultado de cada etapa en la evidencia de la entrega. Los conteos históricos y el estado de la última ejecución se documentan en [preparación para producción](PRODUCTION_READINESS.md). Un check local aprobado no sustituye los flujos remotos ni el checklist go/no-go de ese documento.

## Integración continua en GitHub Actions

Configuración: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). Corre en pull requests cuyo destino es `main` y en pushes a `main`, incluidos cambios solo documentales.

El job `Quality gate (Node 22.13)` usa `ubuntu-latest`, Node `22.13.0`, caché de descargas npm con clave derivada de `package-lock.json` y un límite de 25 minutos. La versión surge de los `engines` reales de las dependencias bloqueadas: Vite y `@vitejs/plugin-react` requieren `^20.19.0 || >=22.12.0`, y `jsdom` requiere `^20.19.0 || ^22.13.0 || >=24.0.0`. La caché no reemplaza `npm ci` ni conserva `node_modules` como instalación validada.

Secuencia exacta: `npm ci` → `npm run check`. El comando `check` ejecuta `audit:repo`, `lint`, `test` y `build` (incluido `audit:prod`) en el mismo orden que la puerta local. Se detiene ante un fallo y no usa `continue-on-error`.

El workflow no define variables `VITE_*`, secretos de GitHub ni `.env` reales. El build actual no necesita `VITE_DISABLE_AUTH=true`; por defecto el modo demo no queda habilitado. No configurar `service_role`, secretos de producción ni credenciales Supabase para este job. No necesita una base Supabase para compilar; el build de CI no es una prueba de integración remota ni un despliegue.

El workflow declara permisos mínimos (`contents: read`), no despliega, no escribe ramas, no aplica SQL, no modifica Supabase y no publica releases. Usa `concurrency` por workflow y PR/ref para cancelar ejecuciones obsoletas de la misma rama sin interferir con otras.

Actualización 2026-10-17: `EX-001` cerrada; `quality:deps` pasa con 0 high/critical (ver `docs/DEPENDENCY_TRIAGE_2026-10-16.md`). Texto anterior: `quality:deps` no forma parte de este CI automático porque `npm audit --audit-level=high` conserva advisories high conocidos y documentados bajo `EX-001` en `CONSTRAINTS.md`. El workflow [`.github/workflows/quality.yml`](../.github/workflows/quality.yml) queda como auditoría manual de dependencias hasta completar una etapa específica de triage/actualización; no resolver esos advisories en tareas de CI.

Para revisar una ejecución, abrir GitHub → Actions → CI → `Quality gate (Node 22.13)` y localizar el primer paso fallido. Registrar su salida sin secretos, corregir la causa y repetir `npm.cmd run check` localmente antes de enviar el cambio. Un paso omitido por un fallo anterior queda sin verificar. Consultar el resultado local vigente en [preparación para producción](PRODUCTION_READINESS.md); crear el workflow no acredita su ejecución remota.

Después de publicar el workflow, comprobar una ejecución real en GitHub y configurar la protección de `main` para exigir el check `Quality gate (Node 22.13)`. No se ha configurado esa protección ni ejecutado GitHub Actions desde esta entrega local.

Referencias: [sintaxis de workflows de GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) y [configuración y caché de setup-node](https://github.com/actions/setup-node).

## Merge a main

1. Crear una rama de trabajo y abrir un Pull Request hacia `main`; no hacer push directo a `main` salvo emergencia documentada.
2. Ejecutar `npm.cmd run check` localmente antes de pedir merge y dejar el resultado en la descripción del PR.
3. Esperar el workflow `CI`; el job esperado es `Quality gate (Node 22.13)`, pendiente de confirmación exacta hasta su primera ejecución remota.
4. Resolver conversaciones y observaciones. Si hay otro colaborador disponible, solicitar revisión humana; si el repo sigue con un único mantenedor, conservar igualmente el PR como trazabilidad.
5. Actualizar la rama con `main` si quedó desfasada y repetir CI.
6. Integrar preferentemente con `squash merge` para cambios pequeños y autocontenidos. No usar `Dependency Audit` como required check mientras `EX-001` siga vigente.
7. Tras el merge, verificar el push a `main`: el workflow `CI` debe quedar verde sobre el commit integrado.

Si CI falla, no mergear. Identificar el primer paso fallido, corregir la causa mínima, volver a ejecutar `npm.cmd run check` localmente y empujar un nuevo commit para que GitHub Actions corra otra vez. Si la auditoría manual de dependencias (`Dependency Audit` / `quality:deps`) falla, tratarla dentro de la etapa específica de dependencias; no convertirla en required check mientras rija `EX-001` ni resolverla con `npm audit fix` en esta etapa.

## Si no inicia

### 1. Confirmar carpeta

```powershell
pwd
```

Debe ser:

```text
<ruta-al-repo>
```

### 2. Reinstalar dependencias

Si aparece un error como `failed to resolve import`, `Cannot find package` o falta `exceljs`:

```powershell
npm install --cache .npm-cache
```

### 3. Revisar puerto

```powershell
Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue
```

Si hay un proceso escuchando, cerrar esa terminal o levantar en otro puerto:

```powershell
npm run dev -- --port 4174
```

### 4. Usar una terminal normal

Si aparece `spawn EPERM` o un problema cargando `@tailwindcss/oxide`, suele ser una restriccion de la terminal/sandbox. Ejecutar desde PowerShell normal o Windows Terminal.

### 5. Revisar variables de entorno

Para modo remoto:

```text
VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_PUBLISHABLE_KEY
VITE_DISABLE_AUTH=false
```

Para modo demo local:

```text
VITE_DISABLE_AUTH=true
```

### 6. Si aparece un error de Environment Guard

La app valida la configuracion publica antes de registrar el service worker, montar React o crear el cliente Supabase. En produccion bloquea:

- `VITE_DISABLE_AUTH=true`;
- falta de `VITE_SUPABASE_URL`;
- falta de `VITE_SUPABASE_PUBLISHABLE_KEY`;
- `VITE_SUPABASE_URL` que no sea HTTPS de Supabase;
- variables `VITE_*SERVICE_ROLE*` no vacias;
- valores `VITE_*` que parezcan `service_role`, `sb_secret` o JWT con rol `service_role`.

Para corregirlo, editar las variables del ambiente correspondiente, reconstruir el despliegue y volver a ejecutar la puerta de calidad. No desactivar el guard, no mover `SERVICE_ROLE_KEY` al frontend y no pegar valores reales en issues, logs ni documentación. Si un secreto llegó a un bundle, rotarlo y retirar/reemplazar ese artefacto.

## Supabase

Schema actual:

```text
supabase/schema/00_README.md
```

El entorno remoto debe tener disponible el bucket privado `workspace-source-files`.
Si la carga de archivos falla, verificar que los bloques necesarios de
`supabase/schema/00_README.md` esten aplicados, que las reparaciones documentadas
en `supabase/docs/` hayan sido reconciliadas contra la fuente canonica y que el
bucket exista en Storage.

Antes de aplicar SQL mutante, seguir:

```text
docs/SECURITY_LOW_RISK_APPLY_CHECKLIST.md
```

No usar `supabase/setup_multi_tenant/`: esa carpeta no existe en este checkout.

### Validacion de metadata y roles de Auth

La etapa 02.3 dejo preparado, no aplicado remotamente, el hardening de `public.handle_new_user()`. Antes de declarar seguro un ambiente remoto:

1. Confirmar que el SQL aplicado de `handle_new_user()` no lee `raw_user_meta_data.account_role`.
2. Crear en staging un usuario con metadata de cliente manipulada intentando `account_role=superadmin` o `admin_instituto`.
3. Verificar que `profiles.account_role` queda como `alumno` o sin privilegios efectivos hasta que un flujo administrativo escriba el perfil.
4. Verificar que `profiles.is_global_admin` no queda verdadero salvo por metadata administrativa/servidor esperada.
5. Crear usuarios reales desde `admin-users` para `admin_instituto`, `alumno` y `docente`, y confirmar `profiles` + `memberships`.
6. Probar login y acceso por rol en dos instituciones de prueba.
7. Registrar evidencia sin correos, DNIs, tokens ni datos personales reales.

No ejecutar esta validacion en produccion ni con usuarios reales. Si un ambiente remoto conserva la version anterior del trigger, tratarlo como NO-GO hasta aplicar y validar el bloque correspondiente en staging.

### Validacion de funciones, RPC y privilegios

La matriz local de referencia esta en:

```text
docs/SECURITY_FUNCTION_MATRIX.md
```

El discovery remoto de drift 02.5 está documentado en:

```text
docs/SUPABASE_DRIFT_AUDIT.md
docs/SUPABASE_READONLY_ACCESS.md
supabase/security/remote_readonly_discovery.sql
```

Si `SUPABASE_DRIFT_AUDIT.md` indica falta de evidencia remota, no aplicar SQL preparado ni reparaciones históricas. Primero obtener acceso read-only suficiente, ejecutar una consulta inocua (`current_database()` / `current_user`) y recién después capturar funciones, privilegios, triggers, RLS, policies y Storage con el script de discovery. No pegar secrets ni datos personales en la documentación.

Estado 02.5 al 2026-09-25: el acceso read-only ya fue recuperado y el discovery remoto se completó sin mutaciones. El resultado es **NO-GO** porque `handle_new_user()` remoto conserva `raw_user_meta_data.account_role`, 12 RPC llamadas por el producto están ausentes y las pruebas negativas por rol/tenant siguen pendientes. No ejecutar `supabase link`, `db push`, migrations ni reparaciones automáticas desde este estado; preparar staging aislado, respaldo y aplicación controlada.

Diagnóstico 02.5-R: si `projects list` funciona pero el ref vinculado no aparece entre los proyectos accesibles, tratarlo como bloqueo de acceso al proyecto vinculado. No ejecutar `supabase link` hacia otro proyecto sin autorización explícita.

### Baseline canónico local — HISTÓRICO / SUPERADO, ver estado vigente

La etapa 02.8A dejó el baseline como investigación local parcial:

```text
supabase/baseline/BASELINE_MANIFEST.md
docs/BASELINE_READINESS.md
```

No ejecutar esos documentos como SQL. No existe todavía un baseline SQL completo ni `supabase/migrations/`. Antes de cualquier prueba contra Supabase local o staging:

1. Resolver o diseñar `get_academic_transition_config`.
2. Resolver o diseñar `upsert_exam_enrollment_from_portal`.
3. Reconciliar el bloque canónico de mesas.
4. Confirmar que Supabase local no contiene trabajo del usuario antes de iniciar, resetear o destruir nada.
5. Ejecutar solo en ambiente descartable y registrar resultados.

Mientras esos puntos sigan abiertos, el estado correcto es:

```text
LOCAL BASELINE EXECUTION PENDING
```

### Selección segura de ambiente Supabase

Estado 02.7 al 2026-09-26:

- Production: `Hub-Institucional`, `ACTIVE_HEALTHY`, región `sa-east-1`, ref `qwrw…mibx`.
- Staging: `Hub-Institucional-Staging`, `ACTIVE_HEALTHY`, región `sa-east-1`, ref `lzjp…aeco`.
- El link local de este checkout sigue apuntando a production.
- La metadata de link vive en `supabase/.temp/`, ignorada por `supabase/.gitignore`.
- `supabase db query` no permite elegir proyecto por `--project-ref`; permite `--linked`, `--local` o `--db-url`.

Regla obligatoria antes de cualquier comando remoto que pueda modificar estado:

```text
TARGET ENVIRONMENT:
PROJECT NAME:
PROJECT REF:
LINK MODE:
COMMAND CLASS:
HUMAN APPROVAL:
```

No alcanza con “está linked”. Cualquier comando con `--linked` debe asumirse contra production mientras `supabase/.temp/project-ref` sea `qwrw…mibx`. Para staging, usar una estrategia explícita que no cambie accidentalmente el link productivo del repo actual. Si la única forma de operar staging fuera `supabase link`, detenerse y documentar el plan antes de hacerlo.

Producción requiere aprobación humana explícita y separada para cada mutación remota, aunque la CLI esté autenticada y el proyecto aparezca `ACTIVE_HEALTHY`.

La matriz de pruebas futuras de staging está en:

```text
docs/STAGING_SECURITY_TEST_MATRIX.md
```

Antes de aplicar SQL o aceptar un ambiente remoto:

1. Listar funciones reales con `pg_proc`, `pg_namespace`, `pg_get_functiondef` y privilegios (`proacl` o `information_schema.routine_privileges`).
2. Comparar cada RPC usada por frontend/Edge Function contra la matriz: `SECURITY DEFINER`, `search_path`, grants/revokes y caller esperado.
3. Probar `anon`, usuario autenticado sin rol, usuario institución A contra institución B y caller autorizado.
4. Confirmar que funciones trigger internas no tienen ejecución directa para `public`, `anon` ni `authenticated`.
5. Revisar las RPC que el código llama pero que no tienen SQL local auditable; no darlas por seguras hasta ver su definición remota.
6. Guardar evidencia sin PII, tokens, URLs privadas ni secretos.

Edge Function de usuarios:

```text
supabase/docs/deploy_admin_users.md
```

Variables seguras:

- Frontend: solo `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_DISABLE_AUTH=false` en Production/Preview.
- Edge Function: `SERVICE_ROLE_KEY` como secret de Supabase.
- Edge Function: `ADMIN_USERS_ALLOWED_ORIGINS` con los dominios autorizados.
- Nunca poner `SERVICE_ROLE_KEY` en `.env` del frontend.
- Nunca poner `sb_secret_*` ni JWT `service_role` en variables `VITE_*`.
- Nunca crear variables frontend `VITE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_SERVICE_ROLE_KEY` ni `VITE_ADMIN_SERVICE_ROLE_KEY`.

Deploy Vercel:

- `vercel.json` ya incluye rewrite SPA y headers de seguridad.
- En Vercel cargar solo `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_DISABLE_AUTH=false`; reconstruir después de cambiar cualquier variable.

Redirects recomendados en Supabase Auth:

```text
http://127.0.0.1:4173
http://127.0.0.1:4173/**
http://127.0.0.1:5173
http://127.0.0.1:5173/**
```

## Prueba manual minima

1. Entrar como superadmin.
2. Crear una institucion.
3. Crear un usuario institucional.
4. Entrar como usuario institucional.
5. Cargar horarios, plan y correlatividades.
6. Generar cronograma.
7. Confirmar una mesa.
8. Editar una mesa manualmente.
9. Exportar XLSX.
10. Recargar la pagina y verificar persistencia.

Checklist completa:

```text
docs/TESTING_CHECKLIST.md
```

## Seguridad

Modelo y checklist:

```text
docs/SECURITY.md
```

Pruebas negativas de RLS y Storage:

```text
supabase/security/student_portal_exam_visibility_tests.sql
```

Ese archivo cubre solo visibilidad de mesas del alumno con actores preparados.
No reemplaza una matriz negativa integral de RLS/Storage por rol, tabla, RPC y
tenant. El archivo historico `supabase/security/rls_negative_tests.sql` no existe
en este checkout; no declarar `SECURITY_TESTS_OK` sin una ejecución real de una
matriz revisada.

## Riesgos conocidos

- `exceljs` genera un chunk grande (`excel-vendor`) por soporte XLSX. Esta separado para no cargarlo dentro del bundle principal.
- La app sigue en JavaScript/JSX. Migrar a TypeScript puede mejorar mantenimiento, pero no es necesario para operar el piloto actual.
