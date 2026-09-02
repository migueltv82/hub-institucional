# Contrato de plantillas v2 para examEngine

Este contrato define el modelo canonico de plantillas del nuevo `examEngine` para soportar carreras con mas de un plan de estudio operativo al mismo tiempo.

El objetivo principal es evitar cruces ambiguos entre materias que comparten nombre, nombres parecidos o continuidad institucional entre planes distintos.

## Regla madre

Toda materia debe identificarse por:

```text
plan_id + materia_codigo
```

Nunca se debe identificar una materia solamente por `materia_nombre`.

`materia_nombre` es un dato visible y administrativo. Puede cambiar, repetirse, escribirse con variantes o existir en mas de un plan. El motor puede mostrarlo y usarlo para auditoria, pero no debe usarlo como clave primaria de cruce.

## Plantillas v2

El contrato v2 se compone de estas plantillas:

- `carreras_planes`
- `plan_estudios`
- `equivalencias_planes`
- `docentes`
- `docente_materia`
- `horarios_docentes`
- `disponibilidad_docente`
- `alumnos_inscripciones`
- `correlatividades`
- `calendario_mesas`

## Tecnicatura Superior en Laboratorio: convivencia Plan 2015 y Plan 2024

`LAB-2015` y `LAB-2024` son planes distintos.

Una misma carrera puede tener dos planes vigentes operativamente. Alumnos de cohortes anteriores pueden pertenecer al Plan 2015, mientras que nuevas cohortes pueden pertenecer al Plan 2024.

Por eso:

- El motor debe saber desde que plan rinde cada alumno.
- Las correlatividades deben separarse por plan.
- Las equivalencias entre planes deben declararse explicitamente.
- No se deben mezclar materias por nombre parecido.
- Si una materia se llama igual en ambos planes, se tratan como materias distintas salvo equivalencia declarada.
- El cruce correcto siempre es `plan_id + materia_codigo`.

Ejemplo:

| carrera_id | plan_id | materia_codigo | materia_nombre |
| --- | --- | --- | --- |
| `LAB` | `LAB-2015` | `LAB15-QUIM1` | Quimica General |
| `LAB` | `LAB-2024` | `LAB24-QUIM1` | Quimica General |

Aunque el nombre sea igual, no son la misma materia para planificacion, correlatividades, titularidad ni alumnos inscriptos.

## `carreras_planes`

Declara que planes existen para cada carrera y si conviven operativamente.

Clave recomendada:

```text
carrera_id + plan_id
```

Columnas:

| Columna | Descripcion |
| --- | --- |
| `carrera_id` | Identificador estable de la carrera. |
| `carrera_nombre` | Nombre visible de la carrera. |
| `plan_id` | Identificador estable del plan. Ejemplo: `LAB-2015`. |
| `plan_nombre` | Nombre visible del plan. |
| `anio_plan` | Anio administrativo del plan. |
| `resolucion` | Resolucion o norma que aprueba el plan. |
| `estado_plan` | Estado operativo del plan. |
| `vigente_desde` | Fecha ISO `YYYY-MM-DD` desde la que aplica. |
| `vigente_hasta` | Fecha ISO `YYYY-MM-DD` hasta la que aplica, si corresponde. |
| `convive_con_plan_id` | Otro plan vigente operativamente con el que convive. |
| `observaciones` | Texto administrativo. |

## `plan_estudios`

Declara las materias de cada plan.

Clave obligatoria:

```text
plan_id + materia_codigo
```

Columnas:

| Columna | Descripcion |
| --- | --- |
| `plan_id` | Plan al que pertenece la materia. |
| `carrera_id` | Carrera del plan. |
| `materia_codigo` | Codigo estable de la materia dentro del plan. |
| `materia_nombre` | Nombre visible de la materia. |
| `anio_cursada` | Anio o nivel de cursada. |
| `cuatrimestre` | Cuatrimestre, si aplica. |
| `regimen` | Anual, cuatrimestral u otro regimen. |
| `campo_formacion` | Campo de formacion institucional. |
| `formato` | Materia, taller, seminario, practica, laboratorio u otro formato. |
| `requiere_mesa` | Indica si debe generar mesa. |
| `tipo_mesa` | Regular, promocional, integradora u otro tipo institucional. |
| `orden_impresion` | Orden para reportes y auditoria. |
| `vigente_desde` | Fecha ISO `YYYY-MM-DD` desde la que aplica. |
| `vigente_hasta` | Fecha ISO `YYYY-MM-DD` hasta la que aplica. |
| `observaciones` | Texto administrativo. |

## `equivalencias_planes`

Declara equivalencias explicitas entre materias de planes distintos.

Clave recomendada:

```text
plan_origen_id + materia_origen_codigo + plan_destino_id + materia_destino_codigo
```

Columnas:

| Columna | Descripcion |
| --- | --- |
| `carrera_id` | Carrera a la que pertenece la equivalencia. |
| `plan_origen_id` | Plan de origen. |
| `materia_origen_codigo` | Codigo de materia en plan de origen. |
| `materia_origen_nombre` | Nombre visible de materia de origen. |
| `plan_destino_id` | Plan de destino. |
| `materia_destino_codigo` | Codigo de materia en plan de destino. |
| `materia_destino_nombre` | Nombre visible de materia de destino. |
| `tipo_equivalencia` | Total, parcial, por tramo u otra regla institucional. |
| `alcance` | Alcance administrativo de la equivalencia. |
| `requiere_resolucion` | Indica si requiere acto administrativo. |
| `observaciones` | Texto administrativo. |

## `docentes`

Declara docentes como entidad independiente.

Clave recomendada:

```text
docente_id
```

Columnas:

| Columna | Descripcion |
| --- | --- |
| `docente_id` | Identificador estable del docente. |
| `apellido` | Apellido. |
| `nombre` | Nombre. |
| `dni_docente` | Documento, si se usa como identificador operativo. |
| `email` | Email institucional o de contacto. |
| `telefono` | Telefono de contacto. |
| `estado_docente` | Estado administrativo del docente. |
| `observaciones` | Texto administrativo. |

## `docente_materia`

Declara titularidad y roles docentes por materia de un plan. Esta plantilla evita inferir titularidad desde horarios.

Clave recomendada:

```text
plan_id + materia_codigo + docente_id
```

Columnas:

| Columna | Descripcion |
| --- | --- |
| `plan_id` | Plan de la materia. |
| `carrera_id` | Carrera del plan. |
| `materia_codigo` | Codigo de materia dentro del plan. |
| `materia_nombre` | Nombre visible de la materia. |
| `anio_cursada` | Anio o nivel de cursada. |
| `docente_id` | Identificador estable del docente. |
| `docente` | Nombre visible del docente para auditoria. |
| `dni_docente` | Documento del docente, si aplica. |
| `rol_en_materia` | Rol institucional del docente. |
| `estado_asignacion` | Estado de la asignacion docente-materia. |
| `vigencia_desde` | Fecha ISO `YYYY-MM-DD` desde la que aplica. |
| `vigencia_hasta` | Fecha ISO `YYYY-MM-DD` hasta la que aplica. |
| `docente_reemplazado_id` | Docente reemplazado, si corresponde. |
| `docente_reemplazado` | Nombre visible del docente reemplazado. |
| `requiere_mesa` | Indica si la materia debe generar mesa. |
| `observaciones` | Texto administrativo. |

## `horarios_docentes`

Declara horarios de cursada o asistencia asociados a una materia de un plan.

Clave recomendada:

```text
plan_id + materia_codigo + docente_id + dia + hora_inicio + hora_fin
```

Columnas:

| Columna | Descripcion |
| --- | --- |
| `plan_id` | Plan de la materia. |
| `carrera_id` | Carrera del plan. |
| `materia_codigo` | Codigo de materia dentro del plan. |
| `materia_nombre` | Nombre visible de la materia. |
| `anio_cursada` | Anio o nivel de cursada. |
| `docente_id` | Identificador estable del docente. |
| `docente` | Nombre visible del docente para auditoria. |
| `dni_docente` | Documento del docente, si aplica. |
| `dia` | Dia de cursada o asistencia. |
| `hora_inicio` | Hora de inicio. |
| `hora_fin` | Hora de fin. |
| `modalidad` | Presencial, virtual, mixta u otra modalidad. |
| `sede` | Sede. |
| `comision` | Comision, si aplica. |
| `observaciones` | Texto administrativo. |

## `disponibilidad_docente`

Declara disponibilidad para mesas cuando no alcanza con inferirla desde horarios.

Clave recomendada:

```text
docente_id + dia + hora_desde + hora_hasta
```

Columnas:

| Columna | Descripcion |
| --- | --- |
| `docente_id` | Identificador estable del docente. |
| `docente` | Nombre visible del docente para auditoria. |
| `dni_docente` | Documento del docente, si aplica. |
| `dia` | Dia de disponibilidad. |
| `hora_desde` | Hora inicial disponible. |
| `hora_hasta` | Hora final disponible. |
| `disponible_mesa` | Indica si esta disponible para mesa. |
| `motivo_no_disponible` | Motivo si no esta disponible. |
| `observaciones` | Texto administrativo. |

## `alumnos_inscripciones`

Declara desde que plan rinde cada alumno y para que materia.

Clave recomendada:

```text
alumno_id + plan_id + materia_codigo
```

Columnas:

| Columna | Descripcion |
| --- | --- |
| `alumno_id` | Identificador estable del alumno. |
| `apellido` | Apellido. |
| `nombre` | Nombre. |
| `dni` | Documento. |
| `carrera_id` | Carrera del alumno. |
| `plan_id` | Plan desde el que rinde. |
| `cohorte` | Cohorte institucional. |
| `anio_ingreso` | Anio de ingreso. |
| `estado_academico` | Estado academico del alumno. |
| `materia_codigo` | Codigo de materia dentro del plan. |
| `materia_nombre` | Nombre visible de la materia. |
| `condicion` | Regular, libre u otra condicion. |
| `regularidad_vigente` | Indica si la regularidad esta vigente. |
| `fecha_regularidad` | Fecha de regularidad. |
| `observaciones` | Texto administrativo. |

## `correlatividades`

Declara correlatividades por plan. Nunca se comparten por nombre entre planes.

Clave recomendada:

```text
plan_id + materia_codigo + correlativa_codigo + tipo_correlativa
```

Columnas:

| Columna | Descripcion |
| --- | --- |
| `plan_id` | Plan al que pertenece la regla. |
| `carrera_id` | Carrera del plan. |
| `materia_codigo` | Materia que se desea rendir. |
| `materia_nombre` | Nombre visible de la materia. |
| `correlativa_codigo` | Materia requerida. |
| `correlativa_nombre` | Nombre visible de la correlativa. |
| `tipo_correlativa` | Cursada, final u otra regla. |
| `requisito` | Requisito concreto. |
| `observaciones` | Texto administrativo. |

## `calendario_mesas`

Declara las fechas y slots habilitados para planificar mesas.

Clave recomendada:

```text
llamado_id
```

Columnas:

| Columna | Descripcion |
| --- | --- |
| `llamado_id` | Identificador estable del llamado o slot. |
| `fecha` | Fecha ISO `YYYY-MM-DD`. |
| `turno` | Turno institucional. |
| `hora_inicio` | Hora de inicio. |
| `hora_fin` | Hora de fin. |
| `sede` | Sede. |
| `capacidad_mesas` | Capacidad maxima del slot. |
| `habilitado` | Indica si puede usarse. |
| `observaciones` | Texto administrativo. |

## Valores recomendados

### `estado_plan`

- `VIGENTE`
- `CONVIVIENTE`
- `CERRADO`
- `REEMPLAZADO`

### `requiere_mesa`

- `SI`
- `NO`
- `true`
- `false`
- `1`
- `0`

### `rol_en_materia`

- `TITULAR`
- `REEMPLAZO`
- `SUPLENTE`
- `CO_DOCENTE`
- `AUXILIAR`

### `estado_asignacion`

- `ACTIVO`
- `LICENCIA`
- `RENUNCIA`
- `BAJA`
- `REEMPLAZADO`

## Diferencia con el diseno actual

El diseno actual puede inferir o cruzar datos desde `carrera + materia_nombre` cuando faltan codigos estables. Eso funciona como transicion, pero no es suficiente para planes convivientes.

El diseno v2 cambia el centro del contrato:

- `plan_id` pasa a ser obligatorio en toda plantilla que refiera materias.
- `materia_codigo` pasa a ser obligatorio para identificar espacios curriculares.
- `materia_nombre` deja de ser clave y queda como dato visible.
- `equivalencias_planes` declara puentes entre planes; el motor no los inventa por similitud de nombre.
- `alumnos_inscripciones` indica desde que plan rinde cada alumno.
- `docente_materia`, `horarios_docentes` y `correlatividades` quedan separados por plan.
