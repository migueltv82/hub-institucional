# Runbook: normalizacion de planillas y grilla de horarios

Objetivo: dejar las planillas como fuente limpia y hacer que la grilla de horarios solo renderice datos ya resueltos. La app no deberia adivinar carrera, anio, materia o docente al momento de dibujar.

## Principio de trabajo

La grilla no corrige datos. La grilla dibuja.

Si falta un dato o no coincide, la app debe mostrar una alerta de carga y no inventar una correccion silenciosa.

## Resultado esperado

Al cargar las plantillas, cada fila de `horarios_docentes` debe quedar lista con:

- `carrera_id`
- `carrera_nombre`
- `plan_id`
- `anio_cursada`
- `materia_id`
- `materia_codigo`
- `materia_nombre`
- `docente_id`
- `docente`
- `dni_docente`
- `dia`
- `hora_inicio`
- `hora_fin`

Con eso, la pantalla de Inicio puede agrupar por `carrera_nombre + anio_cursada` y renderizar la grilla sin resolver nada mas.

## Paso 1: normalizar carreras y planes

Archivo/seccion: plantilla academica, hoja `carreras_planes`.

Regla: una carrera tiene un ID estable y un nombre oficial unico.

Columnas importantes:

- `carrera_id`: codigo corto estable. Ejemplos: `ING`, `QUI`, `GEO`, `TRA`, `TUR`, `LAB`.
- `carrera_nombre`: nombre oficial completo, siempre igual.
- `plan_id`: ID del plan. Ejemplos: `QUI-PLAN`, `LAB-2015`, `LAB-2024`.
- `plan_nombre`: nombre visible del plan.
- `anio_plan`: anio normativo del plan, por ejemplo `2015` o `2024`.
- `estado_plan`: `VIGENTE`, `CONVIVIENTE` o `CERRADO`.

Nombres oficiales recomendados:

- `PROFESORADO DE INGLES`
- `PROFESORADO DE QUIMICA`
- `PROFESORADO DE GEOGRAFIA`
- `TECNICO SUP EN TRADUCTORADO`
- `TECNICO SUP EN TURISMO`
- `TECNICO SUPERIOR EN LABORATORIO`

Para Laboratorio:

- Plan 2024: alumnos actuales.
- Plan 2015: debe seguir cargado para mesas de examen de alumnos de ese plan.

No usar como carrera visible:

- `ING`
- `QUI`
- `LAB`
- `TUR`
- `TRA`
- `GEO`
- numeros sueltos como `5` o `6`

Esos codigos pueden vivir en `carrera_id`, pero no deben mostrarse como `carrera_nombre`.

## Paso 2: normalizar materias del plan

Archivo/seccion: plantilla academica, hoja `plan_estudios`.

Regla: la materia se identifica por `materia_id`. El nombre visible no es clave.

Columnas importantes:

- `plan_id`
- `carrera_id`
- `materia_id`
- `materia_codigo`
- `materia_nombre`
- `anio_cursada`
- `cuatrimestre`
- `regimen`
- `requiere_mesa`
- `tipo_mesa`
- `orden_impresion`

Reglas:

- `materia_id` no se repite nunca.
- Si una materia existe en dos planes, son dos filas distintas con dos `materia_id` distintos.
- `materia_codigo` debe ser estable y legible.
- `materia_nombre` debe estar normalizado, sin variantes accidentales.
- `anio_cursada` debe ser el anio real donde se cursa la materia.

Ejemplo correcto:

```csv
plan_id,carrera_id,materia_id,materia_codigo,materia_nombre,anio_cursada,regimen,requiere_mesa
LAB-2015,LAB,LAB15-QUIM1,LAB15-QUIM1,QUIMICA GENERAL,1,ANUAL,SI
LAB-2024,LAB,LAB24-QUIM1,LAB24-QUIM1,QUIMICA,1,ANUAL,SI
QUI-PLAN,QUI,QUI17,QUI17,PRACTICA PROFESIONAL II,2,ANUAL,SI
```

Nota importante: si `PRACTICA PROFESIONAL II` figura como `anio_cursada = 2`, no debe aparecer en la grilla de 3 anio aunque el docente tenga horario.

## Paso 3: normalizar docentes

Archivo/seccion: plantilla docentes, hoja `docentes`.

Regla: el docente se identifica por `docente_id`. El DNI ayuda a validar, pero el ID es la clave.

Columnas importantes:

- `docente_id`
- `apellido`
- `nombre`
- `dni_docente`
- `email`
- `telefono`
- `estado_docente`
- `horas_catedra`
- `especialidad`
- `familias_idoneidad`

Reglas:

- Un docente debe tener una sola fila.
- El mismo docente no debe aparecer con variantes del nombre.
- Usar siempre el mismo `docente_id` en `docente_materia`, `horarios_docentes` y `disponibilidad_docente`.
- El campo visible `docente` en hojas relacionadas debe generarse desde `docente_id`, no escribirse a mano cuando se pueda evitar.

Formato recomendado de `docente` visible:

```text
APELLIDO NOMBRE
```

Ejemplo:

```csv
docente_id,apellido,nombre,dni_docente,email,telefono,estado_docente,horas_catedra
DOC-RIVERO-MARTA,RIVERO,MARTA,26881490,,,ACTIVO,4
```

## Paso 4: normalizar titularidades

Archivo/seccion: plantilla docentes, hoja `docente_materia`.

Regla: esta hoja define titulares. `horarios_docentes` no define titularidad.

Columnas importantes:

- `plan_id`
- `carrera_id`
- `materia_id`
- `materia_codigo`
- `materia_nombre`
- `anio_cursada`
- `docente_id`
- `docente`
- `dni_docente`
- `rol_en_materia`
- `estado_asignacion`
- `requiere_mesa`

Reglas:

- Toda materia que deba tener mesa tiene que tener una fila titular activa.
- `rol_en_materia` debe ser `TITULAR` para titulares.
- `estado_asignacion` debe ser `ACTIVO`.
- No inferir titulares desde horarios.
- Si hay mas de un titular para una materia, debe estar decidido de manera explicita, no por duplicado accidental.

Ejemplo:

```csv
plan_id,carrera_id,materia_id,materia_codigo,materia_nombre,anio_cursada,docente_id,docente,dni_docente,rol_en_materia,estado_asignacion,requiere_mesa
QUI-PLAN,QUI,QUI17,QUI17,PRACTICA PROFESIONAL II,2,DOC-RIVERO-MARTA,RIVERO MARTA,26881490,TITULAR,ACTIVO,SI
```

## Paso 5: normalizar horarios docentes

Archivo/seccion: plantilla docentes, hoja `horarios_docentes`.

Regla: esta hoja alimenta la grilla de cursada y la disponibilidad por horarios.

Columnas importantes:

- `plan_id`
- `carrera_id`
- `materia_id`
- `materia_codigo`
- `materia_nombre`
- `anio_cursada`
- `docente_id`
- `docente`
- `dni_docente`
- `dia`
- `hora_inicio`
- `hora_fin`
- `modalidad`
- `sede`
- `comision`

Reglas:

- Cada bloque horario es una fila.
- Si una materia se dicta dos dias, son dos filas.
- Si una materia ocupa dos horas catedra seguidas, puede ser una fila con rango completo.
- `docente` debe ser el docente, nunca el nombre de la materia.
- `materia_nombre` debe ser la materia, nunca el docente.
- `anio_cursada` debe venir ya resuelto desde el plan.

Ejemplo correcto para Rivero:

```csv
plan_id,carrera_id,materia_id,materia_codigo,materia_nombre,anio_cursada,docente_id,docente,dni_docente,dia,hora_inicio,hora_fin
QUI-PLAN,QUI,QUI17,QUI17,PRACTICA PROFESIONAL II,2,DOC-RIVERO-MARTA,RIVERO MARTA,26881490,MARTES,19:40,21:10
QUI-PLAN,QUI,QUI17,QUI17,PRACTICA PROFESIONAL II,2,DOC-RIVERO-MARTA,RIVERO MARTA,26881490,VIERNES,18:20,19:40
```

Resultado esperado:

- aparece en `PROFESORADO DE QUIMICA`
- aparece en `2 anio`
- no aparece en `3 anio`

## Paso 6: normalizar disponibilidad docente

Archivo/seccion: plantilla docentes, hoja `disponibilidad_docente`.

Regla: disponibilidad es para mesas. No reemplaza horarios de cursada.

Columnas importantes:

- `docente_id`
- `docente`
- `dni_docente`
- `dia`
- `turno`
- `hora_desde`
- `hora_hasta`
- `disponible_mesa`

Reglas:

- Si la disponibilidad se infiere de los dias que dicta clase, se puede mostrar como resumen.
- Si hay excepciones para mesas, deben declararse aqui o en bloqueos.
- No usar esta hoja para cambiar carrera, materia o titularidad.

## Paso 7: normalizar alumnos

Archivo/seccion: plantilla alumnos, hoja `alumnos_inscripciones`.

Regla: el alumno debe quedar vinculado al plan y a la materia exacta desde la que rinde.

Columnas importantes:

- `alumno_id`
- `apellido`
- `nombre`
- `dni`
- `email`
- `carrera_id`
- `plan_id`
- `anio_cursada`
- `materia_id`
- `materia_codigo`
- `materia_nombre`
- `condicion`
- `regularidad_vigente`

Reglas:

- Los 54 alumnos actuales de Laboratorio pertenecen al Plan 2024.
- El Plan 2015 queda cargado para alumnos anteriores que rindan mesas de ese plan.
- No mezclar materias por nombre parecido.

## Paso 8: validacion antes de cargar

Antes de subir a la app, revisar:

1. No hay carreras visibles como `ING`, `QUI`, `LAB`, `TUR`, `TRA`, `GEO`.
2. No hay carreras visibles como numeros sueltos.
3. Cada fila de `plan_estudios` tiene `materia_id`.
4. Cada fila de `horarios_docentes` tiene `materia_id`.
5. Cada `materia_id` de horarios existe en `plan_estudios`.
6. Cada `docente_id` de horarios existe en `docentes`.
7. Cada `materia_id` de `docente_materia` existe en `plan_estudios`.
8. Cada titular activo tiene `rol_en_materia = TITULAR`.
9. No hay filas donde `docente` sea igual a `materia_nombre`.
10. No hay filas donde `materia_nombre` sea igual al nombre del docente.
11. `anio_cursada` de horarios coincide con `anio_cursada` del plan.
12. Los horarios usan franjas reales: `18:20`, `19:00`, `19:40`, `20:30`, `21:10`, `21:55`, `22:35`, `23:10`.

## Paso 9: cambios que conviene hacer en la app

Estos cambios son para trabajar manana:

1. Crear una funcion unica de normalizacion post-importacion.
   - Entrada: planillas crudas.
   - Salida: datasets limpios.
   - Lugar sugerido: `src/services/normalizedAcademicWorkspace.js`.

2. La funcion debe producir `horariosDocentesNormalizados`.
   Cada fila debe tener:

   ```js
   {
     carrera_id,
     carrera_nombre,
     plan_id,
     anio_cursada,
     materia_id,
     materia_codigo,
     materia_nombre,
     docente_id,
     docente,
     dni_docente,
     dia,
     hora_inicio,
     hora_fin,
   }
   ```

3. La grilla de Inicio debe usar solo `horariosDocentesNormalizados`.
   - No debe cruzar contra planes al renderizar.
   - No debe buscar docentes.
   - No debe elegir nombres por fallback.
   - Solo debe agrupar por `carrera_nombre` y `anio_cursada`.

4. Agregar un panel de alertas de datos.
   Ejemplos:
   - `Horario con materia_id inexistente`.
   - `Horario con docente_id inexistente`.
   - `Horario sin anio_cursada`.
   - `Docente igual a materia`.
   - `Carrera visible es codigo interno`.

5. La descarga e impresion deben usar la misma grilla renderizada.
   Si se ve bien en pantalla, se descarga igual.

## Paso 10: prueba manual de manana

Caso Rivero:

1. Ir a Inicio.
2. Elegir `PROFESORADO DE QUIMICA`.
3. Elegir `2 anio`.
4. Confirmar que aparece:
   - `PRACTICA PROFESIONAL II`
   - `Prof. RIVERO MARTA`
   - Martes `19:40 - 21:10`
   - Viernes `18:20 - 19:40`
5. Elegir `3 anio`.
6. Confirmar que Rivero no aparece ahi, salvo que el plan diga explicitamente que esa materia es de 3 anio.

Caso duplicacion:

1. Ir a Inicio.
2. Revisar distribucion por carrera.
3. Confirmar que no aparecen:
   - `ING`
   - `QUI`
   - `LAB`
   - `TUR`
   - `TRA`
   - `GEO`
   - numeros sueltos.

Caso grillas por anio:

1. Elegir `PROFESORADO DE INGLES`.
2. Confirmar que existen grillas separadas para 1, 2, 3 y 4 anio.
3. Revisar que no haya una grilla gigante con todo dentro de 1 anio.

## Decision recomendada

No seguir agregando parches dentro del render de grilla.

La solucion correcta es:

1. Limpiar plantillas.
2. Normalizar al importar.
3. Validar inconsistencias.
4. Renderizar datos ya limpios.

Eso va a hacer que la grilla vuelva a ser simple: tomar horarios y dibujar una imagen.
