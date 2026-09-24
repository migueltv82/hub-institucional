# Runbook

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

## Puerta de calidad obligatoria antes de merge y despliegue

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

La cadena usa `&&`: corta en el primer fallo. Las etapas posteriores quedan **sin verificar**, aunque exista un `dist/` de otra ejecución. No hacer merge ni desplegar si falla o queda incompleta. Corregir la causa y repetir `npm run check`; no omitir auditorías, desactivar reglas ni agregar excepciones para ocultar secretos.

Antes de la revisión final, inspeccionar `git status --short` y el diff de los archivos que integrarán el cambio. `audit:repo` usa `git ls-files`: los archivos nuevos sin agregar a Git no entran en su recorrido. Revisarlos antes de agregarlos y repetir el check sobre el conjunto final; no agregar `.env` reales, credenciales ni logs privados.

Guardar fecha, versión, resumen de tests y resultado de cada etapa en la evidencia de la entrega. Los conteos históricos y el estado de la última ejecución se documentan en [preparación para producción](PRODUCTION_READINESS.md). Un check local aprobado no sustituye los flujos remotos ni el checklist go/no-go de ese documento.

## Integración continua en GitHub Actions

Configuración: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). Corre en pushes a `main` y PRs de cualquier rama destino al abrirse, recibir commits o reabrirse, incluidos cambios solo documentales.

El job `Calidad (Node 22)` usa `ubuntu-latest`, Node 22, caché de descargas npm con clave derivada de `package-lock.json` y un límite de 20 minutos. La caché no reemplaza `npm ci` ni conserva `node_modules` como instalación validada.

Secuencia exacta: `npm ci` → `npm run audit:repo` → `npm run lint` → `npm test` → `npm run build` (incluye `audit:prod`). Los pasos se detienen ante un fallo, igual que la puerta local. No se usa `continue-on-error`.

El build solo define `VITE_DISABLE_AUTH=false`. No configurar `service_role`, secretos de producción ni `.env` reales para este job. No necesita una base Supabase para compilar; el build de CI no es una prueba de integración remota ni un despliegue.

Para revisar una ejecución, abrir GitHub → Actions → CI → `Calidad (Node 22)` y localizar el primer paso fallido. Registrar su salida sin secretos, corregir la causa y repetir `npm run check` localmente con Node 22 antes de enviar el cambio. Un paso omitido por un fallo anterior queda sin verificar. Los fallos locales ya registrados en [preparación para producción](PRODUCTION_READINESS.md) siguen pendientes; crear el workflow no los resuelve.

Después de publicar el workflow, comprobar una ejecución real en GitHub y configurar la protección de `main` para exigir el check `Calidad (Node 22)`. No se ha configurado esa protección ni ejecutado GitHub Actions desde esta entrega local.

Referencias: [sintaxis de workflows de GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) y [configuración y caché de setup-node](https://github.com/actions/setup-node).

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

## Supabase

Setup multi-tenant:

```text
supabase/setup_multi_tenant/00_README.md
```

El entorno remoto debe tener disponible el bucket privado `workspace-source-files`.
Si la carga de archivos falla, verificar que `00_base_schema.sql` este aplicado,
que las migraciones 01-12 de `supabase/setup_multi_tenant/00_README.md` esten aplicadas
y que el bucket exista en Storage.

Edge Function de usuarios:

```text
supabase/docs/deploy_admin_users.md
```

Variables seguras:

- Frontend: solo variables `VITE_*`.
- Edge Function: `SERVICE_ROLE_KEY` como secret de Supabase.
- Edge Function: `ADMIN_USERS_ALLOWED_ORIGINS` con los dominios autorizados.
- Nunca poner `SERVICE_ROLE_KEY` en `.env` del frontend.
- Nunca crear variables frontend `VITE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_SERVICE_ROLE_KEY` ni `VITE_ADMIN_SERVICE_ROLE_KEY`.

Deploy Vercel:

- `vercel.json` ya incluye rewrite SPA y headers de seguridad.
- En Vercel cargar solo `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_DISABLE_AUTH=false`.

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
supabase/security/rls_negative_tests.sql
```

El resultado esperado es `SECURITY_TESTS_OK` con `failed_count = 0`.

## Riesgos conocidos

- `exceljs` genera un chunk grande (`excel-vendor`) por soporte XLSX. Esta separado para no cargarlo dentro del bundle principal.
- La app sigue en JavaScript/JSX. Migrar a TypeScript puede mejorar mantenimiento, pero no es necesario para operar el piloto actual.
