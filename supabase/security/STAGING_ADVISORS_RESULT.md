# Advisors de seguridad de Supabase en Staging — triage

Fecha: 2026-10-17. Lectura read-only con `get_advisors` (categoría read-only de Staging, aprobada). Producción: NONE.

| Lint | Hallazgos | Decisión |
| --- | --- | --- |
| 0011 `function_search_path_mutable` | `public.storage_object_institution_id` | **Corregido en el repo** (HARD.1): `set search_path = ''`. Era la única función del baseline sin `search_path` fijo. Hay un test nuevo que lo exige para todo el baseline y el gateway. Se aplica en Staging con el complemento de STG1. |
| 0028 `anon_security_definer_function_executable` | `get_public_app_status`, `list_active_login_institutions` | Por diseño: la pantalla de login las necesita antes de tener sesión. Devuelven solo mantenimiento y la lista de instituciones activas. |
| 0028 / 0029 | `rls_auto_enable()` | No es del repo: la crea la opción "RLS automático" de la plataforma, como función de event trigger. **Recomendación:** `revoke execute on function public.rls_auto_enable() from anon, authenticated;` en Staging y en la Producción nueva. Es una escritura remota y necesita OK humano. Riesgo bajo: una función de event trigger no se puede invocar como RPC. |
| 0029 `authenticated_security_definer_function_executable` | 21 RPC del baseline, sin contar las de 0028 | Por diseño: cada una valida `auth.uid()`, rol y membership adentro. Ya están cubiertas por los harness locales (03.2, 03.3, 03.5b, 06.3) y por la matriz `supabaseFunctionSecurityMatrix`. |
| 0008 `rls_enabled_no_policy` (INFO) | 6 tablas `exam_*` y 3 `source_file_*` | Por diseño: se acceden solo por RPC o por la Edge con service role. Sin policies, RLS niega todo acceso directo. |
