# Checklist pre-demo

Usar esta lista antes de mostrar Institutional Hub a una institucion.

## Estado tecnico

- Ejecutar `npm run check`.
- Levantar la app en `http://127.0.0.1:4173/`.
- Confirmar que Supabase responde con al menos una institucion activa.
- Confirmar que la Edge Function `admin-users` responde.

## Cuentas

- Superadmin activo y probado.
- Usuario institucional `admin` o `editor` creado desde el panel.
- Usuario `viewer` opcional para mostrar modo solo lectura.
- Docente titular y docente vocal de una misma mesa, para mostrar quien ve los inscriptos.
- Alumno con condicion `regular` cargada por el docente en la materia de la mesa.
- Contrasenas temporales disponibles solo para la demo.

## Recorrido comercial

- Login superadmin por `Acceso maestro / Gobierno`.
- Crear o revisar institucion activa.
- Crear usuario institucional.
- Login tenant por `Acceso tenant / Institucion`.
- Cargar archivos de `docs/sample-data`.
- Usar periodo `2026-07-13` a `2026-07-13`.
- Seleccionar `Armar mesas`.
- Seleccionar `Generar precronograma`.
- Abrir `Confirmar el tribunal`.
- Seleccionar `Confirmar sin cambios`.
- Seleccionar `Publicar cronograma`.
- Mostrar `Revision docente en el portal (proximamente)`.
- Iniciar sesion como alumno y abrir `Mesas de examen`.
- Mostrar `Titular`, `Vocales` e `Inscripcion hasta` en la mesa (cierra 24 h antes).
- Seleccionar `Inscribirme` en una mesa disponible.
- Login docente titular: `Ver inscriptos` muestra al alumno. Login vocal: ve la mesa sin la lista.
- Login admin: abrir `Mesas y actas` y elegir el dia de la mesa.
- Confirmar que el logo del colegio esta cargado (tarjeta `Logo del colegio`).
- `Imprimir acta` en una mesa con inscriptos; mostrar `Sin acta` en una sin inscriptos.
- `Imprimir actas (N)` del dia completo.
- `Inscripcion especial` con motivo (opcional, si hay un alumno sin inscribir).
- Exportar XLSX completo.
- Exportar confirmadas por carrera.
- Mostrar popup de descarga/instalacion de app.

## Resultado esperado

- No aparecen errores visibles.
- El workspace persiste al recargar.
- El rol `viewer` queda solo lectura.
- Las exportaciones descargan correctamente.
- Las actas salen con el logo, los datos de la mesa, los inscriptos y los nombres del tribunal.
- Solo el titular ve la lista de inscriptos en el portal docente.
- La app se ve con marca consistente como `Institutional Hub`.
