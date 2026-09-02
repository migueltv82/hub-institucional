# Auditoria de dependencias legacy docentes del motor

Fecha: 2026-07-08

## Contexto

El motor ya recibe `disponibilidadDocente` y `cargaHorariaDocente` como fuente prioritaria mediante `teacherStructuredSource`. Si la fuente estructurada es valida, se prioriza sobre `horariosDocentes`; si no, `horariosDocentes` queda como fallback legacy.

Este documento identifica las dependencias que todavia operan sobre estructuras tipo `horariosDocentes` / `horariosPreparados` y propone un desacople gradual. No elimina compatibilidad ni modifica reglas institucionales.

## Resumen ejecutivo

La dependencia legacy critica esta concentrada en `src/utils/cronogramaInteligente.js`. El resto de referencias son principalmente adaptadores, auditorias, templates, preview, exportaciones, portal docente y edicion manual.

La estructura operativa legacy que todavia gobierna la generacion automatica es una fila tipo:

```js
{
  profesor,
  carrera,
  materia,
  dia,
  turno,
  inicio,
  fin,
  bloqueos,
  agrupacionPreferida,
  horasCatedra,
  rol_en_materia,
  estado_asignacion
}
```

El reemplazo estructurado recomendado no es pasar `disponibilidadDocente` y `cargaHorariaDocente` crudos por todo el motor, sino introducir una capa canonica intermedia:

```js
{
  teachersById,
  subjectAssignments,
  availabilityByTeacher,
  workloadByTeacher,
  teacherExamCandidates
}
```

Mientras esa capa no exista, el adapter estructurado -> legacy es necesario como puente.

## Mapa de dependencias legacy

| Archivo / modulo | Dependencia | Uso actual | Clasificacion | Riesgo | Reemplazo propuesto |
|---|---|---|---|---|---|
| `src/utils/cronogramaInteligente.js` | `horariosDocentes`, `horariosPreparados`, campos `profesor/dia/inicio/fin/carrera/materia` | Generacion, titulares, vocales, compactacion, reparacion y validacion final | Critica para generacion | Alto | `teacherExamCandidates` canonico derivado de `teacherStructuredSource` |
| `src/utils/cronogramaInteligente.js` | `crearMateriasPlanificables` filtra materias por existencia de horario | Decide que materias entran a planificacion | Critica para generacion | Alto | Filtrar por `subjectAssignments` activos con titularidad vigente y disponibilidad asociada |
| `src/utils/cronogramaInteligente.js` | `obtenerTitularesMateria` usa `horariosPreparados` | Resuelve candidatos titulares por carrera/materia | Critica para generacion | Alto | Resolver desde `cargaHorariaDocente` normalizada: docente + carrera + materia + rol + estado |
| `src/utils/cronogramaInteligente.js` | `seleccionarTitularDisponible` usa candidatos con `profesor` y disponibilidad diaria | Selecciona titular por fecha/cupo/conflictos | Critica para generacion | Alto | Usar `teacherExamCandidates` con `teacherId`, `displayName`, `availability`, `workload`, `roles` |
| `src/utils/cronogramaInteligente.js` | `seleccionarVocalParaMesa` usa `horariosPreparados` como pool de vocales | Asigna vocales por disponibilidad y afinidad | Critica para generacion | Alto | Pool de vocales desde `cargaHorariaDocente` con roles `VOCAL_POSIBLE`, `CO_DOCENTE`, `AUXILIAR`, `SUPLENTE` o politica equivalente |
| `src/utils/cronogramaInteligente.js` | `crearDiasAsistenciaDocente` desde horarios | Base de regla mitad mas uno por asistencia | Critica para generacion | Alto | Base desde disponibilidad semanal estructurada y horas catedra totales |
| `src/utils/cronogramaInteligente.js` | `compactarMesasAfines`, reparacion y tribunal conjunto reciben `horariosPreparados` | Valida asistencia de titulares al reagrupar/reparar | Critica para generacion | Alto | Servicio `teacherAvailabilityIndex.canAttend(teacherId, fechaIso, turno)` |
| `src/utils/cronogramaInteligente.js` | `validarCronogramaFinal` recibe `horariosDocentes` | Validacion institucional post-generacion | Critica para validacion | Alto | Validar contra `teacherSourceContext` canonico; mantener legacy como fallback |
| `src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js` | `buildTitularIndex(horariosDocentes)` | Fallback para snapshots viejos y comparacion | Compatibilidad | Medio | Mantener como fallback; fuente principal ya es `cargaHorariaDocente` |
| `src/utils/examEngine/teacherStructuredSource.js` | `buildLegacyScheduleRowsFromStructuredTeacherSource` | Puente interno hacia motor legacy | Compatibilidad | Medio | Deprecar solo cuando `cronogramaInteligente` consuma contexto canonico |
| `src/utils/examEngine/comparison/resolveDocenteMateriaAssignment.js` | `source: 'horariosDocentes'` cuando no hay asignaciones | Etiqueta de fallback | Compatibilidad | Bajo | Cambiar etiqueta a `legacy_teacher_schedule` cuando se estabilice metadata |
| `src/utils/examEngine/rules/availability.js` | Campos `dia/day/disponibilidad/availability` | Regla generica de asistencia | Compatible con estructurado | Bajo | No requiere cambio profundo; agregar soporte de `teacherId`/indices cuando exista contexto canonico |
| `src/utils/examEngine/rules/calculateTeacherAssignmentLimit.js` | `summarizeTeacherScheduleTeachingHours`, `inicio/fin` | Inferencia legacy de horas desde bloques | Compatibilidad | Medio | Preferir `horasCatedra` estructuradas; mantener inferencia solo para fallback |
| `src/hooks/useManualMesaEditing.js` | `horariosDocentes` para mitad mas uno en edicion manual | Validacion de riesgo en ediciones manuales | UI / validacion manual | Medio | Reusar `teacherSourceContext` o metadata de generacion con disponibilidad/horas |
| `src/components/examEnginePreview/regularExamPreviewInternalPanelUtils.js` | readiness exige `horariosDocentesCount` | Preview interno y diagnostico | Preview / auditoria | Medio | Usar `teacherSourceReadiness` y conteos estructurados |
| `src/hooks/useCronogramaExports.js` | `legacyData.horariosDocentes` | Kit template v2 y exportaciones | UI/export | Bajo | Incluir tambien `disponibilidadDocente` y `cargaHorariaDocente`; dejar legacy |
| `src/components/generadorCronograma/workspaceSnapshotAuditExport.js` | Exporta conteos y payload legacy | Auditoria/export | Bajo | Agregar conteos de fuente estructurada |
| `src/modules/docentes/services/teacherPortalData.js` | Horarios para horarios visibles, carreras y estadisticas | Portal docente | UI / portal | Medio | Migrar vista del portal a disponibilidad/carga relacional |
| `src/services/careerCatalog.js` | Usa `horariosDocentes` como fallback de carreras | Catalogo auxiliar | Solo compatibilidad | Bajo | Agregar `cargaHorariaDocente` antes de `horariosDocentes` en fallback futuro |
| `src/utils/examEngine/audit/*` | Multiples diagnosticos con `scheduleRows` / `horariosDocentes` | Auditorias y comparaciones legacy vs nuevo | Solo auditoria | Bajo/Medio | Duplicar diagnosticos con fuente estructurada; conservar legacy para comparacion historica |
| `src/utils/examEngine/templatesV2/*` | Prefill y validaciones de plantillas horarias | Templates y descargas | UI/export | Bajo | Promover templates `disponibilidad_docente` y `carga_horaria_docente` como principales |
| `src/utils/examEngine/supabaseAudit/relationalWorkspaceSnapshot.js` | Reconstruye `horariosDocentes` | Snapshot legacy desde Supabase | Compatibilidad | Medio | Mantener hasta que generador y preview no dependan de `horariosDocentes` |
| `supabase/setup_multi_tenant/*.sql` | Backfill/compatibilidad `horariosDocentes` | Persistencia y lectura legacy | Compatibilidad | Bajo | No tocar hasta cierre de deprecacion |

## Datos reales que necesita cada parte

### Generacion de materias planificables

Necesita:
- carrera;
- materia;
- plan/anio si aplica;
- si requiere mesa;
- titularidad activa o reemplazo vigente;
- disponibilidad minima del titular en el periodo.

Fuente estructurada:
- `cargaHorariaDocente`: carrera, plan, materia, anio, rol, titularidad/estado, docente;
- `disponibilidadDocente`: dia, turno, hora desde/hasta, estado.

### Seleccion de titulares

Necesita:
- docente estable;
- carrera/materia;
- rol titular/reemplazo;
- estado activo/vigente;
- disponibilidad por fecha;
- conflictos ya asignados;
- limite de afectacion.

Fuente estructurada:
- `cargaHorariaDocente` para titularidad y horas;
- `disponibilidadDocente` para asistencia;
- metadata normalizada para `teacherId` y alias.

### Seleccion de vocales

Necesita:
- docentes candidatos;
- afinidad por carrera/materia/area;
- disponibilidad por fecha;
- conflictos de rol;
- cupo mitad mas uno;
- exclusiones de titulares.

Fuente estructurada:
- `cargaHorariaDocente` con roles no titulares o roles candidatos a vocal;
- regla institucional explicita para decidir si `TITULAR` tambien puede ser vocal de otras materias;
- `disponibilidadDocente` para asistencia.

### Mitad mas uno

Necesita:
- horas catedra totales institucionales por docente;
- o fallback por dias de asistencia legacy;
- dias ya afectados por llamado.

Fuente estructurada:
- suma de `horasCatedra` por docente desde `cargaHorariaDocente`, incluso multi-carrera;
- limite: `floor(horasCatedra / 2) + 1`;
- fallback legacy: dias de asistencia desde `horariosDocentes`.

### Validacion final

Necesita:
- roles asignados por mesa;
- docente existe;
- docente asiste en fecha;
- conflictos de titular/vocal;
- cupo mitad mas uno;
- afinidad de vocales;
- materias propias por dia.

Fuente estructurada:
- `teacherSourceContext` canonico, no arrays crudos.

## Plan de desacople gradual

### Etapa 1: Contexto canonico sin cambiar reglas

Crear un builder puro:

```js
buildTeacherExamSourceContext({
  docentes,
  disponibilidadDocente,
  cargaHorariaDocente,
  horariosDocentes
})
```

Salida propuesta:

```js
{
  source,
  teachersById,
  teacherAliasToId,
  subjectAssignments,
  availabilityByTeacher,
  workloadByTeacher,
  teacherExamCandidates,
  diagnostics,
  legacyScheduleRows
}
```

En esta etapa `legacyScheduleRows` sigue alimentando `cronogramaInteligente`, pero todos los tests nuevos deben afirmar el contexto canonico.

Estado: iniciado. El helper puro `src/utils/examEngine/teacherExamSourceContext.js` ya construye un contexto docente canonico desde fuente estructurada o fallback legacy. Todavia no esta conectado a `cronogramaInteligente.js`.

### Etapa 2: Tests de caracterizacion del motor actual

Antes de reemplazar internals:
- fixture con fuente estructurada valida y legacy contradictorio;
- fixture multi-carrera con suma de horas;
- fixture disponibilidad sin carga;
- fixture carga sin disponibilidad;
- fixture fallback legacy puro;
- snapshot viejo sin fuentes estructuradas.

Objetivo: congelar comportamiento observable antes de tocar asignacion de titulares/vocales.

### Etapa 3: Sustituir lectura de disponibilidad

Cambiar helpers internos que hoy consultan `horario.dia`, `inicio`, `fin`, `bloqueos` para usar:

```js
teacherAvailabilityIndex.canAttend({ teacherId, fechaIso, turno, inicio, fin })
```

Fallback:
- si no hay indice estructurado, usar `horariosPreparados`.

### Etapa 4: Sustituir titularidad

Cambiar `obtenerTitularesMateria` para que lea `subjectAssignments`:
- titular activo;
- reemplazo activo;
- estado/vigencia;
- carrera + plan + materia.

Fallback:
- `buildTitularIndex(horariosDocentes)` solo para snapshots viejos.

### Etapa 5: Sustituir cupos y carga horaria

Cambiar base de `docenteTieneCupoParaMesa`:
- fuente principal: `workloadByTeacher.totalTeachingHours`;
- fallback: dias de asistencia legacy;
- advertencia si no hay horas ni dias.

### Etapa 6: Sustituir pool de vocales

Construir `teacherExamCandidates` desde carga + disponibilidad:
- `teacherId`;
- display name;
- carreras/materias;
- roles;
- horas;
- disponibilidad;
- afinidades precalculadas.

Mantener una politica explicita para roles candidatos a vocal.

### Etapa 7: Preview, manual editing y exportaciones

Actualizar:
- preview interno para no bloquear por `horariosDocentes` si hay fuente estructurada;
- edicion manual para usar metadata de generacion/contexto;
- exportaciones para incluir fuentes estructuradas en kits y auditorias.

### Etapa 8: Deprecacion controlada

Cuando generacion, validacion, preview, edicion manual, portal docente y exports ya no requieran horarios:
- marcar `horariosDocentes` como legacy en docs/UI;
- conservar lectura de snapshots antiguos;
- mantener tests de fallback;
- no borrar adapter hasta que no haya clientes reales dependiendo de snapshots viejos.

### Etapa 9: Eliminacion final

Solo despues de una version estable con telemetria/auditoria:
- quitar dependencia del core;
- dejar migrador/lector de snapshots legacy;
- retirar plantilla `horariosDocentes` de flujo principal.

## Riesgos principales

- Reescribir `horariosPreparados` dentro de `cronogramaInteligente.js` toca el corazon de titulares, vocales, compactacion, reparacion y validacion.
- La semantica de vocales desde `cargaHorariaDocente` debe quedar institucionalmente definida antes de reemplazar el pool actual.
- El portal docente y la edicion manual todavia usan horarios legacy para experiencias visibles.
- Las auditorias historicas comparan contra legacy; eliminarlas temprano quitaria capacidad de diagnostico.
- El preview interno todavia tiene readiness propio basado en `horariosDocentes`.

## Recomendacion inmediata

El proximo corte seguro deberia ser Etapa 1: crear `buildTeacherExamSourceContext` y conectar tests de caracterizacion sin cambiar reglas. Luego reemplazar internamente una sola consulta por vez, empezando por disponibilidad, porque es menos ambigua que titularidad/vocales.
