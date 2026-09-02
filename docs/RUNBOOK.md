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

## Verificacion tecnica

```powershell
npm run check
```

Ese comando ejecuta:

1. `npm run lint`
2. `npm test`
3. `npm run build`

Estado esperado:

- ESLint sin errores.
- suite de Vitest pasando.
- Build generado en `dist/`.

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
