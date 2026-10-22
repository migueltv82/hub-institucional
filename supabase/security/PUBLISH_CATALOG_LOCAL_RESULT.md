# I2c — Publicar el catálogo académico desde la app (local)

Fecha: 2026-10-19. Ejecutó: Claude. Entorno: dos bases descartables sobre `supabase_db_codex-baseline-local-7725bdda`, con los 9 archivos del baseline. Staging y Producción: **NONE**.

## Qué se agregó

- **`07_academic_operations.sql`:**
  - `academic_normalize_identity(text)`: helper interno, sin EXECUTE para ningún rol de la API. Normaliza el DNI igual que el lector de planillas.
  - `academic_admin_publish_catalog(uuid, jsonb)`: publica el catálogo con las mismas sentencias que el SQL de CAT.1.
    - Es `security definer` con `search_path=''`. La ejecuta solo owner/admin o superadmin; editor no.
    - Arma tablas temporales con `jsonb_to_recordset`.
    - Aborta sin escribir con `CATALOG_CAREER_RENAME`, `CATALOG_PLAN_MOVED` o `CATALOG_CAREER_NAME_TAKEN`.
    - Nunca borra. Devuelve los mismos conteos que la tabla final del SQL.
- **`src/utils/academicCatalog.js`:** la lógica pura que estaba en `scripts/buildAcademicCatalogSql.mjs`. Hoy la usan el script y la app.
  - Arma carreras, planes, materias, correlativas y el plan de cada alumno, con errores y advertencias.
  - Las fechas viajan como texto `AAAA-MM-DD`.
- **`src/services/academicCatalogPublish.js` y `AcademicCatalogPublishSection.jsx`** (Alumnos):
  - el admin elige la planilla académica y ve una vista previa con conteos, errores y advertencias;
  - con errores no se puede publicar;
  - "Con correlativas" viene destildado (decisión GO, opción a);
  - el plan de cada alumno sale de las inscripciones que dejó el importador de alumnos.

## Resultado

`node scripts/validatePublishCatalogLocal.mjs` → **PASS**, run `b734d89a82d0d59a`, cleanup 0.

| Caso | Resultado |
|---|---|
| Editor y docente llaman a la RPC | 42501, sin escribir nada |
| Base A: SQL generado por el script de CAT.1. Base B: la RPC con el payload de la app | Dumps idénticos en careers, plans, subjects, plan_subjects, prerequisites y student_plans (`equivalent: true`) |
| Payload por el camino de la app (inscripciones del importador) contra el de la planilla cruda del script | Idénticos (`appPayloadMatches: true`) |
| Alumnos con plan | Ana, por DNI desde la planilla. Beto no: su carrera tiene dos planes activos (conviviente y vigente) y el fallback no adivina |
| Publicar dos veces | Mismos conteos y mismo dump (idempotente) |
| Planilla que renombra una carrera publicada | `CATALOG_CAREER_RENAME`, sqlstate 22023, catálogo sin cambios |

## Regresiones

`validateAcademicCatalogLocal`, `validateBulkRosterLocal`, `validateStudentHistoryImportLocal`, `validateExamActaResultsLocal` y `validateExamPublicationLocal`: todas PASS.

## Pendiente

- Auditoría independiente completa: cambia SQL.
- Aplicar 07 en Producción: lo decide Miguel. Mientras tanto, el botón responde "Falta actualizar la base de datos" y sigue disponible el camino por SQL Editor (runbook §8.1 paso 3).
