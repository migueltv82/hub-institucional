# Checklist del Día D — implementación real (si la directiva aprueba)

Hoja de ruta en orden, de punta a punta: qué se hace, quién lo hace y cómo se sabe que salió bien. El detalle técnico de cada paso está en `docs/RUNBOOK_PRODUCCION_V1.md`; acá solo se remite a la sección.

**Roles**
- **Miguel:** aprueba cada paso remoto, opera Supabase, Vercel y GitHub, y carga los secretos.
- **Claude:** prepara, revisa salidas y verifica. No escribe en Producción sin el OK puntual de Miguel en el chat.

Regla de corte: si un paso no da el resultado esperado, **se frena**. No se improvisa: se resuelve o se va al rollback (§E).

## A. Días previos (después del sí de la directiva)

| # | Paso | Quién | Resultado esperado |
|---|---|---|---|
| A1 | Pasar Supabase a plan **Pro** con backups diarios y PITR | Miguel | El dashboard muestra la hora del último backup (runbook P10) |
| A2 | Dominio propio con HTTPS en Vercel | Miguel | `curl -I https://<dominio>` → 200 con `Content-Security-Policy` |
| A3 | Secrets `ADMIN_USERS_ALLOWED_ORIGINS` y `SOURCE_FILE_STORAGE_ALLOWED_ORIGINS` con el dominio exacto | Miguel | Pruebas CORS del runbook §5 |
| A4 | Auth: Site URL y Redirect URLs del dominio; signup público apagado | Miguel | Runbook §7 |
| A5 | SMTP propio para los mails de Auth | Miguel | Un reseteo de contraseña llega a una casilla de la institución |
| A6 | Branch protection de `main`; PR `release/v1` → `main` mergeado | Miguel | Runbook P11 y P12 |
| A7 | Auditorías independientes de GATE CORTO cerradas sin P1 abiertos | Codex / Miguel | Tarjetas en HECHO |
| A8 | Pedir a la institución las planillas reales: académica, docentes, alumnos e historia académica | Miguel | Los 4 archivos XLSX |
| A9 | **Prueba en seco de las planillas** (sin base): `node scripts/buildAcademicCatalogSql.mjs --academica … --alumnos … --institucion "x" --salida prueba.sql` | Claude | Sin `errores`; las `advertencias`, leídas y aceptadas. Si hay errores, la institución corrige la planilla antes del día |
| A10 | Avisar a docentes y alumnos el día de inicio y cómo ingresar: docentes con DNI y alumnos con email; la contraseña inicial es el DNI y en el primer ingreso se cambia | Institución | Comunicado enviado |

## B. Día D — actualización de Producción (ventana sin uso)

| # | Paso | Quién | Resultado esperado |
|---|---|---|---|
| B1 | Congelamiento y verificación del destino | Miguel | Runbook §2: ref correcto y versiones de retorno anotadas |
| B2 | Backup previo | Miguel | Runbook §3 |
| B3 | SQL pendiente, uno por vez: `03.5c`, `07`, `08` y `supabase/security/source_file_storage_register_on_institution.sql` | Miguel (Claude verifica) | Cada archivo sin error. La consulta final del último da `instituciones_incompletas = 0`. Firma del RPC de mesas: CLAUDE.md, sección Supabase |
| B4 | Redeploy de la Edge `admin-users` (cubre I2d, I2f, I2g y PB.4) | Miguel | `GET …/functions/v1/admin-users` → **405** (runbook §5) |
| B5 | Deploy del frontend desde `main` | Miguel | Runbook §6: solo las 3 variables y el build con `audit:prod` OK |
| B6 | Security 2 con usuarios sintéticos | Claude, con OK de Miguel | Signup manipulado sin privilegios, escalamiento denegado, cross-tenant 403 y cleanup 0 |
| B7 | **Limpieza de los datos de prueba** (I3) | Miguel (Claude revisa la simulación) | Runbook §8.0: simulación revisada → borrado → `BORRADA: <nombre>` |
| B8 | Smoke post-deploy | Miguel | Runbook §8 sin errores; Logs sin 5xx nuevos |

## C. Día D — carga de la institución real (desde la app)

| # | Paso | Quién | Resultado esperado |
|---|---|---|---|
| C1 | Super Admin → Instituciones → **Crear nueva institución**, con el email del admin del colegio | Miguel | "Institución creada"; guardar la contraseña generada (no se vuelve a mostrar) |
| C2 | El admin entra por "Institución" y sube la planilla **académica** | Admin | "Carga maestra guardada: N materias" |
| C3 | Docentes → sube la planilla de **docentes** | Admin | Aviso con docentes, titularidades y horarios nuevos |
| C4 | Alumnos → sube la planilla de **alumnos** | Admin | Aviso con alumnos e inscripciones a materias |
| C5 | Alumnos → Catálogo académico → elegir la planilla académica → vista previa → **Publicar catálogo** (sin correlativas) | Admin | Vista previa sin errores; resultado "**X de X** alumnos con plan" (X igual en los dos lados) |
| C6 | **Crear accesos** de alumnos y de docentes | Admin | "N accesos creados"; ninguna fila con error |
| C7 | Cursadas y titulares → **Aplicar titularidades** y luego **Inscribir cursadas** | Admin | "0 con error". Las omitidas, revisadas: cada una muestra su motivo |
| C8 | Historia académica → **Importar historia** | Admin | Las rechazadas, corregidas en la planilla y reimportadas: no duplica |
| C9 | Prueba de punta a punta con un docente y un alumno reales (CLAUDE.md, "Prueba funcional") | Admin + 1 docente + 1 alumno | El alumno ve sus materias; el docente lo ve en **Mis materias > Alumnos** con nombre y DNI |
| C10 | Entregar las credenciales. Docente: usuario = DNI, contraseña = DNI. Alumno: usuario = email, contraseña = DNI | Institución | En el primer ingreso cada uno elige su contraseña (no puede contener el DNI) |

## D. Primera semana

- Revisar Supabase → Logs todos los días: Auth, Edge y Postgres sin 5xx nuevos.
- Docentes que olvidan la contraseña: el reset lo hace Super Admin. Volver a "Crear accesos" **no** pisa contraseñas.
- Correlativas: activarlas recién cuando la historia académica esté completa. Se vuelve a publicar el catálogo con la casilla "Con correlativas".
- Primer llamado de mesas: armarlo con la guía de Mesas y actas (`docs/DEMO_GUIDE.md`). El acta la carga el titular desde el día del examen.

## E. Si algo sale mal

| Situación | Qué hacer |
|---|---|
| Falla un SQL a mitad (B3) | Frenar. Runbook §9 (R3 o R4) con el Verificador |
| La Edge no responde 405 o da 5xx (B4) | Runbook §9 R2: redeploy de la versión anterior |
| El frontend no arranca (B5) | Runbook §9 R1: promover el deployment anterior en Vercel |
| La limpieza (B7) aborta | No pasa nada: es una transacción. Leer el código del error (§8.0) y corregir el motivo |
| Errores de carga (C2–C8) | No borrar nada a mano. Corregir la planilla y repetir el paso: todos los pasos se pueden repetir sin duplicar |
| Datos dañados después de la carga | Runbook §9 R4b (reparación puntual) o R4 (restore gestionado), con aprobación de Miguel |
