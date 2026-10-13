# Objetivo

Cerrar el P1 que permite que una asignacion docente de un tenant/workspace resuelva el nombre de un `teacher_record` perteneciente a otro tenant/workspace.

# Problema que resuelve

`academic_get_student_subject_teacher_notices` prioriza `teacher_record_id` con un JOIN por UUID solamente. Una fila B manipulada para apuntar al legajo A puede revelar el nombre de Teacher A a Student B.

# Alcance

- JOINs de `teacher_records` usados por `academic_get_student_subject_teacher_notices`.
- Integridad entre `subject_teacher_assignments` y `teacher_records`.
- Validacion local A/B focal de lectura, escritura, RPC, auth nulo, usuario bloqueado y borrado.

# Fuera de alcance

- Otros RPC o tablas sin relacion directa con este P1.
- Cambios de grants o RLS.
- Matriz completa, remoto, staging o produccion.

# Comportamiento esperado

Los nombres de docentes solo se resuelven desde un legajo del mismo `institution_id` y `workspace_key` de la asignacion. Las escrituras nuevas cross-tenant/workspace se rechazan.

# Reglas de negocio

- Una asignacion puede enlazar un `teacher_record` solo dentro de su tenant y workspace.
- El fallback por `profile_id` conserva el mismo alcance tenant/workspace.
- La eliminacion de un `teacher_record` conserva la asignacion y pone `teacher_record_id` en null.

# Estados y transiciones

- Asignacion valida: conserva el legajo enlazado.
- Escritura cross-scope: rechazada por FK.
- Legajo eliminado: asignacion conservada con `teacher_record_id = null`.
- Fila historica invalida: no revela el nombre del legajo ajeno.

# Entradas

`p_institution_id`, `p_workspace_key`, asignaciones docentes y sus `teacher_record_id`.

# Salidas

Avisos de licencia con nombres limitados al tenant/workspace solicitado.

# Casos de error

- INSERT, UPDATE o RPC que intenten persistir un `teacher_record_id` de otro scope reciben `foreign_key_violation`.
- Auth nulo o usuario bloqueado no recibe avisos.

# Casos limite

- Fila historica cross-scope previa a la FK.
- `teacher_record_id` nulo.
- Borrado del legajo referenciado.

# Seguridad y permisos

Defensa en profundidad: FK compuesta en escritura y JOIN tenant/workspace-safe en lectura. No se modifican grants ni policies RLS.

# Requisitos de UX/UI

No aplica: cambio exclusivo de integridad SQL y salida RPC existente.

# Impacto en datos / base de datos

Se agrega una clave unica de soporte sobre `(institution_id, workspace_key, id)` en `teacher_records` y una FK compuesta desde `subject_teacher_assignments`. Si existen filas historicas cross-scope, la aplicacion del schema falla de forma visible hasta repararlas; no se corrigen datos automaticamente.

# Compatibilidad hacia atras

Se preservan firma y grants del RPC, flujos A/B legitimos y semantica de borrado `SET NULL` solo para `teacher_record_id`.

# Criterios de aceptacion

### AC-01 - B no ve Teacher A
Given una asignacion B historicamente enlazada con `teacher_record` A
When Student B consulta los avisos
Then el nombre de Teacher A no aparece.

Verificacion: validacion SQL focal A/B.

### AC-02 - Flujos legitimos conservados
Given asignaciones A→Teacher A y B→Teacher B
When los estudiantes correspondientes consultan avisos
Then ambos reciben el nombre correcto de su tenant.

Verificacion: validacion SQL focal A/B.

### AC-03 - Escrituras cross-scope rechazadas
Given Admin B autenticado
When intenta INSERT, UPDATE o RPC con `teacher_record_id` A
Then la operacion falla y no persiste el vinculo.

Verificacion: validacion SQL focal con `foreign_key_violation`.

### AC-04 - Acceso fail-closed
Given un usuario bloqueado o un caller authenticated con `auth.uid()` nulo
When consulta avisos
Then no recibe filas.

Verificacion: validacion SQL focal.

### AC-05 - Borrado compatible
Given una asignacion con legajo valido
When se elimina el `teacher_record`
Then la asignacion permanece y `teacher_record_id` queda en null.

Verificacion: validacion SQL focal.

# Plan tecnico

- Modificar `supabase/schema/06_subject_teacher_assignments.sql`: clave unica de soporte y FK compuesta tenant/workspace con `ON DELETE SET NULL (teacher_record_id)`.
- Modificar solo los JOINs afectados en `supabase/schema/07_academic_operations.sql`.
- Extender `supabase/baseline/local_ab_rls_rpc_validation.sql` con casos focales RED/GREEN para AC-01..AC-05.
- Ejecutar solo la validacion focal disponible y `git diff --check`; no ejecutar matriz ni suite completa.
- Revisar seguridad, Supabase/Postgres y el diff. Rollback: retirar la FK/indice compuesto y restaurar los predicados anteriores; no ejecutar ese rollback automaticamente.
