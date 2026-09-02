# Checklist pre-demo

Usar esta lista antes de mostrar Institutional Hub a una institucion.

## Estado tecnico

- Ejecutar `npm run lint`.
- Ejecutar `npm test`.
- Ejecutar `npm run build`.
- Levantar la app en `http://127.0.0.1:5173/`.
- Confirmar que Supabase responde con al menos una institucion activa.
- Confirmar que la Edge Function `admin-users` responde.

## Cuentas

- Superadmin activo y probado.
- Usuario institucional `admin` o `editor` creado desde el panel.
- Usuario `viewer` opcional para mostrar modo solo lectura.
- Contrasenas temporales disponibles solo para la demo.

## Recorrido comercial

- Login superadmin por `Acceso maestro / Gobierno`.
- Crear o revisar institucion activa.
- Crear usuario institucional.
- Login tenant por `Acceso tenant / Institucion`.
- Cargar archivos de `docs/sample-data`.
- Usar periodo `2026-07-13` a `2026-07-13`.
- Generar cronograma.
- Confirmar una mesa.
- Editar manualmente una mesa.
- Exportar XLSX completo.
- Exportar confirmadas por carrera.
- Mostrar popup de descarga/instalacion de app.

## Resultado esperado

- No aparecen errores visibles.
- El workspace persiste al recargar.
- El rol `viewer` queda solo lectura.
- Las exportaciones descargan correctamente.
- La app se ve con marca consistente como `Institutional Hub`.
