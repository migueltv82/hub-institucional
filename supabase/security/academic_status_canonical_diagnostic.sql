-- 03.5 · Diagnostico READ-ONLY de condiciones academicas no canonicas en student_grades.
-- No modifica datos ni schema. Correr en el SQL Editor del ambiente a revisar, con target/ref verificado.
--
-- upsert_exam_enrollment_from_portal compara academic_status exacto: solo 'regular' habilita la mesa y
-- solo 'approved'/'promocionado' cumplen correlativas. Desde 03.4 el portal alumno decide igual, asi que
-- un valor no canonico (p. ej. 'Regular', 'regular ', 'Pendiente', 'cursando') deja al alumno bloqueado
-- hasta que se recargue la condicion. Este conteo dimensiona ese impacto antes de decidir el arreglo.

select
  grade.institution_id,
  institution.name as institution_name,
  grade.academic_status as raw_status,
  length(grade.academic_status) as raw_length,
  count(*) as live_rows,
  count(distinct grade.student_id) as students,
  max(grade.updated_at) as last_updated_at
from public.student_grades grade
left join public.institutions institution on institution.id = grade.institution_id
where grade.deleted_at is null
  and grade.academic_status not in ('pending', 'regular', 'libre', 'promocionado', 'approved', 'failed', 'absent')
group by grade.institution_id, institution.name, grade.academic_status
order by live_rows desc, grade.institution_id, grade.academic_status;

-- Resultado esperado para aplicar un CHECK sin romper re-ejecuciones del schema ni bajas de notas: 0 filas.
