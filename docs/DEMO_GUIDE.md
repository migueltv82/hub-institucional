# Guia de demo end-to-end

Esta guia resume el recorrido minimo para mostrar el producto funcionando con Supabase real.

## Precondiciones

- La app local corre en `http://127.0.0.1:5173/`.
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
6. Generar cronograma.
7. Confirmar una mesa.
8. Editar manualmente una mesa.
9. Probar exportacion.

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

La prueba se considera lista si no hay errores visibles, el workspace persiste y las exportaciones descargan correctamente.
