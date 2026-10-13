# Checklist humano — creación y control de staging

## Estado vigente y uso del checklist

Staging ya existe y fue inicializado/verificado: 9 SQL canónicos aplicados, 40 tablas public con RLS y baseline local descartable PASS. Evidencia: [baseline Staging](../supabase/baseline/STAGING_BASELINE_RESULT.md), [validación local](../supabase/baseline/LOCAL_AB_RLS_RPC_RESULT.md) y [Security 1](../supabase/baseline/STAGING_SECURITY_1_RESULT.md). Security acceptance conserva sus límites; Portal Docente v1 read-only certificado no habilita decisiones docentes.

El estado 02.7 de schema no desplegado, conexión pendiente y Staging no inicializado es **HISTÓRICO / SUPERADO** por esa evidencia. Las acciones de creación conservadas debajo son un procedimiento de referencia, no instrucciones para recrear ni reaplicar el entorno vigente. Las precondiciones ya acreditadas se distinguen de las verificaciones aún pendientes de release.

Production sigue **NO-GO**. Frontend aún no desplegado; Vercel READY técnico. Candidato Git reproducible, proyecto/origin web Staging, CORS real, backup/restore, rollback, observabilidad, E2E/UAT y release closure pendientes; branch protection remota no verificada/configurada. Este documento no autoriza mutaciones.

Fecha: 2026-09-26. Este checklist es para una etapa futura. **No ejecutar en 02.6.** No crea staging por sí solo y no autoriza mutaciones en producción.

Objetivo: crear un ambiente staging aislado, reproducible, sanitizado y seguro para validar el hardening 02.3, reconciliar drift y ejecutar pruebas negativas sin tocar datos reales.

## Estado 02.7 — HISTÓRICO / SUPERADO por la inicialización acreditada

El usuario creó manualmente `Hub-Institucional-Staging` desde Supabase Dashboard. Verificación CLI metadata/read-only del 2026-09-26:

- Production: `Hub-Institucional`, `ACTIVE_HEALTHY`, región `sa-east-1`, ref `qwrw…mibx`, link local activo.
- Staging: `Hub-Institucional-Staging`, `ACTIVE_HEALTHY`, región `sa-east-1`, ref `lzjp…aeco`, sin link local.
- Las refs son distintas; no hay identidad de entorno ambigua.
- No se ejecutó `supabase link`, no se cambió `.env`, no se cargó schema, no se desplegaron Edge Functions, no se modificó Auth/RLS/Storage/datos/secrets.
- `supabase db query` no ofrece selección directa por `--project-ref`; sin `db-url` válido y sin cambiar el link, la conexión SQL read-only a staging queda pendiente.
- Estado de schema: `HUB APPLICATION SCHEMA: NOT DEPLOYED` como estado operativo documentado; no fue comprobado por catálogo SQL porque no se ejecutó conexión a staging sin `db-url` ni relink.

Estado operativo posterior a 02.7: el proyecto staging existe y está aislado, pero todavía no está inicializado con el schema del Hub ni con seeds sintéticos.

## Reglas antes de empezar

- No usar datos personales reales.
- No copiar objetos de Storage productivos.
- No reutilizar service-role productiva.
- No pegar secrets en chat, docs, issues ni logs.
- No ejecutar `db push` contra producción.
- No ejecutar `supabase link` sobre el repo actual sin confirmar el ambiente objetivo.
- No crear usuarios reales de alumnos/docentes/familias.
- No habilitar `VITE_DISABLE_AUTH=true` en un deploy público.
- Antes de cualquier mutación remota, confirmar y registrar `TARGET ENVIRONMENT`, `PROJECT NAME` y `PROJECT REF`.
- El link local por sí solo no es evidencia suficiente del destino.
- Mutaciones sobre production requieren aprobación humana explícita y separada.

## Acciones en Supabase Dashboard / consola

| # | Qué hacer | Por qué | Riesgo | Qué NO copiar de producción | Cómo verificar |
| ---: | --- | --- | --- | --- | --- |
| 1 | Elegir estrategia: proyecto Supabase separado o branch persistente de Supabase. | Staging debe estar aislado y tener credenciales propias. | Elegir un ambiente efímero puede borrar evidencia; elegir producción por error puede mutar datos reales. | No reutilizar el proyecto `Hub-Institucional` como staging. | Nombre visible contiene `staging`; URL/ref diferente al productivo. |
| 2 | Crear proyecto/branch con nombre inequívoco: `Hub-Institucional-Staging`. | Evita confusión operativa. | Nombres ambiguos inducen deploys al ambiente equivocado. | No copiar nombres de tenants reales como datos. | Dashboard muestra proyecto staging separado. |
| 3 | Elegir región deliberadamente. | Debe ser compatible con latencia/costo y restauración futura. | Cambiar región luego puede ser costoso. | No asumir que debe ser copia exacta si hay motivo técnico. | Región registrada en worklog. |
| 4 | Guardar ref/URL staging en gestor seguro, no en docs. | El repo solo debe contener placeholders o refs enmascarados. | Exponer refs no es equivalente a secret, pero facilita errores operativos. | No commitear `.env` real. | `.env` real permanece fuera de Git. |
| 5 | Configurar Auth staging con signup/anónimo deshabilitado salvo prueba controlada. | Reproduce postura productiva segura. | Signup abierto puede permitir altas inesperadas. | No copiar usuarios reales. | Dashboard Auth muestra signup/anónimo en estado esperado. |
| 6 | Configurar redirect URLs staging/local. | Login debe funcionar sin abrir dominios ajenos. | Redirect amplio puede facilitar abuso. | No copiar dominios productivos si no se usarán en staging. | Login staging redirige solo a dominios esperados. |
| 7 | Crear secrets de Edge Function para staging. | `admin-users` necesita secrets server-side propios. | Reusar service-role productiva rompe aislamiento. | `SERVICE_ROLE_KEY` productiva; origins productivos innecesarios. | Secrets existen en staging; valores no aparecen en repo ni logs. |
| 8 | Definir `ADMIN_USERS_ALLOWED_ORIGINS` staging. | CORS debe limitar llamadas al frontend staging/local. | Wildcard `*` expone superficie innecesaria. | No copiar `*`; no mezclar dominios productivos sin decisión. | Preflight acepta staging y rechaza origen no autorizado. |
| 9 | Crear bucket staging `workspace-source-files` privado. | Storage debe probarse sin objetos productivos. | Bucket público expone fixtures o futuros datos. | No copiar archivos productivos. | Bucket `public=false`; objetos iniciales sintéticos o vacío. |
| 10 | Aplicar schema staging desde artefactos reconciliados. | Staging debe demostrar reproducibilidad desde Git. | SQL manual no versionado recrea drift. | No usar dumps productivos con datos. | Discovery staging coincide con baseline esperado. |
| 11 | Cargar configuration seed no personal. | La app necesita configuración mínima. | Config vieja puede activar flujos incompletos. | No copiar settings con nombres/dominios reales si no hacen falta. | `app_settings` staging contiene solo claves aprobadas. |
| 12 | Cargar seed sintético multi-tenant A/B. | Necesario para pruebas RLS/cross-tenant. | Fixtures incompletos dan falsos PASS. | No copiar alumnos/docentes/DNI/emails reales. | Existen instituciones A/B, roles, materias y archivos sintéticos. |
| 13 | Crear identidades ficticias. | Auth/RLS/RPC deben probarse con sesiones reales. | Usar cuentas reales contamina evidencia. | No copiar usuarios reales ni contraseñas reales. | Cada identidad puede iniciar sesión y su perfil/membership es correcto. |
| 14 | Desplegar `admin-users` staging solo después de secrets. | Evita función desplegada con configuración incompleta. | Deploy sin secrets puede fallar o loguear errores confusos. | No usar service-role productiva. | Health/preflight y rechazos negativos funcionan. |
| 15 | Configurar frontend staging con variables públicas staging. | Evita que la UI de staging apunte a producción. | Un deploy staging contra producción puede mutar datos reales. | No usar URL/key productivas; no usar service-role. | Banner staging visible y Network apunta al ref staging. |
| 16 | Ejecutar discovery read-only en staging. | Confirma schema/grants/RLS/Storage antes de pruebas. | Saltarlo oculta drift inicial. | No ejecutar SQL mutante como “diagnóstico”. | Reporte read-only guardado sin secrets/PII. |
| 17 | Ejecutar prueba 02.3: exploit metadata. | Debe demostrar que el fix bloquea escalada. | Probar en producción crearía usuarios reales. | No usar correos reales. | Usuario atacante no obtiene privilegios. |
| 18 | Ejecutar matriz negativa RLS/RPC. | Demuestra aislamiento por rol/tenant. | Matriz incompleta da falso GO. | No usar datos reales. | Tabla de resultados PASS/FAIL por actor y recurso. |
| 19 | Ejecutar pruebas Storage. | Bucket privado y paths tenant son críticos. | Cross-tenant de archivos puede filtrar fuentes. | No copiar archivos productivos. | Unauthorized/cross-tenant fallan; same-tenant permitido según rol. |
| 20 | Registrar evidencia y decisión GO/NO-GO. | Producción no debe depender de memoria o capturas dispersas. | Evidencia con secrets/PII expone datos. | Tokens, connection strings, DNIs, emails reales. | Worklog y docs registran resultado con evidencia segura. |

## Verificación mínima posterior a creación

Antes de llamar “staging listo”:

- Proyecto staging visible y distinto de producción. En 02.7: verificado (`Hub-Institucional-Staging`, `lzjp…aeco`) frente a production (`Hub-Institucional`, `qwrw…mibx`).
- URL y publishable key staging configuradas solo donde corresponde.
- No hay datos reales.
- Bucket privado existe.
- Auth signup/anónimo según postura definida.
- `admin-users` staging tiene secrets propios.
- `handle_new_user()` staging no lee `raw_user_meta_data.account_role`.
- Las 12 RPC ausentes están resueltas o explícitamente deshabilitadas por feature flag.
- `anon`/`authenticated EXECUTE` está reconciliado.
- Matriz RLS/RPC negativa pasa.
- `npm.cmd run check` pasa sobre el commit candidato.

## Stop conditions

Detener la creación o promoción si:

- Hay duda sobre qué proyecto es production.
- Se detecta una key productiva en staging.
- Aparece PII real en seed, Storage o logs.
- `handle_new_user()` sigue vulnerable.
- Una prueba cross-tenant devuelve datos.
- Un usuario bloqueado puede leer/escribir.
- Un deploy frontend staging apunta a production.
- No existe backup/restore probado antes de preparar producción.

