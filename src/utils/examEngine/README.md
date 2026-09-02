# Exam Engine

Arquitectura base del nuevo motor de generacion de mesas de examen. Esta carpeta existe para construir el reemplazo de forma controlada, sin borrar ni modificar el motor actual.

## Objetivo

Separar el motor en modulos pequenos, testeables y con contratos claros. El nuevo motor debe permitir diagnosticar, planificar, asignar tribunales, validar y reportar sin mezclar esas responsabilidades con UI, exportaciones o persistencia.

## Flujo general del pipeline

1. Normalizar entrada: horarios docentes, docentes, plan de estudios, correlatividades, alumnos y configuracion.
2. Diagnosticar antes de generar.
3. Resolver `examPeriodConfig`: tipo de periodo, cantidad de llamados y fechas.
4. Construir candidatos de mesa por materia, fecha y llamado configurado.
5. Asignar titular obligatorio.
6. Asignar vocales con afinidad o idoneidad academica.
7. Aplicar limite de vocalias por llamado con regla mitad mas uno.
8. Compactar mesas compatibles, con maximo tres materias agrupadas (`MAX_SUBJECTS_PER_MESA`).
9. Reparar tribunales incompletos y registrar tribunal cruzado aparte.
10. Generar segundo llamado replicando la logica del primero cuando la configuracion lo requiera.
11. Validar cronograma final y crear reporte.

## Configuracion de periodo

La cantidad de llamados es configurable por periodo de mesas:

```js
const examPeriodConfig = {
  tipoPeriodo: 'REGULAR', // 'REGULAR' | 'ESPECIAL'
  cantidadLlamados: 1, // 1 | 2
  fechaInicio: '2026-07-27',
  fechaFin: '2026-08-07',
  descripcion: 'Periodo julio-agosto con llamado unico',
}
```

Un periodo regular puede tener uno o dos llamados segun decision institucional. Si `cantidadLlamados` es `1`, el motor no debe exigir segundo llamado. Si es `2`, debe validar primer y segundo llamado.

## Reglas institucionales duras

1. El motor debe diagnosticar antes de generar.
2. Toda materia debe tener la cantidad de llamados definida por `examPeriodConfig.cantidadLlamados`.
3. Toda mesa debe tener titular obligatorio.
4. Maximo tres materias agrupadas por mesa (`MAX_SUBJECTS_PER_MESA`).
5. Las correlatividades no pueden invertirse.
6. Practicas Discursivas III y IV no se agrupan.
7. La regla de mitad mas uno aplica unicamente a vocalias.
8. Las titularidades no consumen cupo de mitad mas uno.
9. El limite vigente de vocalias por llamado se calcula asi: `Math.floor(horasCatedra / 2) + 1`.
10. El tribunal cruzado debe registrarse aparte y no debe confundirse con vocalia comun.
11. No se pueden asignar vocales sin afinidad o idoneidad academica.
12. El segundo llamado debe replicar la logica del primero siempre que sea posible, solo cuando la configuracion requiera segundo llamado.
13. Tener cupo por horas catedra no habilita un dia: el docente solo puede asignarse cuando asiste o esta disponible en esa fecha.

La regla historica basada en dias queda disponible unicamente como modo comparativo
`DAYS_BASED_HALF_PLUS_ONE`. La regla vigente se identifica como
`TEACHING_HOURS_HALF_PLUS_ONE`. Ver `docs/teacherAssignmentRulesV2.md`.

## Modulos actuales / en evolucion

- `normalize/*`: normalizacion de fechas, materias, docentes e input.
- `rules/*`: reglas institucionales auditables por separado.
- `diagnostics/*`: diagnostico institucional previo y ranking de riesgo.
- `planning/*`: planificador regular, especial, compactacion, vocalias y reparacion.
- `validation/*`: validacion final de mesas, cronograma, reportes y export interno.
- `preview/*`: contrato seguro para preview visual del motor nuevo.
- `comparison/*`: adaptadores y fixtures historicos para verificar compatibilidad de datos.
- `scoring/*`: puntajes de candidatos sin saltear reglas duras.
- `legacyAdapter.js`: puente temporal aislado. No debe usarse desde preview, comparison, hook ni UI nueva.

## Estado productivo

- `examEngine` es el unico motor de generacion disponible.
- `useCronogramaGeneration.js` consume exclusivamente `examGenerationEngine.js`.
- La UI permite precronograma, revision docente y seleccion manual de vocales.
- Las exportaciones y plantillas viven en modulos independientes del planificador.
- El motor eliminado no tiene fallback ni ruta de ejecucion.
