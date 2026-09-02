# Especificacion de tests futuros para ruta interna de auditoria examEngine

## 1. Objetivo

Garantizar que la ruta interna de auditoria no se registre accidentalmente si no esta
habilitada de forma explicita.

Estos tests deben existir antes de implementar una ruta real para
`RegularExamComparisonAuditHarness`.

## 2. Variable de entorno

```txt
VITE_ENABLE_EXAM_ENGINE_AUDIT=true
```

La ruta debe permanecer deshabilitada cuando la variable no exista o cuando su valor sea
`false`.

Helper obligatorio:

```js
isExamEngineAuditEnabled(env)
```

Archivo:

```txt
src/components/examEnginePreview/isExamEngineAuditEnabled.js
```

La ruta solo puede registrarse si `isExamEngineAuditEnabled() === true`. El helper
devuelve `true` solo si `VITE_ENABLE_EXAM_ENGINE_AUDIT === 'true'`. Si falta la
variable, es `false`, esta vacia o tiene otro valor, la ruta no debe registrarse.

El helper no registra rutas, no toca `window`, no toca `localStorage`, no importa motor
viejo, no importa `useCronogramaGeneration` y no importa `legacyAdapter`.

## 3. Casos de test futuros

- Mockear env con `VITE_ENABLE_EXAM_ENGINE_AUDIT='true'` y verificar que el helper
  habilita la posibilidad de registrar la ruta interna.
- Mockear env ausente y verificar que el helper devuelve `false`.
- Mockear env con `VITE_ENABLE_EXAM_ENGINE_AUDIT='false'` y verificar que el helper
  devuelve `false`.
- Verificar que la ruta no se registra si el helper devuelve `false`.
- Si `VITE_ENABLE_EXAM_ENGINE_AUDIT` no existe, la ruta `/dev/exam-engine-audit` no debe
  registrarse.
- Si `VITE_ENABLE_EXAM_ENGINE_AUDIT=false`, la ruta `/dev/exam-engine-audit` no debe
  registrarse.
- Si `VITE_ENABLE_EXAM_ENGINE_AUDIT=true`, la ruta puede registrarse solo como ruta
  interna.
- La ruta no debe aparecer en menu.
- La ruta no debe reemplazar `GeneradorCronograma`.
- La ruta no debe importar `useCronogramaGeneration`.
- La ruta no debe importar `cronogramaInteligente`.
- La ruta no debe importar `legacyAdapter`.
- La ruta debe renderizar solo `RegularExamComparisonAuditHarness`.
- La ruta no debe habilitar guardar, publicar ni reemplazar motor viejo.

## 4. Rollback

Si se quiere desactivar la ruta interna:

- Quitar la variable.
- O definir `VITE_ENABLE_EXAM_ENGINE_AUDIT=false`.

Luego se debe verificar que `/dev/exam-engine-audit` no quede registrada ni enlazada en
superficies publicas.

## 5. Criterio de avance

No implementar ruta real hasta que estos tests puedan escribirse y pasar.

Esta especificacion no implementa codigo, no modifica rutas y no modifica `App.jsx`.
