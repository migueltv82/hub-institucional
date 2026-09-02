# RegularExamPreviewScreen

Componente visual aislado para revisar el preview del nuevo `examEngine`.

## Alcance

- Vive en `src/components/examEnginePreview/`.
- Consume solamente `useRegularExamPreviewEngine`.
- No registra rutas publicas.
- No reemplaza el generador actual.
- No modifica cronogramas oficiales.
- No descarga archivos.

## Props

```jsx
<RegularExamPreviewScreen input={input} initialFilters={initialFilters} />
```

- `input`: entrada preparada para el hook. Todavia no debe conectarse a datos reales de la UI.
- `initialFilters`: filtros iniciales opcionales para futuras integraciones.

## Acciones visibles

Acciones permitidas:

- Generar preview
- Limpiar filtros
- Exportar JSON interno
- Resetear

Acciones oficiales bloqueadas:

- Guardar cronograma oficial
- Publicar cronograma
- Reemplazar motor viejo

Los botones oficiales permanecen visibles y deshabilitados para reforzar que la pantalla
es solo una vista previa.

## Harness interno de desarrollo

`RegularExamPreviewHarness` es un contenedor local y explicito para inspeccionar
visualmente el preview del motor nuevo durante desarrollo. Renderiza la isla interna de
preview con el fixture institucional realista y no forma parte del flujo oficial.

Este harness:

- Es solo para desarrollo interno.
- No reemplaza el generador oficial.
- No debe agregarse al menu ni a rutas publicas.
- No guarda, publica ni modifica cronogramas reales.
- Debe usarse solo como isla de inspeccion visual.

Import manual para pruebas locales:

```jsx
import RegularExamPreviewHarness from './components/examEnginePreview/RegularExamPreviewHarness'
```

Cualquier montaje temporal que toque `App.jsx`, rutas o superficies publicas debe
removerse antes de commit.

## Harness interno de auditoria comparativa

`RegularExamComparisonAuditHarness` es un contenedor local y explicito para inspeccionar
visualmente la auditoria comparativa entre fixtures legacy controlados y el preview
nuevo del `examEngine`.

Este harness:

- Es solo para desarrollo interno.
- No reemplaza el generador oficial.
- No debe agregarse al menu ni a rutas publicas.
- No guarda, no publica ni modifica cronogramas reales.
- Usa fixtures controlados y no datos reales productivos.
- Permite tres modos controlados: `normal`, `stress` e `institucional`.
- Debe usarse solo como isla de inspeccion visual.

Import manual para pruebas locales:

```jsx
import RegularExamComparisonAuditHarness from './components/examEnginePreview/RegularExamComparisonAuditHarness'
```

Cualquier montaje temporal que toque `App.jsx`, rutas o superficies publicas debe
removerse antes de commit.

## Proximo paso recomendado

Usar esta isla como base para una futura herramienta interna de auditoria visual, sin
ruta publica y sin reemplazar el flujo actual de generacion.
