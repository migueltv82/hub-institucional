# Contrato de reconstrucción local de configuración

Configuración versionada: scripts/localRecoveryConfiguration.mjs. Imagen Auth2.196.0, Storage1.70.7 y PostgREST16.1; PostgreSQL CLI17.6.1.165. Destino únicamente supabase_db_codex-baseline-local-7725bdda, DBgotrue_harness_<16hex>. No hay overrides libres. Los secretos no forman parte del contrato guardado: el caller obtiene el password del rol local estándar y genera JWTsecret efímero en memoria; el builder deriva tokensanon/service_role de ese secreto y los entrega solo a procesos backend por environment. No archivos env con valores, no VITEprivilegiado. No se cambian passwords/grants compartidos.

| Componente | Configuración por nombre | Fuente para reconstrucción | Incluido en pg_dump de DB |
|---|---|---|---|
| Auth | GOTRUE_DB_DATABASE_URL, GOTRUE_JWT_SECRET, GOTRUE_JWT_AUD, GOTRUE_JWT_DEFAULT_GROUP_NAME, GOTRUE_API_HOST/PORT, API_EXTERNAL_URL, GOTRUE_SITE_URL, GOTRUE_DB_DRIVER | Contrato local y credencial estándar del entorno CLI; secretos efímeros para ensayo | No: son environment del servicio; Auth users/identities/history sí son filasDB |
| Storage | DATABASE_URL, AUTH_JWT_SECRET, ANON_KEY, SERVICE_KEY, DB_INSTALL_ROLES, DB_SUPER_USER, STORAGE_BACKEND, STORAGE_FILE_BACKEND_PATH, UPLOAD_FILE_SIZE_LIMIT | Contrato local versionado+credencialStorageCLI+tokens efímeros | No: environment y bytes del volumen quedan fuera; bucket/objects/history sí son filasDB |
| Data API | PGRST_DB_URI, PGRST_DB_SCHEMAS, PGRST_DB_ANON_ROLE, PGRST_JWT_SECRET, PGRST_DB_CONFIG, PGRST_SERVER_HOST/PORT | Contrato local, authenticator estándar y mismo JWT efímero que Auth; public únicamente, overrides DB desactivados | No: environment no forma parte del dump |
| Edge source-file-storage | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SOURCE_FILE_STORAGE_ALLOWED_ORIGINS, ADMIN_USERS_ALLOWED_ORIGINS, ALLOWED_ORIGINS | Runtime/backend y configuración de origins aprobada; secretos gestionados fuera del repo | No: ni el código Edge ni sus environment se recuperan con DBdump |
| Edge admin-users | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY o SERVICE_ROLE_KEY o ADMIN_SERVICE_ROLE_KEY, ADMIN_USERS_ALLOWED_ORIGINS o ALLOWED_ORIGINS | Runtime/backend y configuración aprobada | No; solo sus datos/SQL tienen respaldoDB |
| Frontend | VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY o VITE_SUPABASE_ANON_KEY, VITE_DISABLE_AUTH | Configuración de build y código versionado; solo clave pública, auth habilitado en producción | No: bundle/configbuild no son filasDB |
| SMTP/OAuth externos | Credenciales y callbacks del proveedor que corresponda | Custodia externa del operador; no leídas/copiedas por esta tarea | No: no se certifica recuperación sin esa fuente |

Este inventario es acotado a los componentes reales examinados; no se leyó ningún .env con valores. La DB no respalda roles/passwords globales mediante pg_dump por base; el ensayo reutiliza roles estándar del cluster local y no acredita reconstrucción de roles remotos. La configuración productiva y backups de secretos remotos quedan fuera de este contrato. Edge/frontend no se ejecutan en esta microtarea: su reconstrucción runtime será otra unidad independiente.

Negativos obligatorios: credential/JWTsecret faltante, destino remoto o DBcompartida, imagen incompatible, fieldoverride no permitido: fallo antes de crear recursos. Positivos obligatorios: Auth y Storage reales reconstruidos con este builder, health y sus comprobaciones de DB/API; limpieza final. Resultado de ejecución en LOCAL_CONFIGURATION_RECOVERY_RESULT.md.

