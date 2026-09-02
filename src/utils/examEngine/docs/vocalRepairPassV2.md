# Segunda pasada experimental de vocales v2

## Proposito

El `jointDateVocalPlanner` mejora la seleccion de fechas porque decide fecha y titular antes que vocales. En modo apoyo puede planificar mas mesas con fecha, pero deja tribunales incompletos que no pueden usarse como cronograma oficial.

La segunda pasada `repairIncompleteTribunalVocals` intenta completar esos tribunales sin mover la fecha ya elegida.

## Alcance

Esta pasada vive solo en `examEngine` v2 experimental y auditoria local:

```text
src/utils/examEngine/experimental/repairIncompleteTribunalVocals.js
src/utils/examEngine/audit/auditVocalRepairPass.js
scripts/examEngineAudit/auditVocalRepairPass.mjs
```

No toca motor viejo, generacion oficial, Supabase, UI productiva ni datos reales.

## Estados

### Mesa completa

Tiene titular, fecha y dos vocales validos.

```text
COMPLETE_TRIBUNAL
```

### Mesa minima revisable

Tiene titular, fecha y un vocal valido. No se considera oficial por si misma. Queda marcada para decision humana/institucional.

```text
MINIMUM_TRIBUNAL_REVIEW
```

### Mesa manual

Tiene titular y fecha, pero no se pudo asignar ningun vocal valido sin romper reglas.

```text
MANUAL_VOCAL_REVIEW
```

## Reglas de elegibilidad

Un vocal solo puede asignarse si:

- asiste en la fecha;
- no tiene superposicion en esa fecha y turno;
- tiene cupo por horas catedra;
- tiene afinidad o idoneidad suficiente;
- no es titular de la misma mesa;
- no queda duplicado como vocal;
- no rompe mitad mas uno por llamado.

La regla de mitad mas uno sigue calculandose por horas catedra. No se vuelve a la regla historica por dias.

## Scoring

La seleccion prioriza:

- mayor afinidad/idoneidad;
- menor uso relativo de cupo;
- mas disponibilidad futura;
- menor demanda critica del docente para otros tribunales;
- completar dos vocales antes que un vocal.

El cupo se consume recien cuando la reparacion queda confirmada para la mesa.

## Uso esperado

Sirve para preview interno y revision humana de las mesas de agosto. No publica ni guarda cronogramas.

`safeToReplaceLegacy` debe permanecer en `false`.
