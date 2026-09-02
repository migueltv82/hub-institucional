# Validacion segura Supabase del modulo docente

Este runner valida escritura/lectura real de:

- `teacher_availability_records`
- `teacher_workload_records`

No usar claves reales en archivos commiteados. La `SUPABASE_SERVICE_ROLE_KEY` es solo para scripts locales/backend y nunca debe existir con prefijo `VITE_`.

## Rotacion obligatoria si la service role fue expuesta

La rotacion debe hacerse manualmente desde Supabase Dashboard:

1. Abrir el proyecto en Supabase Dashboard.
2. Ir a `Project Settings`.
3. Entrar en `API`.
4. Usar `Rotate` / `Regenerate service_role key` o rotar el JWT secret segun corresponda.
5. Actualizar solo secretos locales/backend que dependan de esa clave.

No intentar rotar la clave desde el codigo de la app.

## Variables requeridas

Configurar en la sesion local o en `.env.local` ignorado por Git:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_TEST_INSTITUTION_ID=
SUPABASE_TEST_WORKSPACE_KEY=main
```

## Ejecucion local segura

```powershell
$env:VITE_SUPABASE_URL="https://TU_PROJECT_REF.supabase.co"
$env:VITE_SUPABASE_PUBLISHABLE_KEY="..."
$env:SUPABASE_SERVICE_ROLE_KEY="..."
$env:SUPABASE_TEST_INSTITUTION_ID="..."
$env:SUPABASE_TEST_WORKSPACE_KEY="main"

node scripts\validateTeacherAcademicSupabase.mjs

$env:SUPABASE_SERVICE_ROLE_KEY=$null
```

El runner imprime presencia booleana de variables y resultados de validacion. No imprime claves.
