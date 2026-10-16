# Motor de mesas: invariantes de reglas duras y corrección de correlatividades por llamado

Fecha: 2026-10-16. Épica 04 (motor). Tarjeta 04.1 en Trello.

## Prueba de propiedades

`src/utils/examEngine/__tests__/engineInvariants.property.test.js` genera instituciones sintéticas con semilla fija (docentes con días y horas cátedra al azar, 2–7 materias en dos carreras, correlatividades entre años, uno o dos llamados con fechas al azar, a veces Prácticas Discursivas III/IV) y corre `generateRegularExamPlan` completo. Sobre `plannedMesas` verifica de forma independiente las reglas duras del README del motor:

- titular obligatorio y sin mover titularidades;
- máximo `MAX_SUBJECTS_PER_MESA` materias por mesa y Prácticas Discursivas III/IV sin agrupar;
- titular y vocales distintos dentro del tribunal;
- vocalías por docente y llamado ≤ `floor(horasCatedra / 2) + 1`;
- docentes del tribunal solo en días en que asisten;
- fecha dentro de las fechas disponibles del llamado;
- correlatividades no invertidas dentro de cada llamado.

Corre 200 instituciones en el modo por defecto y 100 en el modo `dateAware`; verifica determinismo y que el chequeo detecta violaciones fabricadas (no es vacío). Si falla, el mensaje trae la semilla para reproducir el caso con `buildInstitution(seed)`.

## Hallazgo: correlatividad invertida en el segundo llamado

La semilla 175 mostró que en el segundo llamado una correlativa previa (M5, 06/08) quedaba **después** de dos materias que dependen de ella (M2 el 04/08 y M3 el 05/08), aunque el motor las tenía marcadas con `correlativasPrevias: ["M5"]` y había fechas para ordenarlas. Viola la regla dura 5 ("las correlatividades no pueden invertirse").

Causa: `markPlannedSubjects` y `checkCorrelativityForSlot` (`src/utils/examEngine/planning/planTentativeDates.js`, usados también por `planDatesAndVocales.js` en el modo `dateAware`) guardaban la fecha planificada de cada materia en un único mapa sin llamado. Cada mesa pisaba a la anterior, así que al ubicar M2 en el segundo llamado se comparaba contra la fecha de M5 del **primer** llamado (27/07) y se la daba por ordenada.

Corrección: la clave del mapa incluye el llamado normalizado; cada llamado compara correlativas solo contra sus propias fechas. Regresión puntual en `planning/planTentativeDatesCorrelativityByCall.test.js` (2 de sus 3 casos fallan sin la corrección; la prueba de propiedades también la detecta).

## Resultado

- Con la corrección: 200/200 (modo por defecto) y 100/100 (`dateAware`) sin violaciones; un barrido descartable de 2000 semillas más y de 600 semillas por variante de compactación y modo tampoco encontró violaciones.
- Tests existentes del motor: 1262 sin cambios, todos PASS. quality:full 2448 tests en 308 archivos PASS, 0 high/critical.

## Límites

Los datos sintéticos casi nunca disparan la compactación (las variantes `safe`, `aggressive` y `off` produjeron la misma cantidad de mesas), así que la regla de máximo de materias por mesa y la de no agrupar Prácticas Discursivas quedan poco ejercitadas por la prueba de propiedades; siguen cubiertas por sus tests dedicados. No verifica afinidad o idoneidad de vocales ni la réplica del segundo llamado respecto del primero.
