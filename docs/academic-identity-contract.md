# Contrato canónico de identidad académica

Cada identificador representa un solo concepto y no debe reutilizarse como fallback de otro:

- `student_id`: UUID de `profiles.user_id` y del usuario Auth.
- `student_record_id`: UUID de `student_records.id` dentro de una institución y workspace.
- `subject_enrollment_id`: UUID de `subject_enrollments.id`.
- `subject_id`: clave canónica textual de la materia durante la transición actual.
- `program_id`: clave canónica textual de la carrera durante la transición actual.
- `institution_id` + `workspace_key`: alcance obligatorio de todas las lecturas y escrituras.

En entidades relacionales, `id` siempre conserva el UUID real de la tabla. Un identificador importado sólo puede aparecer en `legacy_snapshot_id` y nunca se usa para autorizar ni relacionar datos académicos. Las equivalencias por email o DNI sólo se aceptan cuando producen una coincidencia única; nunca deben adivinarse.
