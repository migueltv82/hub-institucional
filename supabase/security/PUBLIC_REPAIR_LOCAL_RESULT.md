# RB.2 / RB.2b — Reparación puntual de filas de `public` desde el archive del §3.1

Fecha: 2026-10-17. Lo ejecutó Claude. La auditoría independiente (agente) marcó RB.2 como **FAIL**: el orden contradecía las FK, `profiles` era global y faltaba ensayar el encoding en PowerShell. RB.2b corrige esos puntos. Todo local: Staging y Production NONE.

## Resultado RB.2b: **PASS**. El procedimiento es viable como `postgres`.

| Prueba | Run | Resultado |
| --- | --- | --- |
| `node scripts/validatePublicRepairLocal.mjs` | `f41fa8d5c0adc9d7` | **PASS**. Reparación en 107 ms. Se tocan solo las 4 filas dañadas. Cleanup 0 |
| Igual con `--control` (carga el archive y omite el upsert) | `90064acd6b4c13cc` | **FAIL**, como se esperaba: las 3 tablas de A quedan sin restaurar |
| Rol del operador | — | `postgres`: `rolsuper = false`, `rolbypassrls = true`, igual que en Supabase |
| Datos UTF-8 | — | El archive trae `Ñandú Ávila Peña`. El retarget por bytes los conserva y el hash final es igual al original |

Montaje del ensayo:
- stack local con 4 usuarios GoTrue reales y 2 instituciones;
- legajos con tildes, cursadas, y notas enlazadas a su cursada (`subject_enrollment_id`);
- archive tomado como `postgres` con los flags del §3.1.

## Daño simulado y reparación (solo institución A)

- Se borra una cursada. Su nota queda con `subject_enrollment_id` en null por la FK `set null`, así que el daño viaja a otra tabla.
- Se borra otra nota.
- Se pisa el apellido de un legajo cuyo original tiene tildes.

| Tabla (A) | Antes | Con daño | Después | Filas tocadas por la reparación |
| --- | --- | --- | --- | --- |
| `student_records` | 2 · `7891b800…` | 2 · `7db9bbfc…` | 2 · `7891b800…` | 1 |
| `subject_enrollments` | 4 · `5e3b29c1…` | 3 · `937f15f4…` | 4 · `5e3b29c1…` | 1 |
| `student_grades` | 4 · `82636dd5…` | 3 · `70805410…` | 4 · `82636dd5…` | 2 (la borrada y la que perdió su FK) |

El hash es el md5 de las filas en JSON, sin `updated_at`, porque esa columna la reescriben los triggers de touch.

Quedan sin cambios, comparados completos: la institución B (con `updated_at`), `profiles` (toda la tabla), `auth.users` y `auth.identities`. RLS: 40 tablas antes y después.

## Qué corrigió RB.2b respecto de RB.2

1. **Orden de FK.** Legajos → cursadas → notas. Con el orden anterior (notas primero), la nota volvía con un `subject_enrollment_id` que todavía no existía y la transacción abortaba.
2. **Sin `profiles`.** Es una tabla global: el upsert pisaba `is_blocked` y `account_role` con valores del backup. Queda fuera de R4b y se corrige a mano. El harness verifica que `profiles` no cambie.
3. **Comparación sin `updated_at`.** Los triggers de touch hacían que toda fila pareciera distinta, y se reescribían filas sanas. Ahora solo se tocan las dañadas, y el harness lo exige.
4. **Retarget por bytes.** `scripts/retargetRepairCopy.mjs` reemplaza al `Get-Content`/`Set-Content` de PowerShell, que en la 5.1 re-codifica el UTF-8. Los tests cubren tildes, tabs y CRLF.
5. **`\ir` en lugar de `\i`.** Los archivos se buscan junto al template. Además, cada corrida usa su propia ruta de dump.

## Límites (copiados en el runbook R4b)

- No aplica si el esquema cambió desde el backup: comparar antes con el catálogo del §3.3.
- No borra filas creadas después del backup.
- No repara `profiles`, `auth.*` ni los bytes de Storage.
- Los hijos borrados en cascada se recuperan solo si se agrega su tabla, en orden de FK.
- Un choque con un unique parcial aborta la transacción entera, sin cambios.
- El fixture es chico; no se midió con volumen real.
