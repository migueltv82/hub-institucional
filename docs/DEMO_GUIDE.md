# Guia de demo end-to-end

Esta guia resume el recorrido minimo para mostrar el producto funcionando con Supabase real.

## Precondiciones

- La app local corre en `http://127.0.0.1:4173/`.
- Existe un superadmin activo en Supabase Auth.
- El superadmin tiene `public.profiles.is_global_admin = true`.
- Existe al menos una institucion activa, por ejemplo `Instituto San Miguel`.
- La Edge Function `admin-users` responde correctamente.

## Flujo Super Admin

1. Entrar por `Acceso maestro / Gobierno`.
2. Iniciar sesion con el usuario superadmin.
3. Si aparece el popup `Descargar Institutional Hub`, cerrarlo o instalar la app.
4. Ir a `Super Admin > Instituciones`.
5. Verificar que exista una institucion activa.
6. Ir a `Super Admin > Usuarios`.
7. Crear un usuario institucional y asignarlo a la institucion activa.
8. Usar rol `admin` o `editor` para probar carga y guardado.
9. Usar rol `viewer` solo si se quiere mostrar modo lectura sin edicion.
10. Guardar la contrasena temporal generada.
11. Cerrar sesion.

> **Datos de demo (D2):** las planillas de `docs/demo-data/` (Instituto Superior del Valle, datos ficticios) reemplazan a los CSV de abajo. El orden de carga y el resultado esperado están en `docs/demo-data/README.md`. El flujo con CSV queda como referencia histórica.

## Flujo institucional

1. Entrar por `Acceso tenant / Institucion`.
2. Seleccionar la institucion activa.
3. Iniciar sesion con el usuario institucional.
4. Cargar los archivos de muestra:
   - `docs/sample-data/horarios-docentes-demo.csv`
   - `docs/sample-data/plan-estudios-demo.csv`
   - `docs/sample-data/correlatividades-demo.csv`
5. Usar estas fechas:
   - Inicio: `2026-07-13`
   - Fin: `2026-07-13`
6. Seleccionar `Armar mesas`.
7. Seleccionar `Generar precronograma`.
8. Abrir `Confirmar el tribunal`.
9. Seleccionar `Confirmar sin cambios`.
10. Seleccionar `Publicar cronograma`.
11. Recordar que la revision docente en el portal figura como `proximamente`.
12. Iniciar sesion como alumno y abrir `Mesas de examen`.
13. Mostrar que cada mesa indica `Titular`, `Vocales` e `Inscripcion hasta`.
14. Seleccionar `Inscribirme` en una mesa disponible.
15. Probar exportacion.

## Reglas de inscripcion a mesas

- La inscripcion cierra 24 horas antes del inicio de la mesa (hora de Argentina). Pasado ese plazo el alumno ya no puede inscribirse desde el portal.
- El alumno solo puede inscribirse si la ultima condicion cargada por el docente para esa materia es `regular`.
- La regla la decide el servidor (`upsert_exam_enrollment_from_portal`); el portal solo la explica antes de que el alumno apriete el boton.

## Portal docente: mesas

1. Iniciar sesion como docente y abrir sus mesas.
2. Cada mesa muestra `Titular` y `Vocales`.
3. Solo el titular de la materia ve el boton `Ver inscriptos` con la lista de alumnos (DNI, apellido y nombre).
4. Los vocales ven la mesa, pero no la lista de inscriptos.

## Mesas y actas (admin)

1. Con un usuario institucional con permiso de edicion (`owner`, `admin` o `editor`), abrir `Mesas y actas` en el menu lateral.
2. Elegir el dia con las flechas, el boton `Hoy`, el selector de fecha o los chips de `Fechas con mesas`.
3. Las mesas se ven agrupadas por carrera y por año. Se puede filtrar por carrera y buscar por materia, codigo, docente o aula.
4. En cada mesa, `Ver inscriptos` muestra la lista y el origen de cada inscripcion (`Portal` o `Especial (admin)`).
5. `Imprimir acta` genera el acta volante de esa mesa. Las mesas sin inscriptos muestran `Sin acta` y no generan PDF, para ahorrar papel.
6. `Imprimir actas (N)` arma un solo PDF con todas las actas del dia; `Descargar PDF` lo baja sin imprimir. Si el navegador bloquea la ventana de impresion, el PDF se descarga solo.
7. El acta sigue el modelo del instituto: fecha, asignatura, carrera, plan, año, tabla con DNI/apellido/nombre y calificaciones, observaciones, totales y firmas de presidente y vocales con los nombres del tribunal.

### Logo del colegio

1. En `Mesas y actas`, tarjeta `Logo del colegio`, seleccionar `Cargar logo` (PNG o JPG).
2. El logo se achica en el navegador y se guarda en la institucion. Solo el owner o admin del colegio (o el superadmin) puede cambiarlo.
3. Desde ese momento sale en el encabezado de cada acta. Sin logo, el encabezado muestra el nombre de la institucion.

### Inscripcion especial

1. En una mesa, seleccionar `Inscripcion especial`.
2. Buscar y elegir el alumno, y escribir el motivo (minimo 5 caracteres).
3. Se permite hasta el final del dia del examen, aunque ya haya cerrado el plazo de 24 horas.
4. Se aplican las mismas reglas de condicion que en el portal; queda registrada como `Especial (admin)` con el motivo.

## Prueba rol viewer

1. Desde `Super Admin > Usuarios`, cambiar un usuario institucional a rol `viewer`.
2. Entrar por `Acceso tenant / Institucion` con ese usuario.
3. Confirmar que puede ver el workspace.
4. Confirmar que no puede cargar, limpiar, editar, confirmar, regenerar ni borrar informacion.
5. Confirmar que puede exportar la informacion visible.

## Resultado esperado

El cronograma demo genera dos mesas:

- `ING1`, `08:00` a `10:00`, `Aula 1`.
- `ING2`, `10:00` a `12:00`, `Aula 2`.

En `Mesas y actas`, el dia de la mesa muestra las mesas publicadas, las que tienen inscriptos permiten imprimir el acta con el logo del colegio, y las que no tienen inscriptos muestran `Sin acta`.

La prueba se considera lista si no hay errores visibles, el workspace persiste y las exportaciones descargan correctamente.
