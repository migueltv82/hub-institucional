# UAT con usuarios de prueba en la base de Producción (2026-10-18)

Base `lzjp…aeco` (Hub-Institucional-Prod), todavía sin datos reales. Lo ejecutó Miguel desde la app local (`release/v1`) y Claude verificó en la base con consultas read-only. Los datos de prueba se limpian antes de la carga real.

## Circuito probado: PASS

| Paso | Resultado |
| --- | --- |
| Superadmin creado y promovido (seed de 01) | OK |
| Institución + admin desde Super Admin | OK. El admin quedó como `viewer` porque se dio de alta como "Nuevo usuario" con ese rol; se corrigió a `admin` |
| Admin sube las planillas académica, docentes y alumnos | OK: 3 archivos en Storage y snapshot guardado |
| Crear accesos docente y alumno (Edge `admin-users` v5) | OK: cuentas con rol, membership `viewer` y legajo vinculado |
| Catálogo académico (CAT.1, SQL Editor) | OK |
| Alumno ve UAT01 y se inscribe | OK: `subject_enrollments` UAT01 / "PROFESORADO DE PRUEBA UAT", active |
| Admin asigna al docente como titular | OK, después de PB.7 |
| Docente ve la materia con su alumno | OK, después de PB.8 (antes contaba 2 materias) |
| Docente carga asistencia y notas | OK: 1 clase, 1 presente; 2 parciales y 1 final 5.5 `regular` |
| Alumno ve asistencia, notas y condición | OK (confirmado por Miguel) |

Las claves canónicas coinciden en todo el circuito: `subject_id` = `UAT01`, `program_id` = `PROFESORADO DE PRUEBA UAT`.

## Bugs encontrados y corregidos

| Id | Problema | Commit |
| --- | --- | --- |
| PB.5 | El import de alumnos ponía el nombre de la materia como nombre del alumno | 0e09bc7 |
| — | Acentos doblemente codificados en avisos de la UI, más una guardia de test | 06f9aac |
| CAT.1 / CAT.1b | El catálogo relacional no se cargaba: el portal alumno no veía materias | 30f6f31, 0429193 |
| PB.7 | El panel de asignaciones no encontraba la cuenta del docente (email técnico vs de contacto) | 8c5b1fa |
| PB.8 | El portal docente contaba dos veces la misma materia | 6f13b97 |

## Pendiente

- PB.6: re-subir la planilla de alumnos no actualiza los datos de un alumno existente.
- P3: `SOURCE_FILE_WORKSPACE_BUSY` se muestra crudo.
- Prueba de mesa de examen (inscripción con condición regular) en esta base: opcional; QA.1 ya la cubre en local.
- Limpieza de los datos de prueba antes de la carga real: usuarios UAT, institución "Instituto San Miguel" de prueba, catálogo y audit logs viejos.
- Secrets de orígenes de las Edge cuando haya dominio.
