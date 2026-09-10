-- Etapa 3: conteos despues de cargar y descargar planillas desde la UI.
-- Ejecutar en Supabase SQL Editor. Solo lectura; devuelve una sola grilla.
-- Ajustar params si se prueba otra institucion/workspace.
-- filas_fuente cuenta entradas del snapshot, no filas esperadas exactas:
-- los servicios normalizan, deduplican y expanden correlatividades.
-- Un cero sin datos fuente no prueba un fallo ni valida ese flujo funcional.

with params as (
  select
    '3f9dd1a0-19b8-462f-bdd8-7e849d90ae04'::uuid as institution_id,
    'main'::text as workspace_key
), snapshot as (
  select s.payload, s.updated_at
  from public.workspace_snapshots s
  join params p using (institution_id, workspace_key)
), counts as (
  select 1 as orden, 'workspace_source_files'::text as tabla,
    count(*) as filas_guardadas, null::text as fuente
  from public.workspace_source_files f
  join params p using (institution_id, workspace_key)
  union all
  select 2, 'teacher_availability_records', count(*), 'disponibilidadDocente'
  from public.teacher_availability_records a
  join params p using (institution_id, workspace_key)
  union all
  select 3, 'teacher_workload_records', count(*), 'cargaHorariaDocente'
  from public.teacher_workload_records w
  join params p using (institution_id, workspace_key)
  union all
  select 4, 'legacy_subjects_catalog', count(*), 'planesEstudio'
  from public.legacy_subjects_catalog c
  join params p using (institution_id, workspace_key)
  union all
  select 5, 'legacy_subject_prerequisites', count(*), 'correlatividades'
  from public.legacy_subject_prerequisites r
  join params p using (institution_id, workspace_key)
  union all
  select 6, 'legacy_exam_sessions', count(*), 'cronograma'
  from public.legacy_exam_sessions e
  join params p using (institution_id, workspace_key)
)
select c.tabla, c.filas_guardadas, c.fuente,
  case
    when jsonb_typeof(s.payload -> c.fuente) = 'array'
      then jsonb_array_length(s.payload -> c.fuente)
    else null
  end as filas_fuente,
  s.updated_at as snapshot_actualizado
from counts c
left join snapshot s on true
order by c.orden;
