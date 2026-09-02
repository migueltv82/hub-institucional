# Desplegar Edge Function admin-users

La interfaz necesita esta Edge Function para crear usuarios reales de Supabase Auth
y resetear contrasenas usando `auth.admin`.

Project ref:

```txt
TU_PROJECT_REF
```

Tambien necesitas la `service_role key`:

```txt
Supabase > Project Settings > API > service_role key
```

No pongas esa key en `.env` del frontend.

Tambien configurar los origenes web permitidos para CORS. Usar origenes exactos,
sin barras finales y separados por coma:

```txt
ADMIN_USERS_ALLOWED_ORIGINS=http://127.0.0.1:4173,http://127.0.0.1:4174,https://tu-dominio.com
```

En produccion no usar `*`. Si el dominio publico cambia, actualizar este secret
antes de publicar.

La funcion queda desplegada con `verify_jwt=false` para permitir el preflight
`OPTIONS` de CORS. La seguridad no depende de ese flag: el propio codigo exige
header `Authorization: Bearer ...`, valida el usuario contra Supabase Auth y
aplica controles de rol e institucion por accion.

## Con npx en Windows/PowerShell

```powershell
npx.cmd supabase login
npx.cmd supabase secrets set SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY --project-ref TU_PROJECT_REF
npx.cmd supabase secrets set "ADMIN_USERS_ALLOWED_ORIGINS=http://127.0.0.1:4173,http://127.0.0.1:4174,https://tu-dominio.com" --project-ref TU_PROJECT_REF
npx.cmd supabase functions deploy admin-users --project-ref TU_PROJECT_REF --no-verify-jwt
```

## Verificacion

Despues del deploy, esta URL no debe devolver 404:

```txt
https://TU_PROJECT_REF.supabase.co/functions/v1/admin-users
```

Con `GET` puede responder "Metodo no permitido"; eso esta bien. Lo importante es que no sea 404.

El preflight `OPTIONS` debe responder solo si el header `Origin` coincide con
`ADMIN_USERS_ALLOWED_ORIGINS`.

Para probar desde preview local, el origen esperado suele ser:

```txt
http://127.0.0.1:4174
```
