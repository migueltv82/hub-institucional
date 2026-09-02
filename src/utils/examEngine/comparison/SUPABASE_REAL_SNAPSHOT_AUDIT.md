# Auditoria read-only con snapshot real desde Supabase

## 1. Objetivo

Preparar una simulacion controlada del nuevo `examEngine` usando datos reales cargados
en Supabase, en modo solo lectura y sin afectar produccion.

El flujo debe leer datos autorizados, construir un snapshot compatible con el adaptador
existente y ejecutar el preview/auditoria del motor nuevo sin guardar, publicar ni
reemplazar cronogramas oficiales.

## 2. Cliente Supabase existente

Cliente principal:

```txt
src/lib/supabaseClient.js
```

Re-export:

```txt
src/lib/supabase.js
```

Variables publicas usadas:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_ANON_KEY` como fallback

Restricciones ya presentes:

- `src/lib/envGuards.js` bloquea variables publicas con nombres de `service_role`.
- No debe usarse `service_role` en frontend.
- La simulacion debe depender de RLS y permisos del usuario autenticado.

## 3. Servicios existentes relevantes

Servicios de lectura o referencia:

- `src/services/workspaceSnapshot.js`
  - Lee `workspace_snapshots`.
  - `fetchWorkspaceSnapshot` consulta `payload, updated_at`.
  - `saveWorkspaceSnapshot` escribe y no debe usarse en este flujo.
- `src/services/institutionInsights.js`
  - Lee `workspace_snapshots` para metricas por institucion.
- `src/services/rosterRecords.js`
  - Lee `student_records` y `teacher_records`.
  - Tambien contiene sincronizacion con upsert/delete; esas funciones no deben usarse.
- `src/modules/alumnos/services/academicRelationalData.js`
  - Lee `subject_enrollments`, `exam_enrollments` y `student_grades` cuando la transicion
    academica lo habilita.
- `src/modules/alumnos/services/studentPortalSecureReadModel.js`
  - Usa RPC `get_student_portal_workspace_snapshot` para lectura segura del portal alumno.
  - No es suficiente para auditoria completa porque filtra datos por estudiante.

## 4. Tablas encontradas o esperadas

Fuente preferida para esta simulacion:

- `workspace_snapshots`
  - Campos usados: `institution_id`, `workspace_key`, `payload`, `updated_at`.
  - El `payload` ya conserva la forma historica del workspace.

Tablas de apoyo disponibles:

- `student_records`
  - Puede aportar alumnos normalizados.
- `teacher_records`
  - Puede aportar docentes normalizados.
- `institutions`
  - Puede aportar nombre/identidad institucional para metadata.
- `memberships`
  - Controla permisos de acceso por institucion.
- `profiles`
  - Identidad y roles de usuarios.

Tablas academicas relacionales disponibles si la migracion esta aplicada:

- `subject_teacher_assignments`
- `exam_teacher_assignments`
- `subject_enrollments`
- `exam_enrollments`
- `student_grades`

Tablas esperadas pero no observadas como fuente canonica actual del generador:

- `carreras`
- `materias`
- `horarios_docentes`
- `correlatividades`
- `exam_ranges` o tabla equivalente de rangos de mesa

Hoy esos datos viven principalmente dentro de `workspace_snapshots.payload`.

## 5. Snapshot real propuesto

La salida read-only debe respetar el contrato viejo:

```js
{
  alumnos,
  horariosDocentes,
  docentes,
  planesEstudio,
  correlatividades,
  fechaInicio,
  fechaFin,
  examType,
  generationScope,
  regularCallRanges,
  selectedSpecialSubjectKeys
}
```

Transformacion recomendada desde `workspace_snapshots.payload`:

- `payload.alumnos` -> `alumnos`
- `payload.horariosDocentes` -> `horariosDocentes`
- `payload.docentes` -> `docentes`
- `payload.planesEstudio` -> `planesEstudio`
- `payload.correlatividades` -> `correlatividades`
- `payload.fechaInicio` -> `fechaInicio`
- `payload.fechaFin` -> `fechaFin`
- `payload.examGenerationConfig.examType` -> `examType`
- `payload.examGenerationConfig.generationScope` -> `generationScope`
- `payload.examGenerationConfig.regularCallRanges` -> `regularCallRanges`
- `payload.examGenerationConfig.selectedSpecialSubjectKeys` -> `selectedSpecialSubjectKeys`

El snapshot resultante debe clonarse y tratarse como inmutable.

## 6. Datos faltantes o a confirmar

Antes de simular con datos reales hay que confirmar:

- Que existe al menos un `workspace_snapshots.payload` actualizado para la institucion.
- Que `workspace_key` esperado sea `main` u otro valor conocido.
- Que `payload.planesEstudio` contenga materias y carreras suficientes.
- Que `payload.horariosDocentes` permita inferir titulares y disponibilidad.
- Que `payload.docentes` tenga IDs/nombres consistentes con horarios.
- Que `payload.correlatividades` tenga formato compatible con el adaptador.
- Que `payload.examGenerationConfig.regularCallRanges` tenga fechas reales del periodo.
- Que no sea necesario incluir alumnos reales; si no aportan al preview, pueden omitirse
  o anonimizarse.
- Que no haya datos sensibles innecesarios en `payload` antes de generar reportes.

## 7. Funcion futura propuesta

Nombre sugerido:

```js
buildLegacyWorkspaceSnapshotFromSupabase()
```

Ubicacion sugerida:

```txt
src/utils/examEngine/supabaseAudit/buildLegacyWorkspaceSnapshotFromSupabase.js
```

Firma tentativa:

```js
buildLegacyWorkspaceSnapshotFromSupabase({
  supabaseClient,
  institutionId,
  workspaceKey = 'main',
  anonymize = false,
  overrides = {},
})
```

Responsabilidad:

- Leer solo datos autorizados desde Supabase.
- Preferir `workspace_snapshots.payload`.
- Normalizar el payload al contrato viejo.
- Remover campos que no forman parte del contrato de simulacion.
- Aplicar overrides controlados de fechas/config si hace falta.
- Opcionalmente anonimizar docentes/alumnos manteniendo consistencia de IDs.

No debe:

- Llamar `saveWorkspaceSnapshot`.
- Llamar `syncRosterRecords`.
- Ejecutar `insert`, `upsert`, `update` ni `delete`.
- Invocar Edge Functions de administracion.
- Usar `service_role`.
- Guardar resultados en Supabase.

## 8. Lecturas permitidas

Lectura minima recomendada:

```txt
workspace_snapshots.select('payload, updated_at')
  .eq('institution_id', institutionId)
  .eq('workspace_key', workspaceKey)
  .maybeSingle()
```

Lecturas opcionales de enriquecimiento:

```txt
student_records.select(...)
teacher_records.select(...)
institutions.select('id, name, slug')
```

Las tablas relacionales academicas solo deberian leerse si existe una necesidad concreta
de validar inscripciones, notas o asignaciones docentes fuera del `payload`.

## 9. Flujo de simulacion

Flujo recomendado:

```txt
Supabase read-only
-> buildLegacyWorkspaceSnapshotFromSupabase
-> buildRegularExamInputFromWorkspaceSnapshot
-> buildRegularExamPreviewIntegrationContract
-> buildRegularExamEngineComparison si existe legacyResult controlado
-> buildRegularExamComparisonReport
-> buildRegularExamComparisonAuditSummary
-> exportRegularExamComparisonAuditSummary opcional, en memoria
```

El preview nuevo puede ejecutarse sin comparar contra motor viejo real. Si se compara,
el `legacyResult` debe venir de una salida controlada o exportada manualmente, no de una
ejecucion automatica del motor viejo.

## 10. Interpretacion de resultados

Estados esperados:

- `success`: el preview pudo planificar sin problemas relevantes.
- `warning`: hay diferencias o advertencias institucionales revisables.
- `critical`: hay reglas duras incumplidas o datos incompletos importantes.

`critical` no implica necesariamente error tecnico. Puede indicar materias sin titular,
docentes sin disponibilidad, fechas insuficientes, llamados incompatibles o mesas sin
tribunal.

El resultado no debe presentarse como cronograma oficial.

## 11. Anonimizacion

Si los resultados se commitean como fixture o se comparten fuera del entorno local:

- Reemplazar nombres reales por `Docente 1`, `Docente 2`, etc.
- Mantener consistencia entre `docenteId`, nombre y horarios.
- Evitar DNI, telefonos, correos y observaciones personales.
- Evitar incluir alumnos reales si no son necesarios.
- No guardar `raw_payload` completo en fixtures o exports internos.

La anonimizacion debe ocurrir antes de persistir cualquier fixture, no despues.

## 12. Riesgos

- Leer datos reales con permisos demasiado amplios.
- Exponer datos personales en fixtures, reportes o capturas.
- Confundir preview/auditoria con cronograma oficial.
- Usar accidentalmente funciones de escritura existentes.
- Usar `service_role` en frontend.
- Depender de `workspace_snapshots.payload` desactualizado.
- Perder informacion si las tablas relacionales ya son fuente primaria y el snapshot no
  fue sincronizado.
- Generar falsos positivos por IDs/nombres docentes inconsistentes.
- Interpretar `critical` como fallo tecnico cuando puede ser dato institucional
  incompleto.

## 13. Restricciones de solo lectura

Este flujo:

- No escribe en Supabase.
- No inserta datos.
- No actualiza datos.
- No borra datos.
- No guarda cronogramas.
- No publica cronogramas.
- No reemplaza el motor viejo.
- No toca UI productiva.
- No conecta rutas.
- No ejecuta `cronogramaInteligente`.
- No llama `useCronogramaGeneration`.
- No usa `legacyAdapter`.
- No usa `service_role`.

## 14. Controles recomendados antes de implementar

- Tests con Supabase mock que fallen si se llama `insert`, `upsert`, `update` o `delete`.
- Tests que verifiquen que solo se importa el cliente publico.
- Tests que verifiquen que el snapshot final no incluye `raw`.
- Tests de no mutacion del payload leido.
- Tests de transformacion de `examGenerationConfig` al contrato viejo.
- Tests con payload incompleto para validar errores controlados.
- Documentacion de variables de entorno permitidas.

## 15. Proximo paso recomendado

Crear una especificacion tecnica de `buildLegacyWorkspaceSnapshotFromSupabase()` con
tests read-only mockeados, antes de implementar cualquier lectura real.

La primera implementacion deberia leer solo `workspace_snapshots.payload`, devolver el
snapshot viejo normalizado y ejecutar el preview nuevo en un test aislado sin UI.
