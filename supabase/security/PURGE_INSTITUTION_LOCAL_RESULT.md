# I3 — Limpieza de una institución de prueba (local)

Fecha: 2026-10-20. Ejecutó: Claude. Entorno: base descartable sobre `supabase_db_codex-baseline-local-7725bdda`.
- Esquema: los 9 archivos del baseline, `source_file_storage_gateway.sql` y `source_file_storage_register_on_institution.sql`.
- Datos: el fixture A/B, más un Super Admin con membresía en A, un usuario compartido entre A y B, un usuario de A con legajo en B, snapshot, una operación del gateway y un archivo en Storage.
- El SQL corre como en el SQL Editor: rol `postgres`, todo el script de una vez.

Staging y Producción: **NONE**.

## Qué hace `scripts/buildPurgeInstitutionSql.mjs`

Genera el SQL para una institución identificada por su nombre exacto.
- **Simulación** (por defecto): cuenta y termina en `rollback`.
- **`--ejecutar`:** una sola transacción, en este orden:
  1. Aborta si quedan archivos en Storage bajo la carpeta de la institución.
  2. Borra las operaciones del gateway por recurso (esa tabla no tiene `institution_id`).
  3. Hace pasadas sobre **todas** las tablas de `public` con `institution_id` hasta que no queda ninguna fila. Una tabla bloqueada por FK se reintenta en la pasada siguiente, y se sigue hasta que todo quede en cero, porque un trigger del gateway reescribe revisiones.
  4. Borra la institución y los usuarios Auth exclusivos.
  5. Verifica que no queda nada antes del `commit`.

## Resultado

`node scripts/validatePurgeInstitutionLocal.mjs` → **PASS**, run `70cb74af9228d500`, cleanup 0. Revisa 40 tablas con `institution_id`.

| Caso | Resultado |
|---|---|
| Simulación | Lista filas por tabla, 7 usuarios ligados (4 a borrar y 3 a conservar) y 0 archivos. No cambia ninguna fila ni ningún usuario |
| Borrado con un archivo pendiente en Storage | Aborta con `PURGE_STORAGE_FILES_PENDING`; no cambia nada |
| Borrado | 0 filas de A en las 40 tablas y la institución A borrada. B idéntica (digest de todas sus filas igual). Se borran los 4 usuarios exclusivos de A. Se conservan el Super Admin, el usuario compartido (con su membresía en B) y el usuario con legajo en B. La auditoría queda intacta |
| Segunda corrida | `PURGE_INSTITUTION_NOT_FOUND`, B sin cambios |

Hallazgo durante el ensayo: la primera versión daba cada tabla por terminada después de un borrado exitoso. Un trigger del gateway reinsertaba una revisión al borrar el snapshot, y el borrado de la institución fallaba. Se cambió a pasadas hasta cero.

## Pendiente

- Auditoría independiente COMPLETA: es SQL destructivo.
- En Producción se ejecuta solo con OK de Miguel y con el backup del día (runbook §8.0).
