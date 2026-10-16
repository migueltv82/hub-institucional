# Ensayo de rollback local de DB y archivos

Fecha: 2026-10-14. Tarjeta: https://trello.com/c/tq01D3Bz . Resultado funcional: PASS.
Ensayo final: f4bb51fb6f3abaf6. Evidencia: STORAGE_ROLLBACK_EVIDENCE.json.

Se recuperó una fuente sintética con un bucket privado y dos archivos (8192/16384bytes) en DB y volumen independientes. Luego se eliminó y volvió a subir el primer objeto con bytes distintos mediante Storage API en el destino. El ensayo comprobó SHA256 alterado y metadata divergente antes de iniciar rollback.

Método certificado: detener el contenedor destino propio; verificar labels del contenedor/volumen y revalidar DB generada, owner supabase_admin y marcador exacto de ejecución; recrear SOLO esa base descartable con template0 y restaurar el archive custom original mediante pg_restore transaccional. Los bytes originales se extrajeron en un NUEVO volumen propio previamente vacío. No se eliminaron directorios compartidos ni se modificaron roles o grants del cluster.

Storage volvió a arrancar contra DB y volumen recuperados. Cinco health HTTP200, proceso running y cero reinicios. Ambas descargas API coinciden con los tamaños ySHA256 del snapshot original. Filas de todas las tablas Storage (incluyendo UUID/versiones/tamaños/FK/historial65), owners/ACL/RLS, funciones/policies/índices/constraints/triggers permanecen iguales antes y después del arranque y las lecturas. Tiempo hasta comprobaciones completas del rollback:14646ms. Es una medición de un fixture local pequeño, no SLA productivo.

Historia preservada: el método anterior pg_restore--clean falló en dos intentos, incluido b1ec5cab11bb8e5a con Docker estable (OTHER_RESTORE_ERROR/PROCESS_EXIT). No se cuenta como PASS ni se certifica ese método; fue retirado del camino ejecutable. La causa exacta del rechazo no quedó aislada. El método final restaura en base vacía, siguiendo el camino de restore previamente ensayado.

Durante una ejecución previa Docker se apagó; logs de Windows acreditaron sockets AF_UNIX inaccesibles dockerInference/engine.sock. Para recuperar Docker se preservaron directorios runtime fuera del repo y se arrancó la aplicación sin factory reset, reinicio Windows/WSL ni modificación de datos/config/secretos persistentes. El directorio secrets-engine contenía exclusivamente un socket0bytes, no un almacén de secretos. Cinco directorios de sockets diagnósticos permanecen preservados en AppData (run.hub-recovery-* y docker-secrets-engine.hub-recovery-*); son separados de los recursos/archives del ensayo y no se declara su eliminación. El fallo puede reaparecer al reiniciar Docker. Docker y la base CLI original quedan activos para trabajo local.

Dos regresiones interrumpidas dejaron cleanup sin verificar; sus bases ba53d8667a48285e y81dc19b0feb18b52 se comprobaron ausentes tras limpiar únicamente los destinos de esos intentos con ownership verificado. Ensayo final y regresiones default/recovery secuenciales: PASS y cleanup0DB/containers/volumes/archivos de backup; buffers de archives sobrescritos. No quedaron fixtures propios. Nunca se copiaron datos reales del CLI.

Validación final: quality:full exit0,2398tests/296files,lint/build/auditrepo/auditprod114PASS,0high/critical y9moderate1low inventariados. Una ejecución anterior falló en un test existente; su rerun focal29testsPASS y posteriores gates completosPASS sin modificar assertions/timeouts/config. CHIEF independiente: Code ReviewPASS y AdversarialPASS; sin hallazgos nuevosP0–P3. Revisó el cambio y las guardas, no ejecutó personalmente los ensayos.

Typecheck:NO DISPONIBLE(JS). Lint:PASS. Tests:PASS. Build:PASS. Browser/E2E:NO APLICA;StorageAPIrealPASS. Database:PASS en alcance. RLS:NO APLICA a autorización de usuarios(service_role);preservación catálogoPASS. Security:PASS local. Performance:WARNING(métricas pequeñas sin SLA). Code Review:PASS. Adversarial Review:PASS.

Archivos de esta unidad: scripts/validateStorageLocalHarness.mjs, validateStorageRollback.mjs y.test.js; este informe y JSON de evidencia; docs/WORKLOG.md. Archivos previos preservados. Guardas impiden DB compartida, owner/marcador ajenos y rollback sin recovery antes de crear recursos.

Riesgos residuales: otro administrador local podría intervenir entre el check de ownership y DROP; nombre aleatorio y marcador acotan esa carrera, no un control para producción. Finalmente no se ejecuta si falta evidencia de propiedad. Terminación abrupta puede impedir finally. No se prueban writes concurrentes, cambios arbitrarios de schema, reversión de release frontend, Auth integrado ni S3/secretos remotos. Este rollback vuelve deliberadamente al snapshot congelado y descarta la mutación sintética posterior.

Sin Staging, Production, SQL remoto, deploy, commit ni push. Próxima unidad en Trello: integrar DB/Auth/Storage en un único snapshot local. La aceptación integral Edge/frontend/config externos y release sigue pendiente.

QUALITY GATE: FAIL (release global pendiente); microtarea rollback local y quality:full:PASS.
