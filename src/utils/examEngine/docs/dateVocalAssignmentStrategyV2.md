# Estrategia v2 para fecha y vocales

## Problema detectado

El flujo actual del `examEngine` regular elige vocales antes de elegir fecha:

1. Construye materias/mesas requeridas.
2. Asigna titular.
3. Construye candidatos vocales sin fecha concreta.
4. Asigna vocales y consume cupo de mitad mas uno.
5. Repara tribunales incompletos.
6. Compacta mesas.
7. Recién despues elige fecha tentativa.

Con la regla nueva por horas catedra, la capacidad de vocalias sube. Eso es correcto normativamente, pero expone una regresion algoritmica: el motor puede asignar mas vocales de forma global y descubrir tarde que esos docentes no asisten, estan superpuestos o no calzan con el slot elegido.

## Por que no se revierte mitad mas uno

La regla vigente es:

```text
maxAfectaciones = floor(horasCatedra / 2) + 1
```

La regla historica por dias de asistencia queda solo como referencia comparativa. La disponibilidad por dia no desaparece: sigue siendo un filtro obligatorio para poder asignar a un docente en una fecha concreta.

## Riesgo de elegir vocales antes que fecha

Cuando el tribunal se arma sin fecha:

- la afinidad y el cupo pueden estar correctos;
- pero la asistencia real del docente para el dia elegido se valida tarde;
- las superposiciones se detectan tarde;
- la reparacion puede completar tribunales que luego no encuentran slot;
- se consumen vocalias en combinaciones que no maximizan factibilidad de calendario.

El sintoma tipico es que aumentan `VOCAL_NO_DISPONIBLE`, `TITULAR_NO_DISPONIBLE`, `DOCENTE_SUPERPUESTO`, `TRIBUNAL_INCOMPLETO_FECHA_TENTATIVA` y `SIN_FECHA_VALIDA`.

## Estrategia recomendada

La estrategia recomendada para v2 es seleccionar vocales con conciencia de fecha:

1. Tomar una mesa con titular obligatorio.
2. Evaluar fechas candidatas del llamado y turno.
3. Validar que el titular asiste y no esta superpuesto en esa fecha.
4. Filtrar vocales por:
   - asistencia en la fecha;
   - turno compatible;
   - no superposicion;
   - cupo por horas catedra;
   - afinidad/idoneidad.
5. Elegir la combinacion fecha + vocales con mejor factibilidad.

## Relacion con asistencia por dia

La asistencia por dia no calcula el cupo. Solo responde una pregunta de elegibilidad:

```text
¿el docente puede ser asignado este dia?
```

Si no asiste ese dia, no puede ser titular ni vocal para esa mesa en esa fecha aunque tenga cupo por horas catedra.

## Relacion con cupo por horas catedra

El cupo por horas catedra responde otra pregunta:

```text
¿el docente todavia tiene capacidad de vocalias en este llamado?
```

Para confirmar un vocal deben cumplirse ambas condiciones: asistencia en la fecha y cupo disponible.

## Estado experimental

La auditoria `auditDateVocalAssignmentOrder` compara:

- `currentOrder`: pipeline real actual.
- `dateAwareVocalSelection`: simulacion que filtra vocales por fecha candidata.
- `dateFirstThenVocals`: simulacion que elige primero la fecha viable del titular y luego vocales.
- `jointDateVocalScoring`: simulacion que puntua fecha + vocales de forma conjunta.

Los modos experimentales no reemplazan el motor ni la generacion oficial. Todavia no reproducen toda la compactacion y reparacion del pipeline real, por lo que deben leerse como diagnostico de direccion, no como planificador productivo.

## Prototipo `jointDateVocalPlanner`

El primer prototipo conjunto vive en:

```text
src/utils/examEngine/experimental/jointDateVocalPlanner.js
```

Su auditoria local vive en:

```text
scripts/examEngineAudit/auditJointDateVocalPlanner.mjs
```

El prototipo evalua fecha y vocales en una misma decision:

- valida titular disponible en la fecha;
- valida asistencia del vocal en la fecha;
- valida superposicion por fecha y turno;
- valida cupo por horas catedra;
- usa afinidad/idoneidad desde candidatos vocales;
- penaliza el uso de docentes con alto costo relativo de demanda/cupo;
- marca revision manual cuando el tribunal queda incompleto;
- cuenta posibles compactaciones, pero no las aplica sobre datos reales.

La auditoria compara:

- `currentOrder`: motor real actual, con vocales antes de fecha.
- `jointDateVocalPlanner`: modo apoyo read-only, permite planificar con titular disponible aunque falten vocales.
- `jointDateVocalPlannerOneVocalMinimum`: variante mas estricta, exige al menos un vocal valido en la fecha.

El modo apoyo no es un cronograma oficial. Sirve para evaluar si el nuevo motor puede ayudar a preparar mesas de agosto mostrando fechas viables por titular y dejando tribunales incompletos para revision institucional.

`safeToReplaceLegacy` debe permanecer en `false`.
