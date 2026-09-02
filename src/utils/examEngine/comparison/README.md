# Comparacion controlada entre motor viejo y examEngine

## 1. Objetivo

Disenar una estrategia tecnica para comparar el motor viejo contra el nuevo `examEngine`
sin reemplazar el flujo actual de generacion.

Esta comparacion debe ser aislada, reproducible y sin efectos secundarios. El resultado
debe servir para auditoria interna y validacion progresiva, no para guardar, publicar ni
reemplazar cronogramas oficiales.

## 2. Entrada esperada

La comparacion debe partir de un snapshot del workspace con la misma forma de datos que
hoy usa el flujo productivo:

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

El snapshot debe tratarse como entrada inmutable. Ninguna etapa de adaptacion o
comparacion debe modificar los arreglos u objetos originales.

## 3. Adaptador propuesto

Funcion implementada:

```js
buildRegularExamInputFromWorkspaceSnapshot(snapshot)
```

Responsabilidad: convertir el snapshot actual del workspace al contrato canonicamente
esperado por el nuevo motor regular.

Debe convertir:

- `planesEstudio` -> `materias`
- `horariosDocentes` / `docentes` -> docentes canonicos
- `correlatividades` -> correlatividades canonicas
- `fechaInicio` / `fechaFin` / `regularCallRanges` -> `fechasDisponibles`
- `examType` / `generationScope` -> `config`
- banderas de generacion -> `options`

Salida sugerida:

```js
{
  docentes,
  materias,
  correlatividades,
  fechasDisponibles,
  config,
  options,
  metadata
}
```

La metadata puede incluir mapas auxiliares para comparar nombres e IDs, por ejemplo
`teacherNameToId`, `subjectCodeToId` o advertencias de datos incompletos. Esos mapas no
deben ser requeridos por el motor nuevo para generar.

## 4. Comparador propuesto

Funcion implementada:

```js
buildRegularExamEngineComparison({ legacyResult, newPreview })
```

Responsabilidad: normalizar ambas salidas y producir un reporte de diferencias legible.

Debe comparar:

- Cantidad de mesas
- Titulares
- Vocales
- Llamados
- Fechas
- Correlatividades
- Mesas sin tribunal
- Warnings y errores
- Compactaciones

El comparador no debe llamar a ningun motor. Debe recibir resultados ya generados para
mantener separadas las responsabilidades de generacion y comparacion.

## 5. Clave de matching

Clave sugerida para emparejar mesas:

```txt
carrera + materia/codigo + llamado
```

Regla recomendada:

- Normalizar carrera.
- Preferir codigo de materia si existe.
- Usar nombre de materia como fallback.
- Normalizar llamado antes de construir la clave.
- Tratar mesas compactadas como caso especial, porque una mesa nueva puede representar
  mas de una materia.

## 6. Salida normalizada sugerida

```js
{
  legacySummary,
  newSummary,
  diffs,
  unmatchedLegacyMesas,
  unmatchedNewMesas,
  warnings,
  recommendations
}
```

Campos esperados:

- `legacySummary`: resumen del resultado viejo normalizado.
- `newSummary`: resumen del preview nuevo normalizado.
- `diffs`: diferencias por mesa o por dimension comparada.
- `unmatchedLegacyMesas`: mesas del motor viejo sin par equivalente en el nuevo.
- `unmatchedNewMesas`: mesas del nuevo motor sin par equivalente en el viejo.
- `warnings`: advertencias del proceso de comparacion.
- `recommendations`: acciones sugeridas para revisar datos o reglas.

## 7. Reglas de comparacion

- Comparar vocales como set, no por posicion, salvo que una regla futura requiera
  distinguir `vocal1` y `vocal2`.
- Normalizar llamados antes de comparar, por ejemplo `first`, `PRIMER_LLAMADO` y
  variantes equivalentes.
- Comparar fechas en formato ISO.
- Normalizar nombres docentes removiendo diferencias de mayusculas, espacios y tildes.
- Tratar mesas compactadas aparte, porque pueden cambiar la cantidad total de filas.
- Comparar errores y warnings por codigo y severidad antes que por texto.
- Separar diferencias criticas de diferencias explicables por reglas nuevas.
- No considerar el orden de las mesas como diferencia funcional.

## 8. Riesgos

- IDs vs nombres pueden generar falsos positivos si no existe una tabla de equivalencias.
- La compactacion puede cambiar la cantidad de mesas sin ser necesariamente un error.
- Las exportaciones viejas esperan campos viejos como `profesorTitular`, `vocal1`,
  `vocal2`, `fechaIso` y `exam_call`.
- El nuevo motor separa `plannedMesas` y `unassignedMesas`, mientras el viejo devuelve
  un cronograma consumible por la UI actual.
- No se debe confundir preview con cronograma oficial.
- Diferencias de codigo de materia o carrera pueden impedir matching correcto.
- Reglas nuevas pueden producir warnings mas estrictos que el motor viejo.

## 9. Que NO debe hacer

- No guardar cronograma.
- No publicar cronograma.
- No reemplazar motor viejo.
- No tocar UI productiva.
- No usar `legacyAdapter`.
- No modificar el flujo actual.
- No modificar exportaciones oficiales.
- No depender de rutas ni componentes productivos.

## 10. Estado implementado del paquete aislado

Ya existen fixtures minimos, adaptador puro, comparador puro, test de integracion
aislado y reporte puro dentro de `src/utils/examEngine/comparison/`.

Estas piezas siguen sin conectar hooks, componentes, rutas ni flujo productivo.

## 11. Flujo actual aislado

Flujo documentado para auditoria interna:

```txt
snapshot viejo
-> buildRegularExamInputFromWorkspaceSnapshot
-> salida legacy fixture / salida preview fixture
-> buildRegularExamEngineComparison
-> buildRegularExamComparisonReport
```

Este flujo permite adaptar datos con forma vieja, comparar salidas ya disponibles y
generar un reporte legible sin ejecutar motores reales ni conectar UI.

## 12. Que hace cada pieza

- `legacyWorkspaceSnapshot.fixture.js`: representa un snapshot minimo y realista del
  workspace viejo con alumnos, docentes, horarios, planes, correlatividades, fechas y
  opciones de generacion.
- `buildRegularExamInputFromWorkspaceSnapshot.js`: convierte el snapshot viejo al input
  canonico esperado por el nuevo `examEngine`, devolviendo `docentes`, `materias`,
  `correlatividades`, `fechasDisponibles`, `config`, `options` y `metadata`.
- `buildRegularExamEngineComparison.js`: recibe `legacyResult` y `newPreview` ya
  generados o fixtureados, normaliza ambas salidas y produce summaries, diffs,
  mesas sin equivalente, warnings, recomendaciones y metadata.
- `buildRegularExamComparisonReport.js`: transforma el resultado de comparacion en un
  reporte legible para auditoria interna con `status`, `executiveSummary`, secciones,
  diffs criticos, warnings, recomendaciones y metadata.
- Fixtures legacy/new preview: proveen salidas controladas para probar comparacion,
  pendientes, compactaciones, warnings y errores sin ejecutar ningun motor.

## 13. Que NO hace este flujo

- No ejecuta `cronogramaInteligente`.
- No ejecuta `useCronogramaGeneration`.
- No ejecuta `generateRegularExamPlan` en este flujo.
- No toca UI.
- No guarda cronogramas.
- No publica cronogramas.
- No reemplaza motor viejo.
- No usa `legacyAdapter`.
- No modifica exportaciones oficiales.

## 14. Estado de seguridad

- Es solo comparacion aislada.
- Usa fixtures y utilidades puras.
- No conecta datos reales todavia.
- No afecta el flujo productivo.
- No agrega rutas, pantallas productivas ni botones oficiales.
- No produce cronogramas oficiales ni archivos de exportacion.

## 15. Caso stress / auditoria negativa controlada

Archivo usado:

- `legacyWorkspaceSnapshotStress.fixture.js`

Test que lo valida:

- `adaptedSnapshotPreviewStress.integration.test.js`

Casos cubiertos:

- 3 carreras.
- 8 materias.
- 7 docentes.
- Docente sin disponibilidad cargada.
- Materia sin titular.
- Materia con titular inexistente.
- Correlatividad `ING1 -> ING2`.
- Ingles transversal.
- Informatica/TIC.
- `Practicas Discursivas III` no agrupable.
- Fechas insuficientes.
- Config regular con 1 llamado.

El test valida:

- El snapshot se adapta sin romper.
- El nuevo preview devuelve `warning` o `critical`.
- `validation.valid` sigue `true`.
- Hay alertas visuales.
- Hay revision pendiente.
- No incluye `raw`.
- No muta datos.
- No toca motor viejo ni UI.

Este caso no representa fallo tecnico. Representa datos institucionales incompletos o
problematicos que el nuevo motor debe detectar y reportar.

## 16. Comparacion stress legacy vs preview nuevo

Archivos usados:

- `legacyWorkspaceSnapshotStress.fixture.js`
- `legacyCronogramaStressResult.fixture.js`
- `stressComparisonReport.integration.test.js`

Flujo probado:

```txt
snapshot stress
-> buildRegularExamInputFromWorkspaceSnapshot
-> buildRegularExamPreviewIntegrationContract
-> buildRegularExamEngineComparison
-> buildRegularExamComparisonReport
```

El fixture legacy stress cubre:

- Mesas completas.
- Titular `A designar`.
- Vocal `A designar`.
- Fechas distintas al preview.
- Llamados normalizables.
- Ingles.
- Informatica/TIC.
- `Practicas Discursivas III` no agrupada.
- Mesa legacy sin equivalente.
- Mesa nueva sin equivalente.

El test valida:

- `status` `WARNING` o `CRITICAL`.
- Diffs.
- Recomendaciones.
- Diferencias de titular.
- Diferencias de vocal.
- Diferencias de fecha.
- Unmatched legacy.
- Unmatched new.
- No mutacion.
- Aislamiento de motor viejo, hook productivo, `legacyAdapter` y UI.

Este flujo no ejecuta el motor viejo real. Este flujo no reemplaza el generador actual.
Este flujo es solo auditoria comparativa aislada.

## 17. Resumen breve de auditoria comparativa

Archivo:

- `buildRegularExamComparisonAuditSummary.js`

Funcion:

```js
buildRegularExamComparisonAuditSummary(report)
```

Recibe el reporte generado por:

```js
buildRegularExamComparisonReport(comparison)
```

Devuelve:

- `status`
- `title`
- `summaryText`
- `keyFindings`
- `criticalItems`
- `warnings`
- `recommendedActions`
- `metrics`
- `metadata`

Sirve para:

- Leer rapidamente el estado de comparacion.
- Detectar diferencias criticas.
- Resumir riesgos institucionales.
- Orientar revision manual.
- Evitar leer todos los diffs tecnicos.

Que NO hace:

- No ejecuta motor viejo.
- No ejecuta motor nuevo.
- No toca UI.
- No guarda ni publica cronogramas.
- No reemplaza el generador actual.

Flujo completo actualizado:

```txt
snapshot viejo
-> adaptador
-> preview nuevo
-> comparador
-> reporte comparativo
-> resumen de auditoria
```

Esta capa es la salida final de lectura humana del flujo de auditoria aislada. Trabaja
solo con el reporte ya generado y no conoce snapshots, hooks, rutas ni componentes.

## 18. Export interno del resumen de auditoria

Archivo:

- `exportRegularExamComparisonAuditSummary.js`

Funcion:

```js
exportRegularExamComparisonAuditSummary(summary, options)
```

Recibe el resumen generado por:

```js
buildRegularExamComparisonAuditSummary(report)
```

Devuelve un objeto JSON serializable con:

- `exportedAt`
- `institutionName`
- `periodLabel`
- `status`
- `title`
- `summaryText`
- `keyFindings`
- `criticalItems`
- `warnings`
- `recommendedActions`
- `metrics`
- `metadata`

Opciones:

- `institutionName`
- `periodLabel`
- `includeMetadata`

Garantiza:

- No muta input.
- Elimina `undefined`, `functions` y `symbols`.
- Maneja ciclos como `"[Circular]"`.
- Mantiene campos estables.

Que NO hace:

- No descarga archivos.
- No escribe archivos fisicos.
- No genera documentos oficiales.
- No ejecuta motor viejo.
- No ejecuta motor nuevo.
- No toca UI.
- No reemplaza el generador actual.

Flujo completo actualizado:

```txt
snapshot viejo
-> adaptador
-> preview nuevo
-> comparador
-> reporte comparativo
-> resumen de auditoria
-> export interno serializable
```

## 19. Contrato completo del flujo de auditoria

Archivo:

- `fullComparisonAuditContract.test.js`

Flujo validado:

```txt
snapshot stress
-> adaptador
-> preview nuevo
-> comparador
-> reporte comparativo
-> resumen de auditoria
-> export interno serializable
```

Este test funciona como garantia del pipeline aislado de auditoria comparativa. Valida
que el export final mantenga un contrato estable para consumo interno, sin depender de
snapshots fragiles de valores completos.

Garantiza:

- Contrato estable del export final.
- Campos obligatorios del objeto exportado.
- Metricas obligatorias.
- `status` `WARNING` o `CRITICAL` en el caso stress.
- Respeto de `institutionName` y `periodLabel`.
- Presencia de `exportedAt`.
- `JSON.stringify` valido.
- Ausencia de `undefined`, `functions` y `symbols`.
- No mutacion de snapshots, input adaptado, preview, comparacion, reporte, resumen ni
  export.
- Aislamiento respecto de motor viejo, `legacyAdapter` y UI.

Campos finales validados:

- `exportedAt`
- `institutionName`
- `periodLabel`
- `status`
- `title`
- `summaryText`
- `keyFindings`
- `criticalItems`
- `warnings`
- `recommendedActions`
- `metrics`
- `metadata`

Metricas obligatorias:

- `totalLegacyMesas`
- `totalNewMesas`
- `totalDiffs`
- `totalCriticalDiffs`
- `unmatchedLegacyCount`
- `unmatchedNewCount`
- `compactedNewCount`

Aclaraciones:

- Este test no ejecuta el motor viejo real.
- No conecta UI.
- No publica ni guarda cronogramas.
- Solo valida el pipeline aislado de auditoria.

Flujo completo actualizado:

```txt
snapshot viejo/stress
-> adaptador
-> preview nuevo
-> comparador
-> reporte
-> resumen
-> export interno validado
```

## 20. Criterios institucionales de interpretacion

Estos criterios orientan la lectura institucional de los estados `OK`, `WARNING` y
`CRITICAL` generados por el reporte comparativo. No cambian el resultado tecnico del
pipeline: ayudan a decidir que requiere revision manual antes de cualquier integracion
visible.

### OK

Una comparacion puede considerarse aceptable cuando:

- No hay diferencias criticas.
- No hay mesas sin tribunal.
- No hay titulares conflictivos.
- No hay llamados incompatibles.
- Las diferencias menores estan documentadas y tienen explicacion institucional.

Acciones recomendadas:

- Revisar una muestra representativa.
- Aprobar el resultado como comparable para auditoria interna.

### WARNING

Una comparacion debe considerarse advertencia revisable cuando aparecen diferencias o
alertas que no invalidan automaticamente el preview, pero requieren confirmacion:

- Diferencias de fecha no criticas.
- Compactaciones nuevas justificadas.
- Vocales distintos pero validos.
- Mesas con un vocal.
- Warnings de disponibilidad.
- Diferencias de cantidad explicadas por compactacion.
- Pendientes menores de revision manual.

Acciones recomendadas:

- Revisar diferencias detectadas.
- Validar compactaciones.
- Revisar docentes en limite.
- Validar fechas.

### CRITICAL

Una comparacion debe considerarse critica cuando aparecen incumplimientos duros o
diferencias que podrian invalidar el uso institucional del resultado:

- Materia sin titular.
- Titular inexistente.
- Titular diferente sin justificacion.
- Titular usado como vocal.
- Mesa sin tribunal.
- Correlatividad invertida.
- Llamado faltante o incorrecto.
- Mesa legacy sin equivalente importante.
- Mesa nueva sin equivalente importante.
- Docente excedido en mitad mas uno.
- Vocal sin afinidad.
- Fecha imposible o sin disponibilidad del titular.

Acciones recomendadas:

- No usar el resultado como cronograma.
- Corregir datos de entrada.
- Revisar titularidades.
- Revisar disponibilidad.
- Volver a generar preview.

`CRITICAL` no significa necesariamente error tecnico. Puede representar datos
institucionales incompletos, inconsistencias del snapshot o reglas duras incumplidas
que el nuevo motor detecta y reporta.

Uso futuro:

- Estos criterios serviran para decidir que mostrar en una futura pantalla de
  comparacion.
- No conectan UI.
- No reemplazan el motor viejo.
- No habilitan guardado, publicacion ni exportaciones oficiales.

## 21. Validacion ejecutable de criterios institucionales

Archivo:

- `comparisonStatusCriteria.test.js`

Este test protege la interpretacion institucional de la auditoria comparativa mediante
reportes controlados que pasan por:

```txt
buildRegularExamComparisonReport
-> buildRegularExamComparisonAuditSummary
```

Valida:

- `OK` sin diferencias criticas.
- `WARNING` con diferencias revisables.
- `CRITICAL` con incumplimientos fuertes.
- `CRITICAL` como lectura institucional, no como error tecnico.
- `AuditSummary` alineado con el `status` del reporte.
- Acciones recomendadas por estado.
- No mutacion de comparaciones ni reportes controlados.
- Aislamiento de motor viejo, hook productivo, `legacyAdapter` y UI.

Aclaraciones:

- Este test no conecta UI.
- No ejecuta motor viejo.
- No reemplaza el generador actual.
- Si se cambia la logica de clasificacion, estos tests deben seguir pasando o
  ajustarse con decision institucional explicita.

## 22. Superficie publica controlada

Archivo:

- `index.js`

Los futuros consumidores de la capa `comparison` deben importar desde:

```js
import {
  buildRegularExamInputFromWorkspaceSnapshot,
  buildRegularExamEngineComparison,
  buildRegularExamComparisonReport,
  buildRegularExamComparisonAuditSummary,
  exportRegularExamComparisonAuditSummary,
} from './comparison/index.js'
```

Exports publicos permitidos:

- `buildRegularExamInputFromWorkspaceSnapshot`
- `buildRegularExamEngineComparison`
- `buildRegularExamComparisonReport`
- `buildRegularExamComparisonAuditSummary`
- `exportRegularExamComparisonAuditSummary`

No se deben importar desde archivos internos salvo dentro de tests o desarrollo de esta
misma capa. El indice no exporta fixtures, helpers internos, tests, preview integration,
hooks, UI, motor viejo, `legacyAdapter` ni funciones que guarden, publiquen o exporten
cronogramas oficiales.

Test que lo protege:

- `comparisonIndex.test.js`

## 23. Proximo paso tecnico recomendado

Mantener este paquete como base de auditoria aislada y revisar periodicamente los
criterios ejecutables cuando cambien reglas institucionales o severidades del motor
nuevo.

Ese paso deberia mantenerse dentro de `src/utils/examEngine/comparison/` o en un harness
interno equivalente, usando tests y fixtures antes de cualquier integracion visible.
