# Reglas de afectacion docente v2

Este documento registra las reglas usadas por `examEngine` v2 para asignar docentes a tribunales de examen. No modifica el motor viejo ni la generacion oficial.

## Alcance actual

En el codigo vigente del nuevo motor, la regla de mitad mas uno limita solamente las vocalias comunes por llamado:

- `VOCAL_1`
- `VOCAL_2`
- `VOCAL_EXTERNO`

No consumen esta cuota:

- titularidades;
- tribunales cruzados.

Este alcance se conserva porque es el comportamiento implementado y cubierto por tests. Si la institucion decide que la regla debe comprender todas las afectaciones, hace falta una definicion normativa adicional antes de cambiarlo.

## Regla historica, deprecated

Modo:

```text
DAYS_BASED_HALF_PLUS_ONE
```

Formula:

```text
limite = floor(diasAsistencia / 2) + 1
```

La base era la cantidad de dias semanales distintos en que el docente asistia a la institucion.

Ejemplo: cinco dias de asistencia daban un limite de tres vocalias por llamado.

Este modo queda disponible para auditoria comparativa y compatibilidad de fixtures. No es la regla institucional vigente.

## Regla vigente

Modo:

```text
TEACHING_HOURS_HALF_PLUS_ONE
```

Formula:

```text
limite = floor(horasCatedra / 2) + 1
```

Ejemplos:

| Horas catedra | Limite por llamado |
| --- | --- |
| 2 | 2 |
| 4 | 3 |
| 6 | 4 |
| 10 | 6 |

Si faltan horas catedra, el limite es cero y se informa `MISSING_TEACHING_HOURS_SOURCE`. No se usa la cantidad de dias como fallback salvo que una auditoria lo solicite de forma explicita.

## Asistencia diaria obligatoria

El cambio de base no elimina la disponibilidad por dia.

La condicion completa es:

```text
teacherCanBeAssignedOnDate =
  attendsInstitutionOnDate &&
  underTeachingHoursBasedLimit
```

Un docente con cupo disponible no puede ser vocal en una fecha cuyo dia no coincide con su asistencia o disponibilidad institucional.

## Fuente de horas catedra

Orden recomendado:

1. Horas catedra declaradas en la entidad docente o en una fuente institucional canonica.
2. Horas catedra inferidas desde `horariosDocentes`.
3. Sin fuente: bloquear cupo automatico y emitir diagnostico.

El snapshot real actual no posee una columna explicita de horas catedra. La auditoria usa `horariosDocentes.inicio` y `horariosDocentes.fin` y convierte los bloques a modulos de 40 minutos. Los recreos incluidos dentro de bloques se toleran mediante redondeo al modulo mas cercano.

La inferencia:

- deduplica el mismo docente, carrera, materia, dia, inicio y fin;
- conserva trazabilidad con `TEACHING_HOURS_INFERRED_FROM_SCHEDULE`;
- no se presenta como carga oficial declarada;
- debe reemplazarse por horas institucionales explicitas cuando esa fuente exista.

## Trazabilidad

Cada docente adaptado puede declarar:

```text
horasCatedra
horasCatedraSource
halfPlusOneRuleMode
teachingHoursDiagnostics
```

Las comparaciones entre resultados deben registrar el modo utilizado. No deben mezclarse resultados de `DAYS_BASED_HALF_PLUS_ONE` y `TEACHING_HOURS_HALF_PLUS_ONE` sin indicarlo.
