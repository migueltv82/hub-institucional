# Panel administrador con datos del schema relacional

## Uso

1. Ingresar como superadmin remoto y abrir **Instituciones**.
2. En la tarjeta de la institucion, activar **Schema relacional en panel admin**. La opcion comienza deshabilitada.
3. Elegir **Abrir panel admin**. Esto selecciona esa institucion en el contexto de sesion y entra a `/app`.
4. Dentro del panel administrador existente, usar el menu interno **Alumnos**, **Docentes** y **Mesas**.
5. En instituciones habilitadas, el workspace se hidrata desde `careers`, `subjects`, `teacher_records`, `student_records` y las tablas relacionales asociadas. No se agregan accesos de alumnos/docentes/mesas a la barra superior.
6. En **Mesas**, elegir fechas y alcance del llamado regular. Generar, revisar agrupaciones/vocales y abrir el resultado. Se puede descargar un borrador.

La fuente relacional usa la institucion activa del contexto Auth, no un ID libre tomado de la URL.
El acceso requiere sesion remota, perfil no bloqueado e institucion activa con membership autorizado. La RLS de cada tabla sigue controlando el acceso real a los datos.

## Configuracion persistente

Se reutiliza `public.app_settings`, definida en `supabase/schema/01_foundation.sql`:

- Clave: `exam_relational_preview:<institution_id>`.
- Valor: `{"enabled":true}` o `{"enabled":false}`.
- `is_public=true`: solo publica la disponibilidad de una funcion, sin credenciales ni datos academicos. Los identificadores institucionales ya forman parte del directorio publico de login.
- La politica existente `super admins manage app settings` restringe las escrituras al superadmin. No se agregaron tablas, RPCs, grants ni politicas.
- Una clave ausente equivale a deshabilitada. Errores de consulta/guardado se muestran y no se consideran exito.
- La habilitacion se consulta al hidratar el workspace. Si esta activa, no se lee `workspace_snapshots`; si esta ausente o deshabilitada, el flujo viejo se conserva.

El entorno debe tener aplicados los bloques 01-04 y los permisos de tabla correspondientes. Si la base deniega INSERT/UPDATE de `app_settings`, la UI muestra el error; no se amplian permisos automaticamente. No hace falta ejecutar un nuevo esquema para esta funcionalidad en una base donde la configuracion existente ya sea operativa.

## Limites del flujo

- No hay contenedor paralelo: el punto de entrada es `GeneradorCronograma` y su hook de persistencia.
- Cuando la institucion esta habilitada, `GeneradorCronograma` no lee ni guarda `workspace_snapshots`. Hidrata el mismo shape de workspace desde el schema relacional.
- El workspace relacional queda en modo solo lectura para padrones. Las cargas y ediciones directas de alumnos/docentes siguen bloqueadas hasta conectar escrituras contra `student_records` y `teacher_records`.
- En **Mesas**, la fuente relacional activa `mode="preview"` para no publicar a docentes, no oficializar y no reiniciar el proceso remoto.
- El interruptor en Superadmin es la unica escritura nueva: guarda configuracion, no cronogramas ni datos academicos.
- Reiniciar limpia memoria. Actualizar datos, cambiar configuracion, cambiar institucion/usuario o salir descarta el resultado previo. Descargar un borrador es una accion local explicita.
- Las consultas academicas estan separadas por usuario/institucion, se cancelan al salir y no conservan cache inactiva. Se paginan de a 500 filas, con orden estable por ID.
- Se reutiliza `buildExamEngineSnapshotFromAcademicSchema`. No se mezclan cronogramas guardados del snapshot viejo: `cronograma` inicia vacio en la fuente relacional.
- Esta entrega cubre llamados regulares, el recorrido validado del lector relacional. El llamado especial operativo existente conserva su comportamiento.
- El diagnostico previo usa las mismas reglas y alcance que el motor: muestra cada materia sin titular sin deduplicarla incorrectamente. No se inventan asignaciones ni se cargan datos faltantes.
- Se conservan `docentes[].bloqueos` en el adaptador compartido. El preview rechaza fechas de titular sin disponibilidad aunque el borrador operativo proponga una fecha de respaldo; los vocales usan las mismas exclusiones.
- No se implementa elegibilidad del alumno ni persistencia de mesas. La vista previa no constituye un cronograma publicado.

## Validacion

Pruebas unitarias/integracion al lado de los servicios, hook de persistencia y componentes: habilitacion persistente, RLS denegada, datos vacios, errores, hidratacion del panel existente desde el schema relacional, ausencia de escrituras durante preview, paginacion, fechas explicitas, alcance y exclusiones para titular/vocales.

Verificacion de calidad: `npm.cmd run check` (auditoria del repo, lint, tests, build y auditoria del bundle).

Resultado local: 268 archivos de tests, 2125 tests aprobados; lint, build y ambas auditorias aprobados. Permanece el aviso conocido del bundle de Excel mayor a 500 kB.

La verificacion visual automatizada no se ejecuto en esta sesion porque no hay navegador controlable disponible desde el entorno. La validacion de build confirma que la UI compila y que el panel administrador existente monta el modo preview cuando la fuente es relacional.
