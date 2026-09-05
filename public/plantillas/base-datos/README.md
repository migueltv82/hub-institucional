# Plantillas normalizadas para Hub Institucional

Estas planillas son el contrato de carga recomendado para la nueva base de datos.

## Reglas

- Una fila representa una entidad o una relacion.
- Usar codigos estables de la institucion; no escribir nombres como claves.
- Los UUID internos de Supabase los genera la base y no se cargan manualmente.
- No modificar los encabezados.
- Fechas: `YYYY-MM-DD`.
- Horarios: `HH:MM`.
- Valores de estado deben usar exactamente los valores documentados en cada planilla.
- Guardar los archivos originales en Storage junto con el resultado de la importacion.
- No cargar datos reales hasta probar la importacion en un proyecto de desarrollo.

## Orden de carga

1. `carreras.csv`
2. `planes_estudio.csv`
3. `materias_plan.csv`
4. `correlatividades.csv`
5. `equivalencias_planes.csv`
6. `docentes.csv`
7. `docente_materias.csv`
8. `horarios_cursada.csv`
9. `disponibilidad_docentes.csv`
10. `alumnos.csv`
11. `alumno_carrera_plan.csv`
12. `estado_academico_alumno.csv`
13. `llamados_examen.csv`

## Relaciones principales

- `planes_estudio.carrera_codigo` referencia `carreras.carrera_codigo`.
- `materias_plan.plan_codigo` referencia `planes_estudio.plan_codigo`.
- `correlatividades` usa `plan_codigo + materia_destino_codigo` y `materia_requerida_codigo`.
- `alumno_carrera_plan` vincula alumnos con una carrera y un plan.
- `estado_academico_alumno` vincula un alumno con una materia de su plan.
- `docente_materias` y `horarios_cursada` usan `docente_codigo` y `materia_codigo`.

## Validacion minima antes de importar

- No hay codigos duplicados dentro del mismo alcance.
- Toda referencia apunta a una fila existente.
- No hay materias duplicadas dentro de un plan.
- No hay correlatividades autorreferentes.
- No hay ciclos en las correlatividades.
- Cada alumno tiene una relacion valida con carrera y plan.
- Cada estado academico usa una condicion permitida.
- Cada horario tiene `hora_inicio` menor que `hora_fin`.
- Los datos de identidad no se cruzan por email o nombre si existe un codigo estable.

Estas planillas complementan, pero no reemplazan, las planillas actuales de `public/plantillas/`.

Los datos fueron extraidos de los archivos reales ubicados en
`public/plantillas/importacion/` mediante
`scripts/normalizeImportedTemplates.mjs`. Los archivos originales se conservan
sin modificaciones.

`estado_academico_alumno.csv` queda solo con encabezados porque la plantilla de
alumnos recibida no contiene materias, condiciones, notas ni regularidades.
No se inventaron esos datos.

`disponibilidad_docentes.csv` y `llamados_examen.csv` conservan el formato
preparado para carga, pero deben completarse cuando exista esa informacion
institucional.
