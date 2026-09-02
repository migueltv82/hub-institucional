# Motor V2 definitivo — Matriz de decisión institucional

## Objetivo
Construir un motor limpio para cronogramas de mesas de examen del Nivel Superior, evitando parches acumulados. El motor debe separar: normalización, afinidades, correlatividades, reglas docentes, agrupación, vocales, reparación, validación y reporte.

## Reglas duras
1. Toda materia regular debe tener primer y segundo llamado.
2. El segundo llamado debe nacer del patrón del primero; puede ajustar, pero nunca omitir materias.
3. Mitad más uno por docente y por llamado: `Math.floor(diasAsistencia / 2) + 1`.
4. Varias participaciones del mismo docente en la misma fecha y llamado cuentan como un solo día afectado.
5. Máximo dos materias agrupadas por mesa.
6. Máximo dos materias propias del mismo docente por fecha y llamado.
7. La materia posterior nunca puede rendirse antes que la correlativa anterior.
8. Las correlativas directas pueden rendirse el mismo día y pueden agruparse.
9. Toda mesa debe tener titular.
10. Mesa mínima válida: titular + un vocal. Mesa sin vocales solo puede quedar pendiente si se intentó reparación.
11. No usar vocales sin afinidad verificable.
12. Un docente no puede ser titular y vocal en la misma mesa.
13. Un docente no puede ser vocal en más de una mesa distinta el mismo día y llamado.
14. No mezclar carreras incompatibles salvo afinidad explícita o familia disciplinar válida.
15. Informática/TIC solo con Informática/TIC.
16. Inglés con Inglés es afinidad válida.
17. Prácticas de profesorados pueden cruzarse entre profesorados; prácticas técnicas de tecnicaturas solo dentro de su carrera.
18. Si una mesa queda sin vocales, se debe intentar reparación antes de dejarla pendiente.

## Reglas blandas
1. Preferir dos vocales.
2. Reducir mesas sin vocales.
3. Agrupar cuando ayude a formar tribunal.
4. Priorizar agrupaciones que abran compatibilidad entre carreras.
5. Reutilizar días ya afectados del docente.
6. Replicar el segundo llamado lo más parecido posible al primero.
7. Evitar concentración excesiva de mesas en un día.
8. Preferir vocales de mayor afinidad.
9. No mover una mesa óptima salvo necesidad fuerte.
10. No agrupar por agrupar.

## Familias compatibles de carreras
- Profesorado de Química ↔ Laboratorio.
- Profesorado de Inglés ↔ Traductorado.
- Turismo ↔ Geografía.

## Familias de idoneidad
- `INGLES`: materias de inglés, lengua inglesa, gramática inglesa, fonética, fonología, inglés técnico/general.
- `INFORMATICA`: informática, TIC, tecnología de la información, informática aplicada.
- `PRACTICAS_PROFESORADO`: prácticas docentes/profesionales/residencia de profesorados.
- `PRACTICAS_TECNICAS_<CARRERA>`: prácticas técnicas de tecnicaturas, cerradas por carrera.

## Resultado esperado de cada evaluación
```js
{
  permitido: true,
  errores: [],
  advertencias: [],
  puntaje: 85,
  razones: []
}
```
