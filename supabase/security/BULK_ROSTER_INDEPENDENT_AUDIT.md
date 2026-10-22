# AUD.I2b — Cursadas y titulares: auditoría independiente

Fecha: 2026-10-21. Implementación original: `4b6f570`. Base final examinada: `143efb7`, incluidos el filtro `5356f82` y el modelo docente ampliado de `06`. Codex y dos revisores independientes read-only (SQL y frontend). Solo evidencia y WORKLOG; sin correcciones de implementación, SQL remoto ni deploy.

**Release decision: BLOCK. QUALITY GATE: FAIL.** Un P1 y dos P2 reproducidos. El filtro nuevo corrige bajas y fechas de texto reconocidas, pero no cubre fechas nativas de Excel.

## P1 — Una fecha de Excel vencida o futura se interpreta como ausencia de límite

Archivos: `src/services/bulkRoster.js:48–55,63–70`; camino de entrada `src/utils/examEngine/templatesV2/importTemplateV2Workbook.js:35–56,415–451`; escritura `supabase/schema/07_academic_operations.sql:2043–2048`.

`parseSheetDate` convierte cualquier valor a texto y reconoce solo ISO o DD/MM/YYYY. Una celda de fecha de Excel llega como `Date`; su representación textual no coincide y la función devuelve cadena vacía. `assignmentSkipReason` interpreta eso como ausencia de restricción. El payload elimina la vigencia y la RPC crea una asignación activa. No basta con filtrar fechas de texto conocidas: un valor no vacío e inválido tampoco debería pasar como límite ausente.

Reproducción con componentes reales, sin mocks del importador: crear un workbook ExcelJS con las hojas `docentes`, `docente_materia` y `horarios_docentes`. En `docentes`, un docente con DNI sintético 20111222. En `docente_materia`, materia FIX-A-01 de Fixture Career A, rol TITULAR, estado ACTIVO y celda `vigencia_hasta = new Date('2020-01-01T00:00:00Z')`. Serializar `workbook.xlsx.writeBuffer()` y pasarlo a `parseTemplateV2TeachersWorkbook({name:'synthetic-dates.xlsx',arrayBuffer:async()=>buffer})`.

Observaciones verificadas:

- `datasets.docenteMateria[0].vigencia_hasta instanceof Date` es true.
- `planTeacherAssignmentRows(...)` devuelve una fila TITULAR y cero omitidas.
- La misma fecha como texto `2020-01-01` sí se omite por `VIGENCIA_VENCIDA`.
- También se admite un inicio nativo `Date` de 2099, mientras el texto `2099-01-01` se omite.
- Los payloads generados por el builder real se enviaron a la RPC en la base descartable: una creada, `role=titular`, `status=active`; `academic_can_manage_subject` ejecutada como ese docente devuelve true para ambos casos. No se afirma ejecución del motor completo ni carga real de notas en estos dos casos; el permiso sí está probado.

Run SQL `39a86e3d98d105df`. Pruebas frontend temporales: dos tests PASS como observaciones de la reproducción, no como aceptación del defecto. Corrección propuesta para el implementador: normalizar fechas de Excel y strings en el límite de importación, validar fechas de calendario y distinguir ausencia de valor de valor inválido. Preservar o validar la vigencia al persistir, sin conceder permiso a filas futuras/vencidas. Repetir la auditoría después.

## P2 — Dos importaciones concurrentes abortan todo el segundo lote

Archivo: `supabase/schema/07_academic_operations.sql:2030–2048,2139–2155`. Índices: `06_subject_teacher_assignments.sql:214–216`, `07_academic_operations.sql:524–525`.

Las RPC consultan con `FOR UPDATE` y luego insertan si no encontraron fila. Cuando la clave aún no existe, esa consulta no serializa dos inserciones. El INSERT carece de manejo de conflicto concurrente. El índice evita duplicados, pero un error revierte todas las filas del lote; no se obtiene el reporte idempotente por fila.

Reproducción en dos conexiones psql de la misma base descartable:

1. Crear una segunda materia sintética AUDIT-A-02 dentro del mismo plan; dejar vacías las asignaciones o cursadas de prueba.
2. A llama a la RPC para FIX-A-01 y conserva la transacción abierta con `pg_sleep(3)` antes de COMMIT. Confirmar la espera con `pg_stat_activity`.
3. B llama a la misma RPC con dos filas: primero AUDIT-A-02, después FIX-A-01, para el mismo docente/alumno.
4. Al confirmar A, B recibe SQLSTATE 23505. Queda FIX-A-01=1 y AUDIT-A-02=0: la fila ajena al conflicto también se revierte.

Run `39a86e3d98d105df`: reproducido tanto en `academic_admin_bulk_assign_teachers` (`subject_teacher_assignments_active_key`) como en `academic_admin_bulk_enroll_students` (`subject_enrollments_current_key`). El runner captura el error en un subbloque para poder observarlo; no evita el rollback de la llamada. No hay duplicados ni pérdida de datos previamente confirmados: es fallo de idempotencia y del lote concurrente.

Corrección propuesta: resolver la concurrencia por clave mediante un UPSERT que respete bajas/roles, o serialización compartida con relectura del estado. No silenciar 23505 suponiendo que cualquier conflicto es una fila equivalente.

## P2 — El resultado de la institución anterior permanece en la nueva

Archivos: `src/components/generadorCronograma/BulkRosterSection.jsx:16,26–34`; integración sin key de contexto `src/components/GeneradorCronograma.jsx:1899`.

Reproducción con React Testing Library y el componente real: iniciar una carga con institutionId A, mantener pendiente la promesa del servicio; rerender con institutionId B; resolver A con un problema que contiene DNI 30111222 y materia MATERIA-A. Ambos siguen mostrándose dentro del componente de B. El estado tampoco se limpia al cambiar el contexto tras un resultado terminado.

El revisor contrastó el padre y el cambio de institución en AuthContext: no hay remount garantizado que descarte ese estado. No se afirma que la RPC escriba en B ni que haya acceso entre usuarios sin permiso: la petición conserva A; el defecto es mostrar información y resultados bajo una institución equivocada. Corrección propuesta: limpiar resultados y descartar callbacks de contexto anterior, con política explícita para los lotes pendientes.

## Verificaciones positivas y evolución del alcance

- Harness original en base inicial `f8b0647`: run `5eeb62d4338ce038`, 13 casos y punta a punta docente/alumno PASS, cleanup 0.
- Run propio final `39a86e3d98d105df`, base `143efb7`: 13 casos originales y punta a punta PASS; 23 escenarios adversariales de permisos/payload/DNI/workspace inspeccionados con resultados esperados; tres casos de estado/vigencia persistidos y dos carreras concurrentes. Cleanup bases=0. El `result: PASS` del runner indica terminación y controles originales satisfechos; el veredicto de los escenarios propios es el FAIL de este informe.
- Owner/admin/editor/superadmin autorizados; viewer, caller bloqueado e institución suspendida rechazados. Otro workspace no resuelve sus legajos. DNI con puntos se normaliza. Otra carrera se rechaza. Elementos escalares producen rechazos por fila y 1001 filas se rechazan con 22023.
- Ambas RPC: SECURITY DEFINER, `search_path=''`, anon sin EXECUTE. Helpers de catálogo y legajo privados, tampoco invocables por authenticated. Resolución tenant/workspace revisada.
- El filtro `5356f82` sí omite BAJA, fin vencido e inicio futuro en texto reconocido; LICENCIA se envía como licencia y el permiso docente devuelve false. No se mantiene el antiguo hallazgo amplio como si el correctivo no existiera.
- El primer intento de crear un DNI docente ambiguo fue impedido por `teacher_records_workspace_dni_key`; se conservó el constraint y se retiró ese fixture imposible. Run incompleto con cleanup 0; no se presenta como test positivo ni hallazgo.
- Suites focales actuales: 5 archivos / 56 tests PASS. Dos tests de reproducción propios PASS. Sin snapshots actualizados ni tests del producto debilitados.

## Límites

Gate automatizado final: `npm.cmd run check` PASS, 359 archivos / 2743 tests, auditoría del repo, lint, build y auditoría del bundle (120 archivos). Typecheck no disponible. Aviso preexistente de chunks >500 kB. Los dos revisores validaron la fidelidad del informe en su alcance. Seguridad/corrección funcional y adversarial: FAIL por P1 confirmado; automatización verde no equivale a aprobación.

Validación local, sin recorrido de navegador ni comprobación de despliegue remoto. No se audita aquí toda la nueva tarjeta del modelo docente, I2f ni el resto de la rama. No se modificaron archivos F1, el modelo de datos ni la regla de asistencia de vocales. El P1 queda para corrección del implementador; no aprobar I2b con este fallo abierto.

## Ítem 15 — Reauditoría del correctivo P1 (2026-10-21)

Base auditada: `release/v1`, HEAD `37961e4`, implementación de Claude. **Veredicto del correctivo: PASS WITH WARNINGS.** El P1 de fechas nativas de Excel queda cerrado en este commit, con un P3 residual detallado abajo. El FAIL histórico de I2b no se convierte en aprobación integral: los dos P2 de concurrencia y contexto de institución siguen abiertos y fuera de esta reauditoría.

### Reproducción independiente y control negativo

Runner propio de auditoría, sin mocks de ExcelJS ni del importador: workbook con hojas `docentes`, `docente_materia` y `horarios_docentes`, docente sintético `20111222`, rol TITULAR/estado ACTIVO, materias M0–M7. Serializar con `workbook.xlsx.writeBuffer()`, leer con `parseTemplateV2TeachersWorkbook({name:'audit15.xlsx', arrayBuffer: async () => bytes})` y ejecutar `planTeacherAssignmentRows(datasets.docenteMateria, {today:new Date(2026,9,21)})`.

| Fila | Inicio / fin de vigencia | Resultado comprobado en 37961e4 |
| --- | --- | --- |
| M0 | fin `new Date('2020-01-01T00:00:00Z')` | `VIGENCIA_VENCIDA`, ninguna asignación |
| M1 | inicio `new Date('2099-01-01T00:00:00Z')` | `VIGENCIA_FUTURA`, ninguna asignación |
| M2 | inicio y fin `new Date('2026-10-21T00:00:00Z')` | única fila asignable, límites inclusivos |
| M3 | fórmula `DATE(2020,1,1)`, resultado Date UTC | `VIGENCIA_VENCIDA` |
| M4 | fórmula `DATE(2099,1,1)`, resultado Date UTC | `VIGENCIA_FUTURA` |
| M5 | fin `31/02/2026` | `VIGENCIA_INVALIDA`, rechazada |
| M6 | fin `no es fecha` | `VIGENCIA_INVALIDA`, rechazada |
| M7 | fin serial Excel `43831` | `VIGENCIA_VENCIDA` |

Se verificó que M0 y M3 llegan como `Date` después de reabrir el XLSX, incluyendo formato de celda `yyyy-mm-dd` para resultados de fórmula. El mismo dataset, ejecutado con el código de `git show 5356f82:src/services/bulkRoster.js`, admite incorrectamente M0, M1, M3, M4, M6 y M7. Solo se sustituyó el import del cliente Supabase por un stub sin red para evaluar el builder antiguo; ninguna regla de fechas se modificó en ese control.

### Fechas inválidas, formatos y zonas horarias

Además del round-trip XLSX: once entradas inválidas (`31/02/2026`, `2026-02-31`, `29/02/2025`, mes 13/00, día 00, texto, Date inválido, Infinity, NaN y serial negativo) devuelven `null`; el builder devuelve cero filas asignables y `estado='rechazada', motivo='VIGENCIA_INVALIDA'`. Se mantuvieron vacíos/null/undefined como ausencia de límite. Diez casos de normalización incluyen Date UTC, serial `46316` y fracción `46316.75`, ISO con hora, DD/MM/AAAA con y sin ceros y año bisiesto válido.

Se ejecutó el runner en procesos separados con `$env:TZ='America/Argentina/Buenos_Aires'` y `$env:TZ='UTC'`. Un control comprueba que `new Date('2026-10-21T00:00:00Z').getHours()` da 21 y 0 respectivamente; en ambos, `parseSheetDate` conserva `2026-10-21`. **28/28 tests terminados correctamente en cada zona: 25 propios y los 3 de `bulkRosterSheetDates.test.js`.** Dos de los propios son observaciones del P3 y prueban que se reproduce, no aceptación del defecto. Las fechas nativas no se desplazan al día previo en Argentina. CHIEF CODE AUDITOR independiente: mismo veredicto, sin P0/P1/P2 nuevos en este alcance.

### P3 residual — La parte horaria del texto ISO no se valida

`src/services/bulkRoster.js:75–76`: la expresión reconoce un calendario válido seguido de `T` o espacio y omite validar el resto. `parseSheetDate('2026-10-21Tbasura')` y `parseSheetDate('2026-10-21 texto')` devuelven `2026-10-21`; con `today=new Date(2026,9,21)` y cualquiera de esos valores en `vigencia_hasta`, el builder devuelve una asignación y cero rechazos. Reproducido en ambos TZ y confirmado por el revisor independiente. El comportamiento ya existía en el parser anterior; no reabre el P1 de Date nativa, pero impide afirmar rechazo de cualquier texto inválido.

Corrección propuesta, sin implementarla: acotar las formas ISO admitidas y validar el sufijo horario completo antes de extraer el calendario; conservar la semántica UTC de Date y probar sufijos inválidos frente a timestamps válidos. No se recomienda un parseo genérico dependiente del locale.

No se escribieron datos ni se invocó RPC remota. La reauditoría cierra el filtro previo a la RPC; no se repite el circuito SQL del hallazgo original porque ya no se genera payload para las filas inválidas/vencidas/futuras. No se aprueba el release global, el deploy ni la ejecución del 06/07 por este ítem.

Gate automatizado de esta base al cierre conjunto: `npm.cmd run check` PASS, 360 archivos / 2746 tests, auditorías de repositorio/bundle, lint y build PASS. Typecheck no disponible; aviso previo de chunks >500 kB. Este ítem mantiene **QUALITY GATE: PASS WITH WARNINGS** por el P3; los ítems SQL 16/17 tienen sus propios FAIL.

Nota de publicación: aparecieron cambios posteriores de Claude hasta `0a120d0`. Este informe audita `37961e4`; los hallazgos y los P2 históricos referidos arriba son estados de esa base, sin reauditoría de los correctivos posteriores.
