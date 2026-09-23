# Aplicación segura de los scripts de seguridad del 2026-09-05

Procedimiento manual para los cuatro archivos existentes en `supabase/security/`. Esta guía no ejecuta SQL ni acredita aplicación remota. El nombre “bajo riesgo” no garantiza compatibilidad con una base que haya cambiado desde la auditoría.

**Prohibido aplicar cambios en producción sin respaldo recuperable y sin probar previamente los mismos bloques en staging.** Si falta cualquiera de los dos, detenerse. No ejecutar los cuatro archivos como un lote ni descomentar propuestas en conjunto.

## Orden y efectos

Orden obligatorio: **diagnostics → low_risk_indexes_search_path_auth_uid → revisión humana → permissions_review → validación y resolución de datos → constraints → post-check**. Cada flecha requiere revisar el resultado anterior; no significa aprobación automática del siguiente bloque.

| Archivo | Qué ejecuta actualmente | Clasificación |
| --- | --- | --- |
| [security_diagnostics](../supabase/security/2026-09-05_security_diagnostics.sql) | Consultas de catálogo, permisos, políticas, funciones, duplicados, cruces institucionales y valores inválidos. | Solo lectura. Puede devolver datos personales; conservar resultados fuera del repo y anonimizar evidencia. |
| [low_risk_indexes_search_path_auth_uid](../supabase/security/2026-09-05_low_risk_indexes_search_path_auth_uid.sql) | LR-01–12 crean índices; LR-13–17 reemplazan funciones; LR-18–19 eliminan y recrean políticas de lectura. Incluye consultas posteriores. | Muta esquema, definiciones y políticas. No hace limpieza masiva de datos; `handle_new_user()` contiene escrituras que se ejecutarán cuando se invoque el trigger. |
| [rls_function_permissions_review](../supabase/security/2026-09-05_rls_function_permissions_review.sql) | RP-01–04, incluido RP-03B, contienen `GRANT`/`REVOKE` activos. RP-05–06 tienen propuestas de escritura comentadas y consultas activas. RP-07 es una función propuesta comentada; RP-08 solo plantea decisiones. | Mixto: modifica permisos en los bloques activos; las consultas son de lectura. Las propuestas comentadas no se aplican al ejecutar el archivo. |
| [manual_review_constraints](../supabase/security/2026-09-05_manual_review_constraints.sql) | MR-01–07 proponen FK, CHECK e índices únicos dentro de comentarios. | Tal como está, no aplica cambios. Extraer y ejecutar un bloque aprobado sí muta esquema e integridad y puede fallar con datos existentes. No limpia ni fusiona datos. |

## Preparación obligatoria

- [ ] Identificar ambiente y esquema destino mediante una comprobación del operador; usar un alias en documentación pública, sin credenciales ni identificadores privados.
- [ ] Registrar commit o hash de los archivos y bloques concretos que se proponen aplicar. Contrastar con el [esquema disponible](../supabase/schema/00_README.md), sin importar migraciones de otro repo.
- [ ] Disponer de staging representativo del esquema, roles y flujos actuales, con datos sintéticos o anonimizados adecuados para probar restricciones.
- [ ] Verificar respaldo previo, alcance y restauración ensayada en un ambiente aislado. Capturar definiciones, propietarios, grants y políticas originales para una reversión selectiva.
- [ ] Designar operador y revisor, ventana de mantenimiento, criterio de interrupción y responsable de recuperación. Revisar tamaño de tablas y bloqueo esperado antes de crear índices o validar constraints.
- [ ] Preparar pruebas por rol e institución y resolver la disponibilidad del post-check descrito más abajo. Su ausencia bloquea la promoción a producción.

## 1. Diagnostics: lectura inicial

Ejecutar las consultas de `2026-09-05_security_diagnostics.sql` en staging y revisar **todas** las salidas. El editor puede presentar varios resultados por separado. Guardar una línea base de RLS, policies, definiciones de funciones, `search_path`, grants, índices, constraints y hallazgos de datos.

Si faltan tablas, columnas o firmas, detenerse: no saltar consultas para declarar compatible el conjunto. Los diagnósticos revisan una lista concreta de objetos; no constituyen una auditoría completa del esquema actual. Ampliar la revisión humana a las dependencias y flujos que realmente usa la app.

## 2. Low risk: un bloque por vez

- [ ] **LR-01–12:** comprobar si cada índice existe y comparar su definición, no solo su nombre. `IF NOT EXISTS` no corrige un índice distinto con el mismo nombre. Ejecutar un bloque y su consulta posterior antes de seguir.
- [ ] La versión del archivo usa `CREATE INDEX` sin `CONCURRENTLY` para SQL Editor. No asumir ausencia de bloqueo. Para tablas grandes, una variante concurrente requiere revisión específica y ejecución fuera de una transacción mediante una herramienta adecuada; no sustituir automáticamente el comando en el editor.
- [ ] **LR-13–17:** comparar el cuerpo completo de cada función con la definición remota capturada. Se reemplaza toda la función, no solo `search_path`; comprobar que no elimina correcciones posteriores de autorización o provisioning.
- [ ] Revisar especialmente LR-17: su versión de `handle_new_user()` obtiene `account_role` inicial de `raw_user_meta_data`. No reintroducirla sobre un trigger ya endurecido ni asumir que RP-07 se aplicará después, porque RP-07 está comentado.
- [ ] **LR-18–19:** comparar roles, expresión y comando de cada política antes de recrearla. Ejecutar cada pareja `DROP`/`CREATE` de forma atómica en una transacción revisada; no dejar una política eliminada si falla su recreación.
- [ ] Tras cada bloque, comprobar definición resultante y funciones afectadas: lectura de perfil/membresía, estado público, instituciones de login y alta de cuentas en staging. Ante error, detenerse y registrar qué alcanzó a aplicarse.

## 3. Permissions review: aprobación humana explícita

El revisor debe decidir por bloque qué acceso se habilita o revoca y qué flujo legítimo podría romperse. Los comentarios históricos sobre estado remoto no prueban el estado del destino actual.

- **RP-01–02:** revisar cierre de ejecución del trigger como RPC y exposición de instituciones de login. Verificar altas legítimas y acceso público previsto.
- **RP-03:** habilita `SELECT` a `authenticated` sobre las tablas listadas. Antes de concederlo, verificar RLS y que sus políticas no expongan padrones o datos académicos ajenos.
- **RP-03B:** revoca escrituras y otros privilegios en tablas académicas, restaurando `INSERT`/`UPDATE` solo para snapshots. Contrastar especialmente la edición de `teacher_records` y `student_records` y sus servicios actuales: una revocación puede cortar cargas o mantenimiento de padrones. No aplicar solo porque figura como endurecimiento histórico.
- **RP-04:** concede `INSERT`/`UPDATE` de `app_settings`; probar que únicamente el superadmin puede modificarlo y que los demás roles son rechazados.
- **RP-05–06:** las escrituras propuestas están comentadas. RP-06 indica no aplicar hasta contar con un flujo autorizado de carga de bloqueos. Las consultas activas sirven para observar grants, no para concederlos.
- **RP-07:** requiere revisar cómo `admin-users` provisiona alumnos, docentes y administradores antes de cambiar la fuente de `account_role`. Probar los tres tipos de alta en staging si se aprueba el cambio.
- **RP-08:** requiere una decisión institucional sobre acceso a datos personales; no contiene una política lista para ejecutar.

Ejecutar únicamente bloques aprobados y verificar accesos permitidos y denegados con usuarios reales de prueba, no solo con una cuenta privilegiada. Guardar el resultado antes de avanzar.

## 4. Constraints: primero los datos

- [ ] Resolver hallazgos con el responsable institucional mediante un procedimiento separado, respaldado y revisado. Estos scripts no autorizan borrar duplicados ni fusionar personas automáticamente.
- [ ] **MR-01:** comprobar cruces de institución, referencias huérfanas y la clave única referenciada `(institution_id, id)`. El diagnóstico con `INNER JOIN` detecta cruces, pero no demuestra ausencia de huérfanos. Revisar también el efecto futuro de `ON DELETE CASCADE`.
- [ ] **MR-02–03:** comprobar `logic_group` y `current_year` contra los CHECK propuestos y revisar nulabilidad según la regla de negocio.
- [ ] **MR-04–05:** acordar el rango institucional. El diagnóstico usa año actual + 1 como máximo, mientras las propuestas usan 2100; no son criterios equivalentes. Verificar los datos contra el rango exacto aprobado antes de ejecutar.
- [ ] **MR-06–07:** revisar DNI por institución, vacíos, provisorios, espacios y duplicados históricos. Los índices usan el valor original de `national_id`; `trim` solo filtra vacíos, no normaliza la clave de unicidad.
- [ ] Los índices únicos propuestos usan `CONCURRENTLY`: ejecutar fuera de transacciones y verificar definición y validez final. Si falla su creación, inspeccionar posibles índices inválidos antes de reintentar; no confiar únicamente en `IF NOT EXISTS`.
- [ ] Extraer solo la propuesta aprobada, comprobar si ya existe una restricción equivalente y aplicar una por vez en staging. Confirmar en catálogo su definición/validación y probar altas y modificaciones admitidas y rechazadas.

## Post-check obligatorio

Secuencia esperada: **`supabase/security/rls_negative_tests.sql` → `SECURITY_TESTS_OK` y `failed_count = 0`**.

**Bloqueo actual:** `rls_negative_tests.sql` no está presente en este checkout. No hay un enlace ejecutable disponible ni se puede certificar su cobertura o efectos. Antes de promover cambios, disponer de una versión revisada y compatible en este repo, inspeccionar si crea datos o modifica sesiones/permisos y probar su limpieza en staging. No sustituirla por `SELECT 'SECURITY_TESTS_OK'`, por un mensaje de DDL exitoso ni por `npm run check`.

Una vez disponible y revisado el script:

1. Ejecutarlo después de los cambios en staging y conservar el resumen íntegro; exigir el marcador y cero fallos. Cualquier error o prueba no ejecutada bloquea la salida.
2. Repetir diagnostics y comparar contra la línea base: cambios limitados a los bloques aprobados, definiciones y grants esperados, constraints válidos y sin nuevos hallazgos.
3. Probar login y operaciones de admin, alumno, docente y superadmin, rechazo entre instituciones, usuario bloqueado, permisos de Storage y flujos afectados por los grants. No asumir que un único script cubre todo.
4. Solo con respaldo, staging aprobado y revisión humana documentada, programar la aplicación manual en producción. Repetir diagnósticos previos para detectar diferencias y detenerse si el esquema cambió.
5. Verificar el destino tras aplicar. Ejecutar el post-check allí únicamente si su versión revisada es segura para ese ambiente y usa fixtures controlados. Si no puede ejecutarse con seguridad, mantener la verificación pendiente y no declarar la intervención completa.

## Reversión

Los comentarios de rollback son orientativos: compararlos con la línea base, no ejecutarlos como otro lote. No eliminar índices que ya existían antes de la intervención ni ejecutar `01_foundation.sql` completo para restaurar una sola función. Restaurar la definición exacta capturada y sus permisos/políticas necesarios; un archivo fuente actual puede no representar el estado anterior.

Restaurar grants a `PUBLIC` puede reabrir exposición. RP-03B explícitamente desaconseja una reversión general: recuperar solo el privilegio legítimo junto con su política revisada. Quitar una constraint no revierte correcciones de datos ni eliminaciones en cascada que ya hayan ocurrido; esas situaciones requieren el plan de recuperación y respaldo.

Tras cualquier reversión, volver a verificar accesos y registrar el estado real por bloque. No asumir que fallar un bloque deshace otros ya confirmados.

## Qué anotar en WORKLOG

Agregar una entrada en [WORKLOG](WORKLOG.md) por intervención con estos campos; no adjuntar filas nominales, DNIs, tokens, cadenas de conexión ni backups al repo:

- Fecha/hora y zona horaria; operador, revisor y ambiente mediante alias.
- Objetivo, commit/hash y archivos/bloques exactos (`LR-*`, `RP-*`, `MR-*`).
- Línea base: hallazgos, diferencias de esquema y enlace a evidencia con acceso restringido.
- Respaldo, prueba de restauración, ensayo en staging y aprobación humana previa a producción.
- Por bloque: `propuesto`, `omitido con motivo`, `aplicado sin verificar`, `aplicado y verificado`, `fallido` o `revertido`; hora y resultado observado.
- Decisiones sobre permisos y datos, efectos previstos y correcciones de datos autorizadas por separado.
- Post-check: versión del script, ambiente, marcador, conteo de fallos y pruebas funcionales. Si falta el script, escribir `no ejecutado: archivo ausente`, nunca `SECURITY_TESTS_OK`.
- Recuperación realizada, incidentes, riesgos residuales, responsable y siguiente acción pendiente.

Al redactar esta guía, WORKLOG contiene marcadores de conflicto de merge. Resolverlos mediante revisión antes de usarlo como registro consolidado; esta tarea no elige entre esas versiones ni altera sus afirmaciones históricas. Una entrada sobre esta entrega debe decir **solo documentación; SQL remoto no ejecutado**.
