# Checklist operativo local para prueba read-only real con Supabase

## 1. Objetivo

Preparar una prueba local controlada, solo lectura, contra Supabase real.

La prueba debe servir para validar que un `workspace_snapshots.payload` real puede
alimentar el adaptador y el preview nuevo del `examEngine`, sin afectar produccion ni
persistir resultados con datos reales.

## 2. Condiciones previas obligatorias

- [ ] Confirmar que se usa `VITE_SUPABASE_PUBLISHABLE_KEY` o `VITE_SUPABASE_ANON_KEY`.
- [ ] Confirmar que no se usa `service_role`.
- [ ] Confirmar que `envGuards` no reporta claves inseguras.
- [ ] Confirmar que se leera solo `workspace_snapshots`.
- [ ] Confirmar que no se ejecutaran `insert`, `upsert`, `update`, `delete` ni `rpc`.
- [ ] Confirmar que no se guardaran resultados.
- [ ] Confirmar que no se publicara ningun cronograma.
- [ ] Confirmar que no se tocara UI productiva.

## 3. Variables de entorno esperadas

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` o `VITE_SUPABASE_ANON_KEY`

No debe existir ninguna variable frontend con claves privadas o `service_role`.

## 4. Verificaciones antes de correr

- [ ] `git status --short` limpio.
- [ ] `App.jsx` sin cambios temporales.
- [ ] Sin rutas nuevas.
- [ ] Sin menu nuevo.
- [ ] `npm test` pasando.
- [ ] `npm run build` pasando.

## 5. Reglas durante la prueba

- No imprimir payload completo si contiene datos reales.
- No commitear snapshots reales.
- No guardar JSON con datos reales en el repo.
- No subir reportes con datos sensibles.
- Solo mostrar metricas y resumenes anonimizados.

## 6. Resultado permitido

Se puede registrar o mostrar:

- Cantidad de snapshots encontrados.
- Fecha del ultimo snapshot.
- Presencia o ausencia de `payload`.
- `phase` del preview.
- Cantidad de mesas planificadas.
- Cantidad de mesas pendientes.
- Cantidad de warnings.
- Cantidad de critical.
- Resumen sin datos personales.

## 7. Resultado prohibido

No se debe registrar, imprimir, commitear ni compartir:

- Nombres reales completos si no estan anonimizados.
- Documentos de identidad.
- Emails.
- Telefonos.
- Datos de alumnos.
- Payload completo del snapshot.
- Credenciales.
- Variables de entorno.

## 8. Rollback

La prueba no deberia modificar archivos.

Si se crea algun archivo temporal:

- Borrarlo antes de finalizar.
- Confirmar `git status --short` limpio.

## 9. Proximo paso despues del checklist

Crear una prueba manual/local read-only que pueda ejecutarse bajo demanda, sin commit de
resultados reales.

Esa prueba debe mantenerse fuera de UI productiva, sin rutas publicas, sin escrituras en
Supabase y sin persistencia de datos reales en el repositorio.
