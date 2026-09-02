# Readiness agosto examEngine v2

## Finalidad

Este reporte consolida auditorias locales/read-only del nuevo `examEngine` v2 para decidir si puede usarse como preview interno de apoyo para las mesas de agosto.

No reemplaza el motor viejo, no guarda cronogramas, no publica mesas, no escribe en Supabase y no modifica datos reales.

`safeToReplaceLegacy` debe permanecer en `false` hasta completar identidad v2, comparacion compactada contra legacy y validacion institucional final.

## Estados de readiness

`NOT_READY`

No hay evidencia suficiente para usar el motor ni siquiera como preview interno.

`READY_FOR_INTERNAL_PREVIEW_ONLY`

El motor puede usarse como lectura de apoyo para diagnosticar calendario, superposiciones, vocales y casos manuales. No produce cronograma oficial.

`READY_FOR_ASSISTED_DRAFT`

El motor podria generar un borrador asistido con revision humana fuerte. Requiere identidad v2 cerrada y menos casos manuales.

`READY_FOR_HUMAN_REVIEW_PILOT`

El motor podria usarse en un piloto controlado con revision humana completa. Todavia no implica reemplazo de legacy.

`READY_FOR_OFFICIAL_USE`

Estado reservado para una version validada contra legacy compactado, con identidad v2 cerrada, pocos casos manuales y `safeToReplaceLegacy` habilitado explicitamente.

## Preview interno

Preview interno significa:

- uso local o dev-only;
- lectura de apoyo para decisiones institucionales;
- sin guardar ni publicar cronogramas;
- sin reemplazar el flujo productivo;
- con advertencias visibles sobre casos manuales y riesgos.

## Assisted draft

Un assisted draft seria un borrador no oficial que ya puede ordenar trabajo humano, pero todavia requiere revision institucional antes de circular.

El estado actual no llega a assisted draft porque identidad v2 sigue pendiente y los casos manuales son altos.

## Buckets operativos

`AUTO_FULL_CANDIDATES`

Mesas factibles con titular y dos vocales validos. Deben usarse solo como candidatos de preview.

`MINIMUM_REVIEW_CANDIDATES`

Mesas con tribunal minimo revisable. Requieren decision institucional.

`MANUAL_REQUIRED`

Mesas que necesitan intervencion humana.

`CALENDAR_DECISION_REQUIRED`

Mesas bloqueadas por calendario comprimido o superposicion global.

`IDENTITY_V2_BLOCKED`

Materias afectadas por homonimias o codigos finales pendientes.

## Matriz de riesgos

La matriz asigna nivel y accion recomendada a cada riesgo:

- `IDENTITY_V2_PENDING_HOMONYMIES`;
- `SUPERPOSITION_DOMINANT_BLOCKER`;
- `CALENDAR_COMPRESSION`;
- `INCOMPLETE_TRIBUNALS`;
- `MANUAL_CASES_TOO_HIGH`;
- `NOT_LEGACY_EQUIVALENT`;
- `HOURS_CHAIR_INFERRED_NOT_EXPLICIT`;
- `PREVIEW_ONLY_NOT_OFFICIAL`.

Los riesgos altos o criticos impiden uso oficial.

## Proximos pasos para agosto

1. Usar v2 solo como preview interno.
2. Exportar casos manuales.
3. Validar calendario agosto con fechas tentativas reales.
4. Resolver las homonimias de identidad v2.
5. Comparar contra legacy compactado antes de cualquier decision de reemplazo.
