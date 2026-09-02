# Guia de snapshot real controlado

## 1. Objetivo

El snapshot real controlado sirve para probar el nuevo `examEngine` con datos
institucionales reales o semi-reales, sin tocar el flujo productivo.

Este enfoque permite auditar el comportamiento del motor nuevo con casos mas cercanos
al Instituto, pero siempre de forma manual, revisada y aislada. No debe leer estado
productivo automaticamente, no debe conectar UI y no debe ejecutar el motor viejo.

## 2. Que debe incluir el snapshot

El snapshot debe respetar el contrato viejo del workspace:

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

El objeto debe tratarse como input inmutable. Cualquier test o herramienta interna debe
clonarlo antes de adaptarlo o ejecutar el preview nuevo.

## 3. Datos minimos a cargar

El snapshot institucional deberia incluir:

- Carreras reales.
- Materias reales.
- Docentes reales o anonimizados.
- Horarios docentes.
- Correlatividades.
- Rango de fechas.
- Cantidad de llamados.
- Tipo de periodo regular o especial.

Los datos deben ser suficientes para que el adaptador pueda construir `docentes`,
`materias`, `correlatividades`, `fechasDisponibles`, `config`, `options` y `metadata`.

## 4. Recomendacion de anonimizacion

Se recomienda anonimizar antes de commitear cualquier fixture:

- Reemplazar nombres reales por `Docente 1`, `Docente 2`, etc.
- Mantener consistencia entre IDs y nombres anonimizados.
- No incluir datos personales sensibles innecesarios.
- No incluir alumnos si no son necesarios para generar mesas.
- Evitar documentos, telefonos, correos personales u observaciones administrativas.
- Mantener codigos de materia, carrera y llamados solo si son necesarios para auditar
  reglas institucionales.

La anonimizacion no debe romper relaciones internas: si un horario referencia
`docenteId: "docente-1"`, debe existir el docente canonico correspondiente o debe
tratarse explicitamente como caso negativo controlado.

## 5. Archivo sugerido para fixture futuro

```txt
src/utils/examEngine/comparison/__fixtures__/legacyWorkspaceSnapshotInstitutional.fixture.js
```

Ese archivo deberia exportar un unico snapshot revisado, por ejemplo:

```js
export const legacyWorkspaceSnapshotInstitutional = {
  alumnos: [],
  horariosDocentes: [],
  docentes: [],
  planesEstudio: [],
  correlatividades: [],
  fechaInicio: '',
  fechaFin: '',
  examType: 'regular',
  generationScope: {},
  regularCallRanges: {},
  selectedSpecialSubjectKeys: [],
}
```

## 6. Test futuro sugerido

```txt
src/utils/examEngine/comparison/institutionalSnapshotPreview.integration.test.js
```

Ese test deberia ejecutar solo el nuevo preview con input adaptado desde el snapshot
institucional controlado.

## 7. Que deberia validar ese test

- Adaptacion correcta del snapshot.
- Ejecucion del preview nuevo.
- `validation.valid === true`.
- `phase` en `success`, `warning` o `critical`.
- `plannedMesas` o `unassignedMesas` presentes.
- Alertas institucionales si corresponde.
- No mutacion del snapshot ni del input adaptado.
- Aislamiento de motor viejo, UI y `legacyAdapter`.

El test no debe depender de snapshots fragiles de valores completos. Debe validar
contrato, tipos, presencia de secciones y senales institucionales relevantes.

## 8. Que NO debe hacer

- No llamar `cronogramaInteligente`.
- No llamar `useCronogramaGeneration`.
- No tocar `GeneradorCronograma`.
- No conectar UI.
- No guardar cronogramas.
- No publicar.
- No reemplazar motor viejo.
- No usar datos reales sin revision.
- No importar `legacyAdapter`.
- No escribir archivos ni descargar resultados.
- No convertir el fixture institucional en fuente productiva.

## 9. Fixture institucional controlado

Archivo:

```txt
src/utils/examEngine/comparison/__fixtures__/legacyWorkspaceSnapshotInstitutional.fixture.js
```

Test:

```txt
src/utils/examEngine/comparison/institutionalSnapshotPreview.integration.test.js
```

El fixture contiene:

- 3 carreras.
- 12 materias.
- 10 docentes.
- Horarios docentes.
- Correlatividades.
- `regularCallRanges`.
- Config regular.
- 1 llamado.
- Fechas entre `2026-07-27` y `2026-08-07`.
- Datos anonimizados.
- `alumnos: []`.

El test valida:

- Adaptacion al input canonico.
- Ejecucion de `buildRegularExamPreviewIntegrationContract`.
- `validation.valid === true`.
- `uiSummary` presente.
- Mesas planificadas o pendientes con datos.
- Ausencia de `raw`.
- No mutacion del snapshot ni del input adaptado.
- Aislamiento de motor viejo, hook productivo, `legacyAdapter` y UI.

Este fixture es controlado y no productivo. No conecta datos reales automaticamente, no
ejecuta el motor viejo y no reemplaza el generador actual.

## 10. Comparación institucional controlada

Archivos:

```txt
src/utils/examEngine/comparison/__fixtures__/legacyWorkspaceSnapshotInstitutional.fixture.js
src/utils/examEngine/comparison/__fixtures__/legacyCronogramaInstitutionalResult.fixture.js
src/utils/examEngine/comparison/institutionalComparisonReport.integration.test.js
```

Flujo validado:

```txt
snapshot institucional
-> buildRegularExamInputFromWorkspaceSnapshot
-> buildRegularExamPreviewIntegrationContract
-> legacyCronogramaInstitutionalResult
-> buildRegularExamEngineComparison
-> buildRegularExamComparisonReport
-> buildRegularExamComparisonAuditSummary
-> exportRegularExamComparisonAuditSummary
```

Este caso cubre:

- 3 carreras institucionales anonimizadas.
- Ingles.
- Informatica/TIC.
- Practica pedagogica.
- Practica tecnica.
- Practicas Discursivas III.
- Titulares coherentes.
- Vocales completos.
- Mesas con un vocal.
- Mesas con `A designar`.
- Fechas entre `2026-07-27` y `2026-08-07`.
- Llamado normalizable a `PRIMER_LLAMADO`.
- Diferencias controladas para auditoria.

El test valida:

- Comparacion completa contra preview nuevo.
- Reporte comparativo.
- Resumen de auditoria.
- Export interno serializable.
- Metricas.
- No mutacion de snapshot, resultado legacy ni objetos intermedios.
- Aislamiento de motor viejo, hook productivo, `legacyAdapter` y UI.

Este caso sigue siendo controlado y no productivo. No ejecuta el motor viejo real, no
reemplaza el generador actual, no guarda cronogramas y no publica cronogramas.

## 11. Proximo paso recomendado

Agregar este caso como tercer modo controlado en `RegularExamComparisonAudit`:

- `normal`.
- `stress`.
- `institucional`.

Ese avance debe mantenerse sin ruta publica y sin integracion productiva.
