# Guion de UAT en Staging — v1

Para: Miguel (ejecutor) · Preparado por: Claude · 2026-10-16. Criterios de origen: `docs/PRODUCTION_SCOPE.md` (P01–P06, alcance vigente v1).

Se ejecuta **después** de que Staging corra el commit candidato (STG0/STG1) y de que pase Staging security 2. Toma ~90 minutos. Se marca cada paso como ✅ / ❌ / ⚠️, con una nota corta. Un ❌ en un paso marcado **[GATE]** es NO-GO hasta que se corrija o se acepte por escrito.

## Preparación (15 min)

- Navegador en ventana privada, una por cuenta. Cerrar la ventana entre cuentas.
- Dos instituciones ficticias: **A** y **B**. Datos inventados: nombres, DNI y emails de prueba.
- Cuentas, como mínimo:

| Cuenta | Rol | Institución |
| --- | --- | --- |
| SA | superadmin | — |
| ADM-A | admin_instituto | A |
| DOC-A | docente, con una materia asignada (p. ej. ING08 de PROFESORADO DE INGLES) | A |
| ALU-A | alumno inscripto a esa materia | A |
| ALU-A2 | alumno inscripto a la misma materia, sin condición cargada | A |
| ADM-B | admin_instituto | B |

- Las contraseñas de prueba se pasan por canal seguro y no se anotan en Trello ni en capturas.

## P01 — Login por rol [GATE]

1. Entrar con SA, ADM-A, DOC-A y ALU-A. Cada uno cae en su pantalla: panel global, dashboard institucional, portal docente y portal alumno, respectivamente.
2. Con ALU-A, pegar en la barra la URL del dashboard institucional o la del panel Super Admin: no debe mostrar datos y debe redirigir o rechazar.
3. Recargar con F5: la sesión se mantiene. Cerrar sesión y volver atrás con el navegador: no se ven datos de la sesión anterior.
4. SA bloquea a ALU-A2. ALU-A2 intenta entrar: rechazado. SA lo desbloquea: entra.

## P02 — Planillas y workspace

1. ADM-A carga las planillas de plantilla (horarios, docentes, alumnos, plan, correlatividades). Los conteos coinciden con los archivos.
2. Subir un archivo con formato inválido: el error se informa y no aparece como guardado.
3. Recargar y abrir con ADM-A en otra ventana: los datos están.
4. **[GATE]** ADM-B no ve nada de A: ni planillas ni archivos ni alumnos.

## P03 — Mesas (v1 = generación y publicación; docente solo lectura)

1. ADM-A configura el período y genera el precronograma. Revisar fechas, materias, tribunales y advertencias.
2. Publicar.
3. DOC-A ve sus mesas en **solo lectura**: sin botones de confirmar, objetar ni reasignar, y con el mensaje de gestión no habilitada.
4. Recargar: la publicación persiste. Una mesa en borrador no aparece como disponible para inscripción.

## P04 + P05 — Circuito docente ↔ alumno [GATE]

1. DOC-A abre la materia: ALU-A y ALU-A2 aparecen con nombre y DNI.
2. DOC-A carga asistencia de una clase y, para ALU-A, la condición **regular**. Recargar: persiste.
3. ALU-A entra: ve la materia, la asistencia y la condición. Se inscribe a la mesa publicada. Recargar: la inscripción sigue ahí.
4. ALU-A repite la inscripción: no se duplica.
5. ALU-A2 (sin condición) intenta inscribirse: el botón está deshabilitado y explica por qué.
6. DOC-A le carga **libre** a ALU-A2: sigue sin poder inscribirse.
7. Si 03.5b ya está en Staging: DOC-A carga "Regular" (con mayúscula) a ALU-A2. Se guarda como `regular` y ALU-A2 ya puede inscribirse.

## P06 — Super Admin

1. SA crea una institución de prueba C con su administrador ADM-C. ADM-C entra y ve C vacía.
2. SA resetea la contraseña de ADM-C: la nueva funciona y la anterior no.
3. ADM-A intenta una acción de Super Admin, como ver otras instituciones: rechazada.
4. **Suspensión:** SA suspende C. ADM-C intenta entrar o seguir trabajando.
   - Resultado esperado con el código actual: ⚠️ **probablemente siga teniendo acceso a los datos**. El servidor no mira el estado de la institución (ver "Brechas conocidas"). Registrar lo que pasa.
5. **Historial de acciones administrativas:** no hay pantalla. El procedimiento operativo v1 es esta consulta read-only en el SQL Editor de Staging. Verificar que aparecen la creación de usuario, el bloqueo y el reset de los pasos anteriores, con actor y fecha, y sin contraseñas en `metadata`:

   ```sql
   begin; set transaction read only;
   select created_at, actor_email, action, status, target_type, target_id,
          metadata - 'password' - 'new_password' as metadata, error_message
   from public.admin_audit_logs
   where created_at > now() - interval '1 day'
   order by created_at desc
   limit 100;
   rollback;
   ```

## Cierre

Pegar en la tarjeta [HUMANO] la tabla de resultados (paso → ✅/❌/⚠️ → nota). Claude la contrasta con la matriz Go/No-Go.

## Brechas conocidas antes de empezar

| Brecha | Criterio afectado | Estado |
| --- | --- | --- |
| La suspensión de una institución no corta el acceso a los datos. `public.is_member_of_institution` (`supabase/schema/01_foundation.sql`) filtra perfiles bloqueados pero no `institutions.status`. | P06.4 | Corrección propuesta: [CODEX] 06.3. Que entre en v1 lo decide Miguel |
| No hay pantalla para `admin_audit_logs`. | P06.5 | Para v1 se cubre con la consulta documentada arriba (criterio "forma operativa documentada") |
| `workspace_snapshots` es legible por cualquier miembro de la institución, no solo por roles administrativos. | P02 | Conocida desde 2026-09-24; sin tarjeta. Riesgo dentro del mismo tenant |
