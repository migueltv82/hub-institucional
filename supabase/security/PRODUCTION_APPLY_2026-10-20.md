# Producción — aplicación de 07, 08 y registro de recursos de Storage (2026-10-20)

**Aplicó:** Miguel, desde el SQL Editor, en este orden:
1. `supabase/schema/07_academic_operations.sql` (incluye 03.5c);
2. `supabase/schema/08_exam_tables.sql`;
3. `supabase/security/source_file_storage_register_on_institution.sql`.

**Verificó:** Claude, por el conector de Supabase, solo con consultas de lectura. Proyecto `lzjp…aeco`.

## Antes
- Diagnóstico: 0 filas no canónicas en `student_grades`.
- No existían `academic_admin_publish_catalog`, `exam_save_acta_results`, `exam_results` ni el trigger de registro.
- Firma del RPC de mesas: 14 parámetros.
- Por el conector solo se aplicó la parte inicial idempotente de 07 (tablas y columnas si faltan, ya existían). Dos bloques más grandes se cortaron por el límite de 60 s del conector sin confirmar nada. Por eso la aplicación pasó al SQL Editor.

## Método de verificación
Se calcula una huella por objeto de los tres archivos y se compara contra una base local descartable (stack de `scripts/localSupabaseStack.mjs`) con los mismos archivos. La comparación usa los valores esperados embebidos en la consulta, así que Producción devuelve solo las diferencias. Cubre:
- **33 funciones:** md5 de `pg_get_functiondef`, `SECURITY DEFINER`, `search_path` y `EXECUTE` de anon, authenticated y service_role.
- **13 tablas:** constraints con su estado de validación, índices, policies, triggers, privilegios efectivos y RLS.
- El trigger de `institutions`.

La huella se probó en local antes de usarla: da 0 diferencias en limpio y detecta un cambio deliberado en una función.

## Resultado
| Control | Resultado |
|---|---|
| Huella de 99 objetos | 94 iguales y 5 con policies que solo difieren al imprimirse (ver abajo) → **99/99** |
| Funciones (33) | idénticas al repo, con la misma seguridad y los mismos grants |
| 03.5c `student_grades_academic_status_check` | existe y está **validado** |
| Firma del RPC de mesas | una sola, **14 parámetros**, `uuid` en la quinta posición |
| `instituciones_incompletas` | **0** |
| `exam_results` | creada, sin acceso directo para anon ni authenticated |
| Datos | sin cambios: 1 institución, 6 usuarios, 3 notas, 3 cursadas, 1 mesa, 1 inscripción |

Las 5 diferencias de policies (`members read` de `student_grades`, `subject_enrollments`, `subject_attendance_records` y `subject_class_sessions`, y `teacher read own` de `exam_teacher_assignments`) son solo de impresión. La sesión local tiene `auth` en el `search_path` y escribe `uid()`; Producción escribe `auth.uid()`. Recalculadas en Producción con esa única sustitución, las 5 coinciden. Además, las policies de lectura tienen el mismo md5 que en el snapshot de drift tomado antes de aplicar: RLS no cambió.

## Pendiente
- Redeploy de la Edge `admin-users`. Espera la reauditoría de I2f; la corrección de su FAIL está en `dfcc7ab`.
