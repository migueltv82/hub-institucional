# Auditoria de factibilidad y capacidad de calendario v2

## Objetivo

Esta auditoria existe para separar dos tipos de problemas:

- problema algoritmico: el motor no encuentra una combinacion aunque los datos permitirian armarla;
- problema estructural: con el calendario, asistencia docente, idoneidad y superposicion actuales no existe combinacion viable.

La auditoria es local, read-only y experimental. No reemplaza el motor viejo, no guarda cronogramas, no publica mesas y no escribe en Supabase.

## Clasificaciones

`FEASIBLE_FULL`

Existe al menos una fecha con titular disponible y dos vocales validos.

`FEASIBLE_MINIMUM_REVIEW`

Existe al menos una fecha con titular disponible y un vocal valido. Requiere revision institucional; no es oficial por si sola.

`TITLE_ONLY_REVIEW`

Existe fecha con titular, pero no hay vocales validos bajo las restricciones actuales.

`NO_TITLE_DATE`

No hay fecha del calendario donde el titular asista.

`NO_VOCAL_POOL`

No hay docentes idoneos o afines para actuar como vocales.

`CALENDAR_TOO_RESTRICTIVE`

Hay docentes posibles, pero no coinciden con el calendario disponible.

`BLOCKED_BY_SUPERPOSITION`

En bruto la mesa seria posible, pero las asignaciones actuales bloquean titulares o vocales por superposicion.

`BLOCKED_BY_IDENTITY_V2_PENDING`

La materia queda bloqueada por falta de identidad v2/codigo final cuando se activa ese chequeo.

`MANUAL_REQUIRED`

No se pudo clasificar como viable ni ubicar un cuello unico dominante.

## Escenarios

`STRICT_CURRENT`

Aplica reglas actuales: asistencia, idoneidad, cupo por horas catedra y superposicion.

`IGNORE_GLOBAL_SUPERPOSITION`

Escenario diagnostico para medir cuanto pesa la superposicion. No es normativo.

`IGNORE_IDONEITY_SOFT`

Escenario diagnostico para medir cuanto pesa afinidad/idoneidad. No debe usarse como recomendacion oficial.

`ADD_ONE_EXTRA_DATE`

Simula una fecha adicional disponible, sin modificar datos reales.

`MINIMUM_ONE_VOCAL_REVIEW`

Mide el impacto de aceptar una mesa minima con un vocal como caso revisable.

## Uso institucional

La salida ayuda a decidir si para agosto conviene:

- ampliar calendario;
- revisar asistencia docente declarada;
- sumar docentes habilitados para vocalias;
- revisar afinidades/idoneidades;
- reducir concentracion de carreras/anios en una misma fecha;
- mantener mesas minimas como revision manual.

`safeToReplaceLegacy` debe seguir en `false` hasta cerrar identidad v2 y completar una comparacion final compactada.
