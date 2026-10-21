# Gate final Codex · AUD16–18
Base: release/v1 d0f11ee (runtime 0a120d0), 2026-10-21; un solo revisor, solo local, sin correcciones.
Leídas las cuatro pasadas de Claude y los diffs 143efb7/972613c/5bafedd/0a120d0; sus cierres no cierran los pendientes de Codex indicados abajo.
Veredictos: **1 FAIL · 2 FAIL · 3 FAIL**. QUALITY GATE: FAIL.
Harness existentes: docente 48 PASS (8d024ae7e82568f2), catálogo 32 PASS (6a0ed31a31944156), bulk 13 casos + 5 concurrencias PASS (325fd5be1515cfa1), cleanup=0.
Focales: 7 archivos / 77 tests PASS; incluyen una observación propia del fallo A→B, no aceptación del defecto. Sin npm run check completo.
07 completo como postgres: current_user=postgres, rolsuper=false, rolbypassrls=true; objetos public del clon puestos a su nombre explícitamente, sin cambiar roles globales; timestamps/revisiones idénticos.
Bulk extendido fd9af6274d4808df: trigger BEFORE INSERT OR UPDATE activo, cinco concurrencias PASS y cuatro filas finales con referencia/código coherentes; cleanup=0.

## P1 heredado, ítem 1 · Acceso fuera de vigencia · 06_subject_teacher_assignments.sql:530; 07_academic_operations.sql:681,1176
Reproducción ya documentada en TEACHER_ASSIGNMENT_MODEL_INDEPENDENT_AUDIT.md, run 0a62cdcdafb35968; no se repitió.
1. Admin registra licencia con inicio hoy+3 y fin hoy+10 mediante RPC real.
2. Antes del inicio: titular obtiene roster=0 y suplente roster=1; vencida la suplencia, mantiene roster=1.
3. En HEAD los autorizadores siguen filtrando rol/estado, sin fechas; 0a120d0 no los modifica. Llamarlo fase B no elimina el permiso indebido.
Propuesta: regla temporal única en autorización/roster/avisos, con pruebas de límites; no habilito el 06 por este gate funcional.

## P2 heredado, ítem 2 · Carrera ambigua elegida silenciosamente · 07_academic_operations.sql:2588
Reproducción previa en CATALOG_REFERENCES_INDEPENDENT_AUDIT.md, run f9bd2c2f43e9be1b; no se repitió.
1. Carrera A tiene código FIX-A; otra carrera tiene nombre FIX-A y código OTHER-CODE, sin planes.
2. academic_resolve_catalog_subject rechaza carrera FIX-A con CARRERA_AMBIGUA.
3. academic_resolve_plan_subject_id elige el plan de A; el resolver sigue igual en HEAD y discrepa con la resolución de carrera exigida.
Propuesta: resolver una sola carrera antes de considerar planes y devolver NULL ante ambigüedad; sigue abierto pese al cierre de WHERE/ON CONFLICT.

## P2, ítem 3 · Importación pendiente evade el ancla de institución · src/hooks/useCronogramaFiles.js:546–547; BulkRosterSection.jsx:31–32
1. Iniciar onUploadTeachers en A y dejar pendiente el parser; cambiar a B con los hooks reales de importación/persistencia y el mismo cableado del panel.
2. Completar hidratación B: filas B y hydratedInstitutionId=B; resolver después el parser de A.
3. Los setters publican filas IMPORT-A, pero el ancla queda B; el componente real habilita el botón y llama applyTeacherAssignments({institutionId:B,rows:filasA}).
Propuesta: token/generación de contexto para toda importación/borrado pendiente; descartar callbacks antiguos y publicar datos+ancla juntos. Reproducción jsdom con parser/persistencia/RPC simulados.

## P3, ítem 2 · Renombrado manual deja referencia ajena al código · 07_academic_operations.sql:2643–2653
1. En el fixture del harness, como dueño del catálogo local, renombrar subjects.code de LATE2-01 a GATE-RENAMED sin cambiar su id.
2. Como docente autenticado repetir academic_teacher_create_class_session para LATE2-01 y el mismo día, cambiando topic.
3. RPC OK; fila conserva texto LATE2-01 y referencia a GATE-RENAMED, aunque resolver actual devuelve NULL (57265b4ad9a70e97; cleanup=0).
Propuesta: impedir renombrados de códigos en uso o revalidar código/carrera antes del retorno rápido. Admin API intentó UPDATE pero no cambió filas: sin bypass de RLS demostrado.

Límites: no navegador/PostgREST real ni datos remotos; conservación de timestamps probada sobre fixture normalizado, no todo histórico posible. Runners propios fuera de Git; solo se versiona informe+una línea de WORKLOG.
Confirmación independiente del 07 completo y control negativo de admin API: 985cf58847e99df3 PASS, cleanup=0; sin cambios funcionales.
¿Habilita correr el 06 en Prod? **NO**, P1 de acceso vigente. ¿Habilita re-correr el 07 en Prod? **NO**, carrera ambigua y carga A→B pendientes; la ejecución técnica del SQL sí pasó.
