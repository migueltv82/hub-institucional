# Decisiones de Miguel del 20/10: implementación y evidencia local

Las tres se verificaron en el stack local completo (Auth, PostgREST, Edge y Storage reales) con la institución de demo (D2).

## 1. Las instituciones se suspenden, no se borran desde la app

"Eliminar institución" fallaba siempre (FK con los recursos del gateway de Storage) y no limpiaba nada de forma controlada. Se retiró de Super Admin → Instituciones:
- queda "Suspender / Reactivar", con un mensaje que aclara que no se borran datos;
- "Opciones avanzadas" indica que el borrado definitivo de una institución de prueba es el procedimiento de limpieza I3 (runbook §8.0).

Test: `src/pages/SuperAdminInstitutionsPage.test.js`.

## 2. Reparar accesos de alumno incompletos

**Caso:** una provisión se corta después de crear la cuenta y antes de vincular el legajo. Desde D2, el reintento y los lotes de a uno lo hacen improbable, pero no imposible.

**Qué se mantiene:** "Crear accesos" sigue fallando cerrada ante esas cuentas, que es la regla auditada (`adminUsersStudentIdentity.test.js`, `unlinked-email`).

**Qué se agregó:** la acción aparte `repair_student_access`, solo para owner o admin de la institución o Super Admin. Vincula los legajos únicamente si se cumple todo esto:
- la cuenta nunca se usó (`must_change_password` sigue en true);
- no hay un alta de admin en curso para esa cuenta;
- es un alumno no bloqueado, sin rol global, con el mismo email;
- es miembro **solo** de esta institución y como `viewer`;
- todos sus legajos con ese email están sin dueño, y el `update` filtra `profile_id is null`.

No crea, borra ni cambia cuentas o contraseñas. Si un alumno todavía no tiene cuenta, la acción no lo toca y le indica usar "Crear accesos". En la app, la sección de accesos explica el caso y ofrece "Reparar accesos incompletos".

**Recorrido verificado:**
1. Un trigger de prueba hizo fallar la vinculación de 2 alumnos durante "Crear accesos": 22 creados, 2 errores y 2 cuentas sin legajo.
2. Al repetir "Crear accesos" apareció el aviso "Hay accesos incompletos". El 409 del lote es el esperado.
3. "Reparar accesos incompletos" devolvió "2 accesos reparados". Los 2 legajos quedaron vinculados y las 2 cuentas siguen con el cambio de contraseña pendiente.

## 3. Aviso de conflicto en el panel admin

El snapshot del panel lo escriben otras sesiones del panel y también la Edge (portal alumno, perfil docente, reseteos). Antes, gana la última escritura y se pisaba en silencio. Ahora:
- el panel guarda solo si la fila sigue en la versión (`updated_at`) que cargó;
- si cambió, no escribe: deja la copia local, pausa el autoguardado y muestra "Hay cambios de otra sesión", con "Ver los cambios (recargar)" o "Subir los míos igual" (con confirmación);
- una copia local editada sin conexión se compara contra la versión de la que partió (clave `:base` en localStorage);
- el reseteo académico, que la Edge aplica sobre el snapshot, refresca la versión para no generar un falso aviso.

**Recorrido verificado con dos sesiones:**
1. La sesión B (misma cuenta, otra ventana) subió la planilla docente y guardó sin aviso.
2. La sesión A subió la de alumnos después: apareció el aviso y no pisó.
3. "Ver los cambios" levantó el aviso, y A volvió a guardar normal.

Además, las tres cargas de planillas de D2 funcionan con el guardado condicionado.

**Tests:** `workspaceSnapshotConflict.test.js` (6 casos; contra el servicio anterior fallan los 6), `useWorkspacePersistence.test.js` (+2) y `WorkspaceConflictBanner.test.jsx`.

**Límite:** es un aviso optimista, no un bloqueo. Entre que A carga y guarda, nada impide que B guarde; lo que cambia es que A ya no pisa sin enterarse.

`npm run check` PASS (2734).
