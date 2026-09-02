# Auditoria integral del circuito academico

Fecha de corte: 2026-07-15.

Alcance: inscripcion al cursado, asignacion docente, asistencia, evaluaciones,
condicion final, historia academica, elegibilidad e inscripcion a examen,
confirmacion de mesas, actas, resultados y sanciones.

Esta auditoria es read-only respecto del negocio. No modifica
`workspaceSnapshot.cronograma`, `cronogramaInteligente.js`, Supabase, el motor
clasico, exportaciones oficiales ni decisiones administrativas.

## 1. Conclusion ejecutiva

Clasificacion: **LA APP CUMPLE PARCIALMENTE Y NO ES SEGURA TODAVIA PARA EL
CIRCUITO ACADEMICO COMPLETO**.

La aplicacion tiene una base util:

- portales separados para alumnos y docentes;
- padrones normalizados;
- inscripciones a cursado y examen en snapshot y tablas relacionales;
- notas relacionales genericas;
- correlatividades basicas en cliente;
- RLS para las tablas academicas relacionales;
- auditoria SQL de cinco entidades academicas;
- generacion y confirmacion operativa de mesas del motor clasico;
- flujo asistido beta, aislado y no oficial para revisar tribunales.

Sin embargo, el circuito solicitado no esta cerrado. Faltan modelos y servicios
centrales para asistencia, evaluaciones, cierre de cursada, historia academica,
elegibilidad de examen, cierre de inscripcion, actas y sanciones. Las operaciones
actuales de autoinscripcion a examen y confirmacion de mesa no aplican todas las
reglas obligatorias en una frontera de servidor.

No es seguro completar estas brechas con componentes React o arrays nuevos en
el snapshot. Primero debe definirse el modelo transaccional y sus invariantes.

La decision estrategica se mantiene:

```txt
Motor viejo = modo clasico / respaldo oficial
Motor nuevo = modo asistido beta / prueba en sombra
```

## 2. Hallazgos bloqueantes

### 2.1 Autoinscripcion a examen sin elegibilidad central

`StudentExamEnrollmentPage.jsx` habilita la accion para cualquier mesa futura
que el read model exponga. `studentPortalData.js` acepta mesas sin `estado` o con
`estado === 'confirmada'`. La Edge Function solo comprueba identidad,
institucion y que la mesa no sea especial/admin-only.

No se valida en servidor:

- cierre 24 horas antes;
- materia ya aprobada;
- regularidad vigente;
- condicion libre permitida;
- correlatividades;
- sancion activa;
- bloqueo administrativo;
- existencia y estado confirmado de una mesa canonica.

Evidencia:

- `src/modules/alumnos/pages/StudentExamEnrollmentPage.jsx:112`
- `src/modules/alumnos/pages/StudentExamEnrollmentPage.jsx:134`
- `src/modules/alumnos/services/studentPortalData.js:430`
- `src/modules/alumnos/services/studentPortalData.js:432`
- `supabase/functions/admin-users/index.ts:1322`
- `supabase/functions/admin-users/index.ts:1330`

Riesgo: **CRITICO**. Un alumno autenticado puede registrar una inscripcion que
no fue autorizada academicamente.

### 2.2 Confirmacion de mesa sin precondiciones duras

La confirmacion productiva es un toggle de estado en cliente. No bloquea una
mesa incompleta, un docente repetido, un choque horario, indisponibilidad o
exceso de mitad mas uno. La edicion manual agrega advertencias, pero la accion
de confirmar no las revalida.

Evidencia:

- `src/hooks/useCronogramaGeneration.js:8`
- `src/hooks/useCronogramaGeneration.js:232`
- `src/components/generadorCronograma/CronogramaTable.jsx:117`
- `src/hooks/useManualMesaEditing.js:196`

Riesgo: **CRITICO**. Una advertencia visual no es una restriccion institucional.

### 2.3 Privacidad RLS demasiado amplia para snapshots y padrones

El portal alumno usa una RPC de lectura filtrada, pero las politicas base aun
permiten que cualquier miembro de la institucion lea directamente
`workspace_snapshots` y `student_records`. El portal docente efectivamente
consulta el snapshot completo y todo el padron de alumnos, y luego filtra en el
cliente.

Evidencia:

- `supabase/setup_multi_tenant/00_all_in_one.sql:519`
- `supabase/setup_multi_tenant/00_all_in_one.sql:570`
- `src/modules/docentes/services/teacherPortalData.js:570`
- `src/modules/docentes/services/teacherPortalData.js:580`

Riesgo: **ALTO**. El filtrado de UI no sustituye aislamiento de datos en base.
Las pruebas negativas actuales no cubren alumno/docente contra estas tablas.

### 2.4 No existen entidades academicas esenciales

Las unicas tablas academicas de cursado/examen son:

- `subject_teacher_assignments`;
- `exam_teacher_assignments`;
- `subject_enrollments`;
- `exam_enrollments`;
- `student_grades`;
- `academic_audit_logs`.

No existen tablas para sesiones de clase, asistencia, evaluaciones, resultados
por evaluacion, cierres de cursada, historia academica, mesas canonicas, eventos
de inscripcion a examen, actas ni sanciones por ausencia.

Evidencia:

- `supabase/setup_multi_tenant/01_academic_relational_tables.sql:102`
- `supabase/setup_multi_tenant/01_academic_relational_tables.sql:117`
- `supabase/setup_multi_tenant/01_academic_relational_tables.sql:131`
- `supabase/setup_multi_tenant/01_academic_relational_tables.sql:154`
- `supabase/setup_multi_tenant/01_academic_relational_tables.sql:178`
- `supabase/setup_multi_tenant/01_academic_relational_tables.sql:210`

Riesgo: **ALTO**. `student_grades` no reemplaza una evaluacion ni un cierre de
cursada; `exam_enrollments.status` no reemplaza un acta o una historia.

### 2.5 Historia academica derivada y con valor por defecto inseguro

La vista de estado academico infiere aprobacion desde una inscripcion completada
o una nota final mayor o igual a 6. No modela regularidad, promocion, libre,
vencimiento, equivalencias ni intentos. Ademas, el resumen global usa `regular`
como estado por defecto aun cuando no existe registro academico explicito.

Evidencia:

- `src/modules/alumnos/pages/StudentAcademicStatusPage.jsx:61`
- `src/modules/alumnos/services/studentPortalData.js:517`
- `src/modules/alumnos/services/studentPortalData.js:533`

Riesgo: **ALTO**. Esta vista no puede ser fuente de elegibilidad.

### 2.6 Listado docente con fallback por carrera y anio

Cuando no encuentra filas academicas por materia, el portal docente incluye a
todos los alumnos de la misma carrera y anio. Esto contradice el requisito de
usar exclusivamente inscripciones al cursado.

Evidencia:

- `src/modules/docentes/services/teacherPortalData.js:373`
- `src/modules/docentes/services/teacherPortalData.js:409`
- `src/modules/docentes/services/teacherPortalData.js:412`

Riesgo: **ALTO** para exactitud y privacidad del listado nominal.

### 2.7 Snapshot compartido y dual-write no atomico

La Edge Function modifica y vuelve a guardar el snapshot completo. En dual-write
escribe snapshot y tabla relacional en pasos separados. Los RPC relacionales usan
`pg_advisory_xact_lock` e idempotencia, pero no existe una transaccion unica que
incluya ambos destinos.

Evidencia:

- `supabase/functions/admin-users/index.ts:1244`
- `supabase/setup_multi_tenant/03_academic_portal_rpc.sql:176`
- `supabase/setup_multi_tenant/03_academic_portal_rpc.sql:329`
- `docs/academic-transition-phase2.md`

Riesgo: **ALTO** por lost updates y drift mientras el snapshot siga siendo
escribible por multiples alumnos.

## 3. Modelo de datos existente

| Entidad | Persistencia | Cobertura real | Observacion |
| --- | --- | --- | --- |
| Usuario/rol | `profiles`, Auth | Cuenta y rol global | Roles validos: `superadmin`, `admin_instituto`, `docente`, `alumno` |
| Membresia | `memberships` | Institucion y rol operativo | Roles: owner/admin/editor/viewer; no equivalen directamente al rol academico |
| Alumno | `student_records` | Padron, carrera y anio textual | Sin plan, cohorte o historial canonico |
| Docente | `teacher_records` | Padron e identidad | Materias/carreras viven en otras fuentes |
| Plan/materia/carrera | `workspace_snapshots.payload` | Catalogo legacy | No hay FK relacional para validar inscripciones |
| Asignacion docente | `subject_teacher_assignments` | docente + materia + programa | No tiene ciclo, comision, aula, dia u horario tipados |
| Disponibilidad docente | `teacher_availability_records` | Fuente estructurada | Orientada al motor de mesas |
| Carga docente | `teacher_workload_records` | carrera, plan, materia, rol y horas | Fuente estructurada para el motor de mesas |
| Inscripcion a cursado | `subject_enrollments` + snapshot | Estado basico e idempotencia | No tiene ciclo lectivo, tipo `AUTOMATIC_FIRST_YEAR` ni oferta de cursada |
| Inscripcion a examen | `exam_enrollments` + snapshot | Estado basico e idempotencia | `exam_table_id` es texto sin FK a una mesa canonica |
| Nota | `student_grades` + snapshot | Nota generica y estado academico | No existe entidad `evaluation` ni cierre confirmado |
| Auditoria academica | `academic_audit_logs` | Cambios de cinco tablas | No cubre snapshot, asistencia, actas o sanciones inexistentes |
| Mesa oficial | `workspaceSnapshot.cronograma` | Objeto mutable del motor clasico | Sin historial append-only ni version transaccional |

## 4. Diagnostico por etapa

### 4.1 Inscripcion al cursado

Existe seleccion manual de materias en el portal alumno y una comprobacion de
correlativas en cliente. Tambien hay control de duplicados en UI, indice unico
relacional y locks en RPC.

No existe alta automatica idempotente de primer anio. La mutacion de servidor no
valida que la materia pertenezca a la carrera/plan, que este activa, que se oferte
en el ciclo, que no este aprobada o que cumpla correlativas. Tampoco se conserva
`academicYear`, `studyPlanId`, `enrollmentType` ni `createdBy` con el contrato
solicitado.

Referencias:

- `src/modules/alumnos/components/Students/SubjectEnrollmentForm.jsx:112`
- `src/modules/alumnos/components/Students/SubjectEnrollmentForm.jsx:145`
- `src/modules/alumnos/components/Students/SubjectEnrollmentForm.jsx:172`
- `src/modules/alumnos/lib/prerequisites.js:62`
- `supabase/functions/admin-users/index.ts:1276`

### 4.2 Asignacion y portal docente

Existe control relacional de acceso por `subject_teacher_assignments` y RLS para
leer inscripciones/notas de materias asignadas. La UI muestra agenda, materias,
mesas y alumnos.

El portal operativo sigue resolviendo materias desde `horariosDocentes`, no desde
una oferta de cursada canonica. No muestra ni edita asistencia/evaluaciones. La
lista nominal usa fallback por anio y la pestaña general de alumnos muestra
alumnos de carreras vinculadas, no solo inscriptos en materias propias.

### 4.3 Asistencia

No hay tabla, servicio, UI, auditoria ni tests de asistencia por clase. El valor
`attendance` de `student_grade_type` es solo una etiqueta de nota; no representa
sesiones computables ni estados PRESENT/ABSENT/LATE/JUSTIFIED/NO_CLASS.

### 4.4 Evaluaciones y calificaciones

`student_grades` permite tipos `partial`, `final`, `makeup`, `practical`,
`attendance` y `other`, y la RLS permite escribir a un docente asignado. El
alumno puede leer notas.

No hay entidad de evaluacion con fecha, peso, minimo, periodo y estado. No hay UI
docente ni servicio de escritura para notas. Los parciales, recuperatorios y TP
son etiquetas planas, no instancias auditables de evaluacion.

### 4.5 Condicion final e historia academica

No existe helper normativo central, recomendacion calculada, confirmacion docente
ni override con motivo. No se separan `calculatedStatus` y `confirmedStatus`.
La pantalla actual es una proyeccion heuristica y no un historial append-only.

### 4.6 Elegibilidad para examen

No existe un helper/servicio con contrato `eligible`, `reasonCodes` y `warnings`.
Ninguno de los codigos minimos solicitados aparece implementado en el dominio de
alumnos. Las coincidencias de `eligibility` existentes pertenecen al workflow
administrativo experimental del motor, no a la elegibilidad academica del alumno.

### 4.7 Generacion, vocales y confirmacion

El motor clasico genera mesas y sigue siendo el respaldo oficial. El flujo beta
construye titular, recomienda vocales y revalida reglas duras en preview. El
detalle de ese estado esta en `docs/EXAM_ENGINE_INTEGRAL_AUDIT_2026-07.md`.

La confirmacion productiva actual no usa esas validaciones y no registra un
evento append-only. Por eso la generacion existe, pero el paso de confirmacion
es inseguro respecto del circuito solicitado.

### 4.8 Autoinscripcion y cierre

Existe alta/baja idempotente basica y filtrado de mesas especiales. No hay cierre
automatico 24 horas antes, padron consolidado, evento inmutable de alta ni evento
administrativo de invalidacion. La cancelacion cambia el estado y la UI remueve
el registro de su store.

### 4.9 Panel diario y acta

El generador muestra el cronograma agrupado por carrera y estado, pero no existe
vista diaria con padron de inscriptos, condicion, sanciones y carga de resultado.
Los PDF/XLSX actuales son exportaciones de cronograma, no actas de examen.

### 4.10 Resultado y sancion

Los enums permiten `approved`, `failed`, `absent`, pero no existe cierre de acta
atomico que actualice historia, registre intento o cree una sancion. No existe
`EXAM_NO_SHOW_PENALTY_CREATED` ni bloqueo limitado al siguiente llamado.

## 5. Matriz obligatoria

| Funcionalidad | Estado | Archivos actuales | Evidencia | Riesgo | Accion recomendada |
| --- | --- | --- | --- | --- | --- |
| Inscripcion automatica de alumnos nuevos de primer anio | MISSING | Ninguno | Solo aparece `auto_enrollment_enabled` para mesas, no cursado | Alto | Servicio transaccional idempotente sobre oferta de cursada |
| Seleccion de materias por alumnos superiores | PARTIAL | `StudentSubjectsPage.jsx`, `SubjectEnrollmentForm.jsx`, `studentPortalMutations.js` | UI, correlativas cliente y alta/baja | Alto | Validar carrera, plan, oferta, aprobadas y correlativas en servidor |
| Asignacion docente | PARTIAL | `subject_teacher_assignments`, `teacher_workload_records`, `teacherPortalData.js` | Vinculo materia/programa y carga estructurada | Medio | Introducir oferta de cursada con ciclo, comision y horario |
| Vista docente de materias | PARTIAL | `TeacherPortalModule.jsx`, `teacherPortalData.js` | Agenda y materias desde horarios legacy | Medio | Leer asignaciones/ofertas canonicas, no horarios legacy |
| Lista de alumnos por materia | UNSAFE | `teacherPortalData.js:373` | Usa inscripciones; si faltan, cae a carrera+anio | Alto | Eliminar fallback cuando exista read model seguro por materia |
| Asistencia | MISSING | Ninguno | Sin tabla, servicio o UI | Alto | Sesiones, registros y eventos de correccion |
| Evaluaciones | MISSING | `student_grades` solamente | No existe entidad evaluation | Alto | Evaluaciones tipadas y resultados separados |
| Calificaciones | PARTIAL | `student_grades`, `StudentGradesPage.jsx` | Persistencia/RLS y lectura alumno | Alto | Escritura docente, validacion, auditoria y vínculo a evaluacion |
| Recuperatorios | PARTIAL | enum `makeup` | Solo tipo de nota | Medio | Evaluacion `RECOVERY` real |
| Trabajos practicos | PARTIAL | enum `practical` | Solo tipo de nota | Medio | Evaluacion `PRACTICAL_WORK` real |
| Calculo de condicion final | MISSING | heuristicas de `StudentAcademicStatusPage.jsx` | No usa asistencia ni normativa | Alto | Motor normativo determinista y versionado |
| Confirmacion docente de condicion final | MISSING | Ninguno | Sin calculated/confirmed/override | Alto | Cierre atomico con motivo e historial |
| Historia academica | UNSAFE | `StudentAcademicStatusPage.jsx`, arrays snapshot | Proyeccion mutable; default global `regular` | Critico | Ledger canonico y proyeccion materializada |
| Correlatividades | PARTIAL | `prerequisites.js`, planilla `correlatividades` | Valida cursado solo en cliente | Alto | Servicio central para cursar y rendir |
| Elegibilidad para examen | MISSING | Ninguno | No hay contrato ni reason codes | Critico | Helper puro + RPC atomica como unica frontera de alta |
| Generacion de mesa con titular | PARTIAL | motor clasico y `adminReviewWorkflow.js` | Existe en oficial clasico y beta | Medio | Mantener clasico; validar universo antes de piloto beta |
| Recomendacion de vocales | PARTIAL | workflow experimental | Reglas duras y ledger en beta | Medio | Continuar sombra; no conectar a oficial aun |
| Confirmacion de mesa | UNSAFE | `toggleMesaConfirmacion` | Toggle sin validacion final | Critico | Comando servidor con precondiciones e historial |
| Autoinscripcion a examen | UNSAFE | `StudentExamEnrollmentPage.jsx`, Edge Function | Alta sin elegibilidad/24h | Critico | Deshabilitar como flujo confiable hasta RPC de elegibilidad |
| Cierre 24 horas antes | MISSING | Ninguno | Solo se filtran fechas futuras | Critico | Calculo servidor y cierre idempotente |
| Inmutabilidad de inscripcion | UNSAFE | `exam_enrollments`, snapshot | Update de estado; snapshot mutable; sin eventos | Alto | Event log de alta e invalidacion administrativa |
| Panel diario administrador | PARTIAL | `CronogramaTable.jsx`, `OperationsDashboard.jsx` | Lista de mesas, sin vista diaria/padron | Medio | Read model diario sobre mesas e inscripciones canonicas |
| Listado de inscriptos | PARTIAL | `exam_enrollments`, RLS | Datos disponibles, sin panel consolidado | Alto | Padron congelado al cierre |
| Generacion de acta | MISSING | Exportadores de cronograma | No existe acta ni estados ACT_* | Alto | Acta preliminar DEV sobre padron cerrado |
| Carga de resultados | PARTIAL | enums en `exam_enrollments`, `student_grades` | Sin UI ni cierre atomico | Alto | Resultado por inscripcion y cierre de acta |
| Sancion por ausencia | MISSING | Ninguno | No existe entidad/evento | Critico | Penalty append-only idempotente |
| Bloqueo del proximo llamado | MISSING | Ninguno | No hay regla ni ciclo de cumplimiento | Critico | Integrar penalty en elegibilidad |
| Auditoria de modificaciones | PARTIAL | `academic_audit_logs` y triggers | Cubre cinco tablas; no snapshot ni dominios faltantes | Alto | Eventos append-only y actor/motivo obligatorios |

## 6. Seguridad y permisos

### Implementado

- Rutas separadas por rol de cuenta.
- Edge Function exige cuenta alumno para mutaciones del portal.
- RPC relacional comprueba actor, membresia e identidad del alumno.
- RLS academica permite al docente leer/escribir notas solo en materias asignadas.
- RPC relacionales son ejecutables por `service_role`, no directamente por alumno.

### Incompleto o inseguro

- `workspace_snapshots` y `student_records` son legibles por cualquier miembro.
- No hay RPC/read model seguro equivalente para el portal docente.
- La Edge Function usa service role despues de autenticar, pero no revalida reglas
  academicas de la operacion.
- Los tests negativos no prueban aislamiento alumno A/alumno B y docente
  asignado/no asignado sobre todas las tablas academicas.
- No existe autorizacion especifica para cerrar cursadas, actas o sanciones
  porque esos comandos aun no existen.

## 7. Decision de implementacion

Clasificacion: **NO ES SOLO CARGA DE DATOS**.

Existe parcialmente la capa de identidad, padrones, inscripciones basicas, notas
y motor de mesas. No existe el nucleo transaccional que conecte cursada, historia,
elegibilidad, examen, acta y sancion.

No se implementaron componentes ni migraciones en este corte porque hacerlo sin
resolver primero el modelo crearia un segundo sistema paralelo en snapshot y
agravaria las inconsistencias. Tampoco es seguro activar oficialmente las
acciones actuales de autoinscripcion y confirmacion como si cumplieran las reglas.

## 8. Modelo objetivo recomendado

No es una migracion aplicada. Es el contrato minimo para el siguiente corte de
diseno local/desarrollo.

1. Catalogo academico canonico:
   `academic_terms`, `study_plans`, `subjects`, `course_offerings`.
2. Cursado:
   ampliar o reemplazar semanticamente `subject_enrollments` con oferta, ciclo,
   tipo de alta y estados institucionales.
3. Asistencia:
   `class_sessions`, `attendance_records`, `attendance_change_events`.
4. Evaluaciones:
   `course_evaluations`, `evaluation_results`.
5. Cierre de cursada:
   `course_status_closures`, `course_status_events`.
6. Historia:
   `academic_history_events` y una proyeccion de lectura reconstruible.
7. Mesas:
   `exam_tables`, `exam_table_status_events`, miembros de tribunal versionados.
8. Inscripcion:
   `exam_enrollment_events` o una tabla actual + ledger obligatorio.
9. Actas/resultados:
   `exam_acts`, `exam_results`, `exam_act_events`.
10. Sanciones:
    `exam_no_show_penalties` con origen, llamado bloqueado y estados auditables.

Todas las operaciones criticas deben ejecutarse mediante RPC/funcion atomica,
con `client_mutation_id`, constraint unico, actor autenticado, motivo cuando
corresponda y lock/version optimista.

## 9. Plan de trabajo seguro

### Etapa 0 - Contencion

- Mantener motor clasico como oficial.
- Mantener motor nuevo solo en sombra.
- No considerar confiable la autoinscripcion actual para un ciclo real.
- No considerar la confirmacion toggle como validacion institucional.
- Preparar tests RLS negativos de alumno/docente antes de nuevos datos reales.

### Etapa 1 - Catalogo y oferta de cursada

- Definir IDs estables de carrera, plan, materia, ciclo y comision.
- Crear oferta de cursada.
- Implementar inscripcion manual validada e inscripcion automatica de primer anio.
- Migrar gradualmente sin borrar snapshot.

### Etapa 2 - Docente, asistencia y evaluaciones

- Vincular docente a oferta, no solo a materia textual.
- Construir read model docente por asignacion.
- Agregar sesiones, asistencia, evaluaciones y notas.

### Etapa 3 - Cierre e historia

- Calcular condicion con reglas versionadas.
- Confirmar por docente con override auditado.
- Proyectar historia academica canonica.

### Etapa 4 - Elegibilidad e inscripcion a examen

- Implementar helper puro con reason codes.
- Revalidar dentro de RPC atomica.
- Aplicar plazo de 24 horas y estado de mesa.
- Hacer append-only las correcciones administrativas.

### Etapa 5 - Acta, resultado y sancion

- Congelar padron.
- Generar acta DEV/no oficial.
- Cerrar resultado e historia en una transaccion.
- Crear sancion idempotente por ausente.

### Etapa 6 - Integracion con motor asistido

- Solo despues de estabilizar el dominio academico, usar demanda real e historia
  para definir el universo de mesas del motor beta.
- No reemplazar `cronogramaInteligente.js` hasta superar sombra y piloto.

## 10. Pruebas existentes y faltantes

### Cobertura existente relevante

- Mapeo seguro del snapshot del alumno.
- Overlay relacional con fallback a snapshot.
- Filtrado de datos del portal alumno.
- Mapeo de materias/alumnos del portal docente.
- Idempotencia relacional conceptual mediante indices y locks SQL.
- Reglas y caracterizacion del motor clasico/beta.
- Toggle de confirmacion actual.

### Suites faltantes obligatorias

- alta automatica de primer anio e idempotencia;
- validacion servidor de inscripcion al cursado;
- permisos docente por materia y alumno;
- asistencia y auditoria de correcciones;
- evaluaciones flexibles y resultados;
- calculo/confirmacion/override de condicion;
- historia y vencimiento de regularidad;
- todos los reason codes de elegibilidad;
- limite exacto de 24 horas;
- inmutabilidad e invalidacion administrativa;
- cierre de padron;
- acta y resultado transaccional;
- ausencia, sancion unica, proximo llamado y cumplimiento;
- RLS negativa alumno A/B, docente asignado/no asignado y cross-institution.

## 11. Migraciones preparadas

Ninguna migracion fue creada ni aplicada en este corte. Preparar SQL ahora,
antes de acordar catalogo, estados y transiciones, seria prematuro y riesgoso.
La siguiente entrega debe ser primero un ADR/contrato de dominio y luego una
migracion local idempotente, no destructiva y con rollback.

## 12. Prueba manual permitida hoy

El flujo completo solicitado no puede probarse de punta a punta con garantias.
Si se hace una caracterizacion interna, debe ser local o sobre una institucion de
prueba y sin datos reales:

1. Crear alumno/docente de prueba.
2. Verificar que el alumno solo vea su payload filtrado desde la RPC segura.
3. Registrar y dar de baja una materia para observar snapshot/relacional.
4. Confirmar que la repeticion no duplique la fila relacional.
5. Verificar que el docente asignado lea la materia y sus filas academicas.
6. No usar la autoinscripcion a examen como prueba de elegibilidad.
7. No confirmar, exportar ni oficializar mesas.
8. Ejecutar el shadow audit del motor solo con `--no-write`.

## 13. Criterio de salida para el siguiente corte

Antes de implementar UI adicional deben quedar aprobados:

- catalogo y oferta de cursada canonicos;
- maquina de estados de cursado, mesa, inscripcion, acta y sancion;
- contrato de historia academica;
- contrato puro de elegibilidad con reason codes;
- limites de autoridad por rol;
- estrategia RLS que no exponga snapshot/padron completo a alumno o docente;
- estrategia de compatibilidad y backfill sin borrar legacy.

Hasta entonces, la conclusion operativa es:

```txt
La app cumple parcialmente.
No es seguro completar el flujo solo desde UI o workspaceSnapshot.
El motor clasico permanece como respaldo oficial.
El motor nuevo permanece en modo asistido beta y sombra.
```
