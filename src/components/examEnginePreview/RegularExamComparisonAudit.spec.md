# RegularExamComparisonAudit

## 1. Nombre tentativo

- `RegularExamComparisonAudit`

## 2. Objetivo

Disenar una herramienta visual interna para mostrar la comparacion entre una salida
legacy fixture y el preview nuevo del `examEngine`.

La herramienta debe servir solo para auditoria tecnica e institucional. No debe
reemplazar el generador actual, no debe conectarse a rutas publicas y no debe operar
sobre datos reales sin snapshot controlado.

## 3. Flujo de datos

Flujo esperado:

```txt
legacyWorkspaceSnapshot fixture
-> buildRegularExamInputFromWorkspaceSnapshot
-> buildRegularExamPreviewIntegrationContract
-> legacyCronogramaResult fixture
-> buildRegularExamEngineComparison
-> buildRegularExamComparisonReport
-> buildRegularExamComparisonAuditSummary
-> exportRegularExamComparisonAuditSummary
```

Imports permitidos para la logica de comparacion:

```js
import {
  buildRegularExamInputFromWorkspaceSnapshot,
  buildRegularExamEngineComparison,
  buildRegularExamComparisonReport,
  buildRegularExamComparisonAuditSummary,
  exportRegularExamComparisonAuditSummary,
} from '../../utils/examEngine/comparison/index.js'
```

Import permitido para ejecutar el preview nuevo:

```js
import { buildRegularExamPreviewIntegrationContract } from '../../utils/examEngine/preview'
```

La herramienta no debe consumir archivos internos sueltos de `comparison`, salvo
fixtures de prueba o control dentro de un contenedor interno.

## 4. Datos que mostraria

- Estado general de auditoria.
- Resumen ejecutivo.
- Metricas.
- Diferencias criticas.
- Warnings.
- Recomendaciones.
- Mesas legacy sin equivalente.
- Mesas nuevas sin equivalente.
- Diferencias de titular, vocal, fecha y llamado.
- Export interno serializable.

## 5. Acciones permitidas

- Generar auditoria con fixture normal.
- Generar auditoria con fixture stress.
- Limpiar resultado.
- Ver resumen.
- Ver diferencias.
- Ver export interno.

Estas acciones deben operar solamente sobre fixtures o snapshots controlados. No deben
persistir cambios ni escribir archivos.

## 6. Acciones prohibidas

- Guardar cronograma.
- Publicar cronograma.
- Reemplazar motor viejo.
- Llamar motor viejo real.
- Usar `useCronogramaGeneration`.
- Modificar datos reales.
- Exportar cronograma oficial.
- Importar `legacyAdapter`.
- Conectar la herramienta a rutas publicas o menu productivo.

Los botones o controles asociados a acciones oficiales no deben existir como acciones
habilitadas. Si se muestran por claridad institucional, deben estar deshabilitados y
marcados como no disponibles.

## 7. Estados

- `idle`: no hay auditoria generada.
- `running`: se esta construyendo la auditoria interna.
- `ok`: la comparacion no presenta diferencias relevantes.
- `warning`: existen diferencias revisables o advertencias institucionales.
- `critical`: existen incumplimientos fuertes o diferencias que requieren revision
  manual antes de cualquier decision.
- `error`: fallo tecnico al construir la auditoria.

`critical` no debe interpretarse automaticamente como error tecnico. Puede representar
datos institucionales incompletos o reglas duras incumplidas.

## 8. Layout sugerido

### Encabezado

- Titulo: `Auditoria comparativa examEngine`
- Subtitulo: `Legacy fixture vs preview nuevo`
- Badge de estado: `idle`, `running`, `ok`, `warning`, `critical` o `error`.
- Advertencia visible: `Uso interno. No reemplaza el cronograma oficial.`

### Cards de metricas

Usar datos del reporte, resumen o export interno:

- Total mesas legacy.
- Total mesas nuevo.
- Total diferencias.
- Diferencias criticas.
- Mesas legacy sin equivalente.
- Mesas nuevas sin equivalente.
- Compactaciones nuevas.
- Warnings.

### Tabs

- Resumen.
- Diferencias.
- Criticos.
- Warnings.
- Recomendaciones.
- Sin equivalente.
- Export interno.

### Resumen

Mostrar `summary.status`, `summary.title`, `summary.summaryText`, `summary.metrics` y
hallazgos principales.

### Diferencias

Mostrar diferencias de:

- Titular.
- Vocales.
- Fecha.
- Llamado.
- Compactaciones.

Las diferencias deben provenir del reporte comparativo, no de calculos duplicados en la
UI.

### Criticos

Mostrar `report.criticalDiffs` y `summary.criticalItems`, con accion sugerida.

### Warnings

Mostrar `report.warnings` y `summary.warnings`.

### Recomendaciones

Mostrar `summary.recommendedActions` y `report.recommendations`.

### Sin equivalente

Mostrar:

- `comparison.unmatchedLegacyMesas`
- `comparison.unmatchedNewMesas`

La UI debe aclarar que las mesas sin equivalente pueden requerir revision de claves de
matching, compactaciones o diferencias institucionales.

### Export interno

Mostrar el objeto devuelto por `exportRegularExamComparisonAuditSummary(summary, options)`.
No descargar archivos, no escribir archivos fisicos y no generar documentos oficiales.

## 9. Riesgos

- Confundir auditoria comparativa con cronograma oficial.
- Mostrar la herramienta como funcionalidad productiva.
- Conectarla al menu o a rutas publicas antes de validacion institucional.
- Consumir datos reales sin snapshot controlado.
- Importar funciones internas de `comparison` y ampliar la superficie publica por
  accidente.
- Llamar el motor viejo real para comparar.
- Duplicar reglas de comparacion en componentes visuales.
- Exponer raw, objetos tecnicos completos o exportaciones oficiales.

## 10. Proximo paso

Luego de esta especificacion, implementar un componente aislado con fixtures normal y
stress, sin ruta publica, sin menu, sin reemplazo del generador actual y consumiendo la
capa `comparison` solo desde `comparison/index.js`.
