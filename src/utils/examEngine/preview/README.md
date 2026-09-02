# Preview API del examEngine

## API recomendada para UI

La futura UI debe usar solo:

```js
buildRegularExamPreviewIntegrationContract(input, filtersState)
```

Esta funcion orquesta el preview completo del motor nuevo y devuelve un contrato seguro para pantalla, sin conectar hooks ni componentes reales.

Devuelve, entre otros campos:

- `phase`
- `status`
- `uiDto`
- `validation`
- `filters`
- `filteredDto`
- permisos (`canExportJson`, `canPublishOfficial`, `canSaveOfficialSchedule`)
- `errors`
- `warnings`
- `metadata`

## Helpers internos/test

Estas funciones quedan exportadas para pruebas, auditoria y herramientas internas. La UI futura no deberia consumirlas directamente:

- `buildRegularExamEnginePreview`
- `buildRegularExamPreviewUiDto`
- `validateRegularExamPreviewUiDto`
- `buildRegularExamPreviewUiFilters`
- `applyRegularExamPreviewUiFilters`

## Restricciones vigentes

Para el modulo de preview sigue prohibido:

- guardar cronograma oficial
- publicar a alumnos/docentes
- conectar hooks o UI real

`canPublishOfficial` y `canSaveOfficialSchedule` deben seguir siempre en `false` hasta que exista una integracion controlada y aprobada.
