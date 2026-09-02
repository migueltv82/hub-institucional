# Reprogramacion experimental de tribunales incompletos v2

## Objetivo

Esta capa experimental intenta reparar mesas incompletas buscando fecha y vocales en una misma decision.

La reparacion anterior sobre fecha fija no alcanzo porque los bloqueos principales quedaron concentrados en asistencia real por dia y superposicion docente sobre fechas ya elegidas. Si una fecha no permite vocales validos, el preview necesita probar otra fecha del mismo llamado antes de mandar la mesa a revision manual.

## Alcance

`rescheduleIncompleteTribunals` toma el resultado de `jointDateVocalPlanner` y puede intervenir:

- mesas con titular y fecha, pero sin vocales completos;
- mesas con un solo vocal;
- mesas solo titular;
- opcionalmente mesas sin fecha si `includeUnplanned = true`.

No debe mover mesas completas validas con fecha, titular y dos vocales.

## Validaciones

Cada combinacion candidata valida:

- asistencia del titular en la fecha;
- asistencia de vocales en la fecha;
- turno compatible;
- ausencia de superposicion docente;
- cupo disponible por mitad mas uno sobre horas catedra;
- afinidad o idoneidad academica;
- que el titular no sea vocal de su propia mesa;
- que no se duplique el mismo vocal.

El cupo docente no se consume hasta confirmar una combinacion completa o minima revisable. Si una mesa tenia un vocal previo, su uso se libera y se recalcula sobre el nuevo intento.

## Estados

`RESCHEDULED_COMPLETE`

Mesa reprogramada con fecha, titular y dos vocales validos. Sigue siendo salida experimental de preview, no cronograma oficial.

`RESCHEDULED_MINIMUM_REVIEW`

Mesa reprogramada con fecha, titular y un vocal valido cuando `minimumVocalCount = 1`. Requiere decision y revision institucional; no debe considerarse oficial automaticamente.

`MANUAL_REVIEW_NO_FEASIBLE_DATE_VOCALS`

No se encontro ninguna combinacion viable de fecha y vocales. La mesa queda para revision manual.

## Uso previsto

Esta capa sirve para preview institucional y auditoria local/read-only. No publica ni guarda cronogramas, no escribe en Supabase y no reemplaza el motor viejo.

`safeToReplaceLegacy` debe mantenerse en `false` hasta cerrar identidad v2, revisar homonimias pendientes y hacer una comparacion final compactada con criterio institucional.
