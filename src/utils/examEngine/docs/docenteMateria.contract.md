# Contrato docente_materia

Este contrato define la plantilla canonica para declarar la relacion entre docentes y materias sin depender de la inferencia desde horarios docentes.

## Objetivo

- Toda materia que requiere mesa debe tener un titular vigente.
- Si una materia tiene un solo docente y no se declara rol, el sistema puede inferir titularidad como transicion.
- Si una materia no practica tiene mas de un docente sin rol explicito, debe quedar para revision.
- Las Practicas Profesionales de profesorados pueden tener mas de un docente, pero deben declarar titular si hay mas de una persona.
- Practicas Discursivas III y IV no se consideran Practicas Profesionales multidocente.

## Columnas recomendadas

| Columna | Requerida | Descripcion |
| --- | --- | --- |
| `carrera` | Si | Nombre o codigo estable de la carrera. Debe coincidir con plan de estudios. |
| `materia_codigo` | Si | Codigo estable de la materia. Debe coincidir con plan de estudios. |
| `materia_nombre` | Si | Nombre institucional de la materia. Se usa como respaldo si falta codigo. |
| `anio` | Recomendado | Anio/nivel de la materia. Ayuda a auditar duplicados. |
| `docente` | Si | Nombre visible del docente, usado como respaldo de cruce. |
| `dni_docente` | Recomendado | Identificador estable para cruzar con plantilla docentes. |
| `rol_en_materia` | Recomendado | Rol canonico del docente en la materia. |
| `estado_asignacion` | Si | Estado vigente de la asignacion. |
| `vigencia_desde` | Recomendado | Fecha ISO `YYYY-MM-DD` desde la que aplica. Si esta vacia, no limita por inicio. |
| `vigencia_hasta` | Recomendado | Fecha ISO `YYYY-MM-DD` hasta la que aplica. Si esta vacia, no limita por fin. |
| `docente_reemplazado` | Opcional | Docente reemplazado cuando `rol_en_materia = REEMPLAZO`. |
| `observaciones` | Opcional | Texto administrativo. No debe ser necesario para resolver titularidad. |
| `requiere_mesa` | Recomendado | `true/false` o `SI/NO`; permite excluir materias del plan que no rinden mesa. |

## Valores validos

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

## Resolucion de titular vigente

1. `TITULAR + ACTIVO + vigente` gana.
2. Si el titular no esta activo por `LICENCIA`, `RENUNCIA`, `BAJA` o `REEMPLAZADO`, se busca `REEMPLAZO + ACTIVO + vigente`.
3. Si hay un solo docente activo sin rol explicito, se asume `TITULAR_INFERIDO`.
4. Si hay mas de un docente activo sin rol en una materia no practica, el resultado es `AMBIGUO_REQUIERE_REVISION`.
5. Si es Practica Profesional de profesorado, puede haber multiples docentes, pero debe existir titular explicito para resolver sin revision.
6. Si no hay docente activo vigente que pueda tomar titularidad, el resultado es `SIN_TITULAR_VIGENTE`.

## Integracion esperada

El adaptador del nuevo `examEngine` debe usar `docente_materia` como fuente prioritaria cuando exista en el snapshot. Si no existe, conserva el fallback actual desde `horariosDocentes`.

Fuentes registradas en materias adaptadas:

- `docente_materia`: titular o reemplazo declarado.
- `inferido_unico_docente`: unico docente activo sin rol explicito.
- `horariosDocentes`: fallback anterior cuando no hay fila de `docente_materia` para esa materia.
- `requiere_revision`: ambiguedad o falta de titular vigente.
