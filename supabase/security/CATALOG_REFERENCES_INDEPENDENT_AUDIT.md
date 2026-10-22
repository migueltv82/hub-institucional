# Ítem 17 — Auditoría independiente de referencias al catálogo

Fecha: 2026-10-21. Base auditada: `release/v1`, `37961e4`; implementación `972613c`. Auditor: Codex, independiente del implementador. Solo Docker local y bases descartables; ningún SQL remoto ni deploy. Implementación y harness originales sin modificar.

**Veredicto: FAIL. El 07 completo no queda habilitado para Producción.**

## Hallazgos reproducidos

### P2 — Los cinco WHERE nuevos dejan de normalizar espacios no vacíos

Archivo `supabase/schema/07_academic_operations.sql`, líneas 188, 211, 232, 246 y 259. El SET transforma `workspace_key = ' main '` en `'main'`, pero el WHERE solo comprueba NULL o `btrim(workspace_key) = ''`. Una fila con los demás campos normales queda excluida. También sucede con los campos recortados de estado/tipo/escala cuando contienen espacios no vacíos.

Reproducción diferencial SQL: crear una tabla temporal con las columnas y tipos de cada tabla, insertar todos los campos que toca el SET con valores normales salvo `workspace_key=' main '`, ejecutar el UPDATE exacto del HEAD y luego el mismo SET sin WHERE (comportamiento anterior). En las cinco tablas: nuevo=`' main '`, anterior=`'main'`. No depende de datos remotos ni de RLS. Además, una clase real persistida con workspace espaciado siguió espaciada después de reejecutar el 07 completo. Para construir ese dato legacy se deshabilitaron temporalmente triggers de usuario en la base descartable; el gateway correctamente impide mover el workspace durante operación normal.

Impacto: incumple la equivalencia de normalización exigida; datos legacy con espacios pueden quedar fuera de consultas que buscan el workspace canónico. Propuesta: expresar el predicado con `IS DISTINCT FROM` contra cada expresión normalizada (o incluir comparación con `btrim`), sin volver al UPDATE incondicional. Agregar prueba diferencial sobre datos legacy.

### P2 — El conflicto de creación de clase conserva una referencia obsoleta

Archivo `supabase/schema/07_academic_operations.sql`, líneas 871–874 y creación de `set_plan_subject_reference` al final. La RPC `academic_teacher_create_class_session` usa `ON CONFLICT DO UPDATE SET topic=excluded.topic`. El trigger UPDATE solo observa institución, materia, carrera y referencia; cambiar topic no lo dispara. El trigger BEFORE INSERT sí calcula la referencia nueva, pero el DO UPDATE no copia ese valor de `excluded`.

Reproducción: clase ya existente con referencia al primer plan; publicar un segundo plan activo con la misma materia; repetir la RPC autenticada docente para la misma fecha con otro tema. La RPC responde OK, cambia el tema y conserva `a6000000-0000-4000-8000-000000000001`, aunque la resolución actual sin alumno es NULL por ambigüedad. El fixture conservó explícitamente la referencia vieja con triggers deshabilitados para reconstruir el estado previo a la publicación, ya que el harness original había ejecutado un backfill que la borraba.

Impacto: la nueva FK valida existencia y tenant, pero la referencia puede contradecir la resolución vigente después de la escritura real. Propuesta: disparar la referencia en cualquier UPDATE, o incluir la columna recalculada en el DO UPDATE; cubrir también una clase NULL cuya materia se publica posteriormente. Los conflictos de cursadas y notas sí escriben `student_record_id`, columna observada.

### P2 — El resolver nuevo no rechaza carrera ambigua como el resolver existente

Archivo `supabase/schema/07_academic_operations.sql`, función `academic_resolve_plan_subject_id` (CTE candidates) frente a `academic_resolve_catalog_subject`. El existente cuenta primero las carreras cuyo nombre o código coincide y rechaza si hay más de una. El nuevo une primero planes y materias: una carrera coincidente sin esa materia desaparece de candidates y puede elegirse silenciosamente la otra.

Reproducción ejecutada: en A ya existe la carrera de código externo `FIX-A`; crear otra carrera de nombre `FIX-A`, código `OTHER-CODE`, sin planes. Consultar ambos resolvers con carrera `FIX-A`, materia `FIX-A-01` y el legajo A. Resultado existente=`CARRERA_AMBIGUA`, nuevo=`a6000000-0000-4000-8000-000000000001`. La ambigüedad de carrera se confunde con la de planes, incumpliendo la resolución compartida solicitada. Propuesta: resolver primero exactamente una carrera con el mismo criterio del resolver existente; devolver NULL ante carrera ambigua; después aplicar la precedencia de planes. Agregar test de colisión nombre/código entre dos carreras.

## Evidencia ejecutada

- Harness original `node scripts/validateCatalogReferencesLocal.mjs`: **27/27 PASS**, run `deff94386073db88`, cleanup databases=0, errors=[]. Esto no invalida los defectos: su corrección de nota ya tenía una referencia correcta y su prueba de clases solo ejercía INSERT.
- Contrato: columna, FK compuesta y trigger en las cuatro tablas; funciones internas SECURITY DEFINER con search_path vacío, sin EXECUTE para anon/authenticated; llamada directa alumno rechazada 42501.
- Escrituras reales: cursada, nota, clase, asignación directa y carga masiva; manipulación manual y referencia cross-tenant sobrescritas; materia fuera del catálogo queda NULL.
- Ambigüedad de planes: alumno con plan activo, único plan total, único plan activo y varios planes activos sin alumno cubiertos por fixture original y revisión del SQL.
- Backfill: fingerprints de todos los updated_at y revisiones de Storage idénticos antes/después y en tercera corrida. La comparación incluye todas las filas, no solo max(updated_at), preservando el orden relativo de condiciones.
- Fallo inyectado dentro del bloque atómico después de deshabilitar triggers en la segunda tabla: operación abortada y estados de TODOS los triggers idénticos al estado anterior. No se modificó el SQL de implementación; se ejecutó una copia mutada solo en la base descartable.
- Rol `postgres`: `rolsuper=false`; dueño de las cuatro tablas=`postgres`. El bloque exacto de backfill corrió como ese rol. El clon necesita GRANT USAGE/CREATE en public y EXECUTE del resolver para reproducir privilegios de propiedad del SQL Editor: el baseline crea algunas funciones como supabase_admin. Reejecutar el 07 completo como postgres en ese clon falla por propiedad de funciones preexistentes; no se atribuye ese artefacto al producto ni se presenta como prueba completa del SQL Editor real.
- Control negativo ejecutado: copia del 07 con los cinco WHERE retirados, conservando el bloque de referencias; cambian fingerprints de timestamps/revisiones, como debe detectar la prueba. Antes se restauró el workspace del fixture para no confundir el control con la protección de movimiento del gateway.
- FK NO ACTION: borrado de materia referenciada rechazado 23503; integridad tenant verificada. El supuesto control positivo original `DELETE ... AND false` toca cero filas y no prueba borrado efectivo; esta limitación se explicita, no se toma como evidencia de borrado.
- Purga I3 original: **PASS**, run `8a74fa468d64c8a1`; 40 tablas, A=0 filas al final, B idéntica, 4 usuarios exclusivos eliminados y 3 protegidos conservados, guard de Storage y segunda ejecución correctos. Cleanup bases/contenedores/temporales=0.

### P2 — La eliminación directa de institución con gateway no funciona

Reproducción: `DELETE FROM public.institutions WHERE id='a1000000-0000-4000-8000-000000000001'` en el fixture con gateway y referencias. SQLSTATE 23503, restricción `source_file_workspace_revisions_institution_id_fkey`. El hook intenta registrar una revisión durante la cascada, cuando la institución ya está eliminada. Además la FK de `source_file_workspace_revisions.institution_id` no declara ON DELETE CASCADE, por lo que deshabilitar triggers de usuario tampoco basta: queda la revisión existente bloqueando la eliminación. No se certifica cascada directa PASS. La purga I3 explícita sí pasa porque limpia estos recursos en orden.

Archivo relacionado preexistente: `supabase/security/source_file_storage_gateway.sql`, líneas 5–6 (revisiones), 46 y 62 (otros recursos con FK a institución sin cascada). Propuesta: definir un único contrato de borrado institucional; si debe ser cascada directa, adaptar las FK y hacer que los hooks no reconstruyan revisiones durante esa eliminación, conservando la integridad y la protección del gateway. La auditoría no modifica la implementación. **Control de atribución ejecutado:** retirar solamente las cuatro FK nuevas y repetir el DELETE produce el mismo mensaje y SQLSTATE 23503 de `source_file_workspace_revisions_institution_id_fkey`. El bloqueo es preexistente; no es una regresión atribuible a esas FK. Sigue abierto frente al requisito explícito de cascada directa.

## Corrida independiente final y regresiones

Runner propio fuera del checkout: `../audit17/runAudit17.mjs`; resultado crudo `../audit17/final-audit-result.json`. Run `f9bd2c2f43e9be1b`: **40 checks, 32 PASS, 8 FAIL**, que reproducen tres defectos nuevos (carrera ambigua, conflicto clase y normalización, este último con seis assertions). La cascada preexistente se captura y compara con y sin las FK nuevas; el PASS de ese control significa atribución confirmada, no DELETE exitoso. Resultado general FAIL, cleanup databases=0, errors=[]. El proceso terminó en las assertions previstas, sin fallo de infraestructura ni cleanup pendiente.

Doce harness adicionales originales ejecutados, todos PASS y cada cleanup databases=0/errors=[]:

| Harness `validate…Local.mjs` | Run |
|---|---|
| AcademicStatusWrite | `9aa018e494da18ed` |
| AcademicStatusCheck | `186525ecaca9b307` |
| AcademicCatalog | `2ef6a1bb0f5233a3` |
| ExamEligibilityParity | `48cb53cf3a95eb53` |
| BulkRoster | `ffb94676f068a82f` |
| ExamActaResults | `52a969419043b226` |
| ExamPublication | `ad9f9ae62d5e4553` |
| InstitutionSuspension | `fdaf4031771a17d3` |
| MemberProfileLookup | `f87ea3e7596e802d` |
| TenantReadScope | `49c4ea70e61e44fa` |
| PublishCatalog | `527c0956206c54a8` |
| StudentHistoryImport | `1efa06fa2600ce1c` |

La purga y el harness de referencias constan arriba, además de estos doce. `TeacherAssignmentModel` corresponde a la auditoría independiente del ítem 16; no se duplica su ejecución aquí. Que estas regresiones pasen no cubre los casos adversariales fallidos.

## Alcance y gate

Sin cambios de runtime, RLS, RPC, tests o harness originales; únicamente esta evidencia. Runners y JSON crudos fuera del checkout en `../audit17/`. El gate de aplicación `npm.cmd run check` y la entrada de WORKLOG se integran por el agente principal. Sin commit ni push desde este auditor.

Security/RLS: las pruebas del contrato y tenant pasan. Performance: sin benchmark; la auditoría no certifica tiempos del lock exclusivo del backfill sobre volumen productivo. No se inspeccionó ni modificó Producción.

**QUALITY GATE: FAIL**

Actualización del coordinador: `npm.cmd run check` PASS en la base auditada, 360 archivos / 2746 tests; auditorías de repositorio/bundle, lint y build PASS. Typecheck no disponible; aviso previo de chunks >500 kB. CHIEF CODE AUDITOR validó el informe final y su atribución de defectos. Este resultado automatizado no cambia el FAIL ni habilita el 07.

Nota de publicación: aparecieron cambios posteriores de Claude hasta `0a120d0`. Este informe audita `37961e4`; no se reauditaron los correctivos posteriores ni se afirma que todos los hallazgos persistan en el nuevo HEAD. La publicación de evidencia no habilita Producción.
