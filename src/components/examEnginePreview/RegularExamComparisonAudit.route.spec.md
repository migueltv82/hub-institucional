# Especificacion de ruta interna protegida para auditoria examEngine

## 1. Nombre tentativo de ruta

Opciones sugeridas:

- `/dev/exam-engine-audit`
- `/admin/exam-engine-audit`

La eleccion final debe depender del mecanismo real de proteccion disponible al momento
de implementarla.

## 2. Objetivo

Permitir inspeccion interna del nuevo motor y comparacion entre resultado legacy fixture
y preview nuevo, usando solo fixtures o snapshots controlados.

Esta ruta no debe reemplazar el generador actual ni formar parte del flujo productivo de
generacion de cronogramas.

## 3. Componente que renderizaria

```jsx
<RegularExamComparisonAuditHarness />
```

## 4. Reglas de seguridad

- No aparecer en menu.
- No estar disponible para usuarios comunes.
- No reemplazar `GeneradorCronograma`.
- No guardar cronograma.
- No publicar cronograma.
- No modificar datos reales.
- No ejecutar motor viejo real.
- No llamar `useCronogramaGeneration`.
- No usar `legacyAdapter`.
- No exportar cronograma oficial.

## 5. Acceso recomendado

Opciones aceptables:

- Solo entorno desarrollo/local.
- Solo rol administrador/desarrollador, si luego existiera control de permisos.

Si no existe una forma clara de bloquear el acceso, la ruta no debe implementarse.

## 6. Criterio de habilitacion

La ruta interna no debe estar activa por defecto.

La forma recomendada de habilitacion inicial sera una variable de entorno:

```txt
VITE_ENABLE_EXAM_ENGINE_AUDIT=true
```

Criterios:

- Cualquier implementacion futura debe usar el helper obligatorio
  `isExamEngineAuditEnabled(env)`.
- El helper vive en
  `src/components/examEnginePreview/isExamEngineAuditEnabled.js`.
- La ruta solo puede registrarse si `isExamEngineAuditEnabled() === true`.
- La funcion devuelve `true` solo si
  `VITE_ENABLE_EXAM_ENGINE_AUDIT === 'true'`.
- Si la variable no existe o esta en `false`, la ruta no debe registrarse.
- Si la variable esta vacia o tiene cualquier otro valor, la ruta no debe registrarse.
- No debe aparecer en menu.
- No debe reemplazar `GeneradorCronograma`.
- No debe estar disponible para usuarios comunes.
- En una etapa futura podria combinarse con rol administrador/desarrollador.
- La variable solo habilita visualizacion de auditoria.
- La variable no habilita guardado ni publicacion.
- Las acciones oficiales deben seguir bloqueadas o inexistentes.
- En produccion debe quedar desactivada salvo decision explicita.

El helper no registra rutas, no toca `window`, no toca `localStorage`, no importa motor
viejo, no importa `useCronogramaGeneration` y no importa `legacyAdapter`.

Riesgos de dejarla activa en produccion:

- Exponer una herramienta de auditoria como si fuera productiva.
- Confundir resultados comparativos con cronogramas oficiales.
- Exponer fixtures o snapshots con datos no anonimizados.
- Permitir que usuarios no autorizados inspeccionen diferencias internas.
- Crear una dependencia accidental entre UI productiva y auditoria interna.

Pasos futuros para implementacion segura:

1. Definir `VITE_ENABLE_EXAM_ENGINE_AUDIT=false` como estado por defecto.
2. Registrar la ruta solo cuando la variable sea `true`.
3. Mantenerla fuera del menu y de cualquier navegacion publica.
4. Combinar con control de rol administrador/desarrollador cuando exista.
5. Renderizar solo `RegularExamComparisonAuditHarness`.
6. Verificar que no agrega acciones de guardado, publicacion ni export oficial.
7. Validar login, generador actual, tests y build antes de dejarla disponible.

Criterio de rollback:

- Quitar `VITE_ENABLE_EXAM_ENGINE_AUDIT`.
- O definir `VITE_ENABLE_EXAM_ENGINE_AUDIT=false`.
- Confirmar que la ruta deja de registrarse.
- Confirmar que no aparece en menu ni en superficies publicas.

## 7. Condiciones antes de implementar

- App funcionando normal.
- Login funcionando.
- Tests pasando.
- Build pasando.
- `App.jsx` sin montajes temporales.
- `RegularExamComparisonAuditHarness` probado.
- Fixture institucional controlado validado.

## 8. Riesgos

- Confundir auditoria con generacion oficial.
- Dejar ruta accesible en produccion.
- Exponer datos reales no anonimizados.
- Permitir exportaciones oficiales por error.
- Acoplarse al motor viejo.

## 9. Plan futuro de implementacion segura

1. Crear ruta interna sin menu.
2. Proteger por flag/env o rol.
3. Renderizar solo `RegularExamComparisonAuditHarness`.
4. Mantener botones oficiales inexistentes o bloqueados.
5. Validar que no afecta login ni generador actual.
6. Documentar como desactivarla.

## 10. Criterio de NO avance

No implementar ruta si no existe forma clara de bloquearla o mantenerla fuera del menu.

Esta especificacion no implementa codigo, no modifica rutas y no modifica `App.jsx`.
