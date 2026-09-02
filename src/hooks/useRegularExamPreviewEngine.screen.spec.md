# RegularExamPreviewScreen

## Nombre tentativo de pantalla

- `RegularExamPreviewScreen`

## Propósito

Especificación de diseño para una futura pantalla de preview del nuevo `examEngine`.
La pantalla debe consumir exclusivamente el hook `useRegularExamPreviewEngine` y no debe
implementar ni conectar todavía componentes reales, rutas públicas ni reemplazos del
generador actual.

Este preview no reemplaza el cronograma oficial.

## Hook que debe consumir

La pantalla debe consumir:

- `useRegularExamPreviewEngine`

No debe duplicar la logica del hook ni derivar reglas institucionales dentro de la UI.

## Datos principales del hook

La pantalla debe leer y renderizar a partir de los siguientes datos expuestos por el hook:

- `phase`
- `status`
- `uiDto`
- `filters`
- `filtersState`
- `filteredDto`
- `validation`
- `canExportJson`
- `canPublishOfficial`
- `canSaveOfficialSchedule`
- `errors`
- `warnings`
- `metadata`
- `actions`

## Layout recomendado

### A. Encabezado

- Título: `Preview de Mesas de Exámenes`
- Subtitulo: `Motor nuevo en modo vista previa`
- Badge de estado: `success`, `warning`, `critical` o `error`
- Aclaración visible: `Este preview no reemplaza el cronograma oficial.`

El encabezado debe reforzar que la pantalla es solamente una vista previa, sin efecto
sobre el cronograma oficial.

### B. Cards superiores

Usar `uiDto.uiSummary` para mostrar:

- Mesas planificadas
- Mesas pendientes
- Errores críticos
- Advertencias
- Revisión manual
- Compactaciones
- Cantidad de llamados
- Modo compactación

Estas cards deben ser indicadores de lectura rapida. No deben contener logica propia
para recalcular totales.

### C. Barra de acciones

Acciones permitidas:

- Generar preview con `actions.generatePreview`
- Cambiar `compactMode` con `actions.changeCompactMode`
- Aplicar filtros con `actions.applyFilters`
- Limpiar filtros con `actions.clearFilters`
- Exportar JSON interno con `actions.exportJson` si `canExportJson === true`
- Resetear preview con `actions.resetPreview`

Acciones bloqueadas:

- Guardar cronograma oficial con `actions.saveOfficialSchedule`
- Publicar cronograma con `actions.publishSchedule`
- Reemplazar motor viejo con `actions.replaceLegacyEngine`

Las acciones bloqueadas no deben aparecer como acciones disponibles. Si por diseno se
muestran, deben estar deshabilitadas y explicar que la pantalla es solo preview.

### D. Filtros

Usar `filters` y `filtersState` para exponer filtros por:

- Carrera
- Llamado
- Estado
- `alertLevel`
- Año
- Turno
- Docente
- Compactada
- Revisión manual
- Con o sin fecha
- Búsqueda textual

La UI debe llamar a las acciones del hook para aplicar o limpiar filtros. No debe filtrar
manualmente los datos en el componente.

### E. Tabs

Tabs recomendadas:

- Mesas planificadas
- Pendientes
- Alertas
- Docentes
- Carreras
- Llamados
- Auditoría

### F. Tabla de mesas planificadas

Usar `filteredDto.uiTables.planned`.

Columnas:

- `alertLevel`
- `materia`
- `carrera`
- `año` / `anio`
- `llamado`
- `displayDate`
- `turno`
- `displayStatus`
- `titular`
- `vocales`
- `compactada`
- `warningsCount`
- `errorsCount`
- `reviewRequired`

### G. Tabla de pendientes

Usar `filteredDto.uiTables.unassigned`.

Columnas:

- `alertLevel`
- `materia`
- `carrera`
- `año` / `anio`
- `llamado`
- `estado`
- `reason`
- `message`
- `suggestedAction`
- `warningsCount`
- `errorsCount`
- `reviewRequired`

### H. Alertas

Usar `filteredDto.uiAlerts`.

Mostrar:

- `severity`
- `message`
- `materia`
- `carrera`
- `llamado`
- `fecha`
- `docenteNombre`
- `suggestedAction`

### I. Resumen docente

Usar `uiDto.uiTeacherSummary`.

Columnas:

- Docente
- Titularidades
- Vocalías
- Tribunales cruzados
- Límite vocalías
- En límite
- Excedido
- Advertencias

### J. Resumen por carrera

Usar `uiDto.uiCareerSummary`.

Debe presentar agregados por carrera ya provistos por el DTO. La pantalla no debe
reconstruir reglas académicas ni sumarizar desde datos raw si el DTO ya ofrece la
estructura necesaria.

### K. Resumen por llamado

Usar `uiDto.uiCallSummary`.

Debe permitir comparar el estado de los llamados planificados, pendientes y con alertas,
siempre desde los datos normalizados del DTO.

### L. Auditoría

Mostrar solamente:

- Resumen de validación de exportación desde `validation`
- Metadata básica desde `metadata`

No mostrar:

- Datos raw
- Objetos técnicos completos
- Auditoría completa del motor
- Estructuras internas que puedan confundirse con datos editables

## Estados de pantalla

La pantalla debe representar los siguientes estados:

- `idle`
- `loading`
- `success`
- `warning`
- `critical`
- `error`

El estado visual debe derivarse de `phase`, `status`, `validation`, `errors` y `warnings`
segun el contrato del hook, sin crear reglas paralelas en la UI.

## Estados vacios

Estados vacíos esperados:

- Sin preview generado
- Sin mesas planificadas
- Sin pendientes
- Sin alertas
- Export inválido
- Error técnico

Cada estado vacío debe ser informativo y mantener claro que no se modificó ningún
cronograma oficial.

## Reglas de seguridad

- No guardar cronograma.
- No publicar.
- No reemplazar motor viejo.
- No modificar mesas reales.
- No conectar con `useCronogramaGeneration`.
- No usar adaptadores legacy ni rutas de compatibilidad del motor viejo.
- No invocar APIs internas de generación del plan.
- La pantalla solo usa el hook `useRegularExamPreviewEngine`.

## Riesgos

- No confundir preview con cronograma oficial.
- No mostrar audit completo.
- No habilitar botones oficiales.
- No duplicar lógica del hook en componentes.
- No derivar reglas institucionales en UI.

## Próximo paso recomendado

La pantalla aislada, el contenedor de desarrollo y el harness interno ya existen. El
siguiente paso recomendado es crear una herramienta interna de auditoría visual o
comparación controlada, todavía sin ruta pública ni reemplazo del generador actual.
