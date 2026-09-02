# Escenarios de expansion de calendario v2

## Objetivo

Esta auditoria simula, en modo local/read-only, que la institucion agrega o redistribuye fechas de examen para medir si baja el bloqueo por superposicion global detectado en el motor v2.

No reemplaza al motor viejo, no guarda cronogramas, no publica mesas, no escribe en Supabase y no modifica datos reales.

## Fechas reales y fechas simuladas

Una fecha real es una fecha que viene del snapshot/workspace actual.

Una fecha simulada es una fecha agregada solo para auditoria. Debe aparecer marcada con:

```js
{
  id: "SIM_EXTRA_DATE_1",
  isSimulated: true
}
```

Las fechas simuladas no son oficiales. Sirven para estimar si ampliar calendario ayudaria a las mesas de agosto.

## Escenarios

`BASELINE_CURRENT`

Usa el calendario actual, sin agregar fechas.

`ADD_1_DATE`

Agrega una fecha simulada priorizando dias con mayor asistencia docente.

`ADD_2_DATES`

Agrega dos fechas simuladas.

`ADD_3_DATES`

Agrega tres fechas simuladas.

`SPREAD_BY_CAREER`

Agrega fechas simuladas priorizando dias donde la auditoria detecta mayor concentracion de carreras/anios.

`SPREAD_BY_TEACHER_BOTTLENECK`

Agrega fechas simuladas priorizando dias de asistencia de docentes cuello de botella.

`SPREAD_BY_CRITICAL_SUBJECTS`

Agrega fechas simuladas priorizando materias/casos bloqueados por superposicion o calendario.

`HYBRID_EXPANSION_AND_SPREAD`

Combina disponibilidad docente, docentes cuello de botella, concentracion por fecha y casos criticos.

## Interpretacion

`full`

Mesa factible con titular disponible y dos vocales validos.

`minima revisable`

Mesa factible con titular disponible y un vocal valido. Requiere decision/revision institucional.

`manual`

La mesa no queda factible bajo reglas actuales y debe revisarse manualmente.

`blockedBySuperposition`

Casos que tienen capacidad academica en bruto, pero quedan bloqueados por docentes ocupados en la misma fecha/turno.

`blockedByCalendar`

Casos sin combinacion posible por calendario/disponibilidad de fecha.

`docentesExcedidos`

Debe mantenerse en cero para respetar la regla de mitad mas uno por horas catedra.

`superpositionsInPlan`

Debe mantenerse en cero para respetar la no superposicion docente.

## Uso para agosto

El resultado permite decidir si el motor v2 puede servir como preview interno de apoyo para agosto y que tipo de calendario conviene evaluar institucionalmente.

Aunque un escenario mejore, `safeToReplaceLegacy` debe seguir en `false` hasta cerrar identidad v2, resolver las homonimias pendientes y completar una comparacion final compactada.
