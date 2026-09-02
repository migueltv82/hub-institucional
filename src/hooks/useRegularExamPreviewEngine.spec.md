# useRegularExamPreviewEngine

## Import permitido

El hook debe usar solo la API orquestadora del preview:

```js
import { buildRegularExamPreviewIntegrationContract } from '../utils/examEngine/preview'
```

## Imports prohibidos

El hook no debe importar:

- `generateRegularExamPlan`
- `buildRegularExamEnginePreview`
- `buildRegularExamPreviewUiDto`
- `validateRegularExamPreviewUiDto`
- `buildRegularExamPreviewUiFilters`
- `applyRegularExamPreviewUiFilters`
- `legacyAdapter`
- `cronogramaInteligente`
- `useCronogramaGeneration`
- componentes UI

## Estado inicial esperado

```js
{
  phase: 'idle',
  status: 'IDLE',
  uiDto: null,
  filters: null,
  filtersState: {},
  filteredDto: null,
  errors: [],
  warnings: []
}
```

## Tests cubiertos / obligatorios

- Inicializa en `idle`.
- `generatePreview(input)` pasa a `loading` y luego a `success`, `warning` o `critical` segun el contrato.
- `generatePreview(input)` no guarda cronograma ni modifica motor viejo.
- `applyFilters(filtersState)` actualiza `filtersState` y `filteredDto`.
- `clearFilters()` vuelve a `filtersState: {}`.
- `changeCompactMode(false | 'safe' | true)` regenera preview sin mutar el input anterior.
- `exportJson()` devuelve `audit.exportedReport` solo si `canExportJson === true`.
- `exportJson()` falla de forma controlada si `canExportJson === false`.
- `resetPreview()` vuelve a `idle`.
- `saveOfficialSchedule()` devuelve `ACTION_BLOCKED_PREVIEW_ONLY`.
- `publishSchedule()` devuelve `ACTION_BLOCKED_PREVIEW_ONLY`.
- `replaceLegacyEngine()` devuelve `ACTION_BLOCKED_PREVIEW_ONLY`.
- No importa motor viejo, UI ni `useCronogramaGeneration`.
- No muta `input` ni `filtersState`.

## Estados esperados

- `idle`
- `loading`
- `success`
- `warning`
- `critical`
- `error`

## Riesgos

- No confundir preview con cronograma oficial.
- No descargar archivos desde el hook.
- No hacer side effects peligrosos.
- No conectar todavia con UI real.
