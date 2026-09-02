# Shadow audits

Esta carpeta recibe reportes locales generados por:

```bash
node scripts/runExamEngineShadowAudit.mjs --snapshot path/to/snapshot.json
```

El runner opera exclusivamente sobre una copia en memoria. No importa Supabase, no usa servicios de persistencia y no modifica el snapshot ni `workspaceSnapshot.cronograma`.

Los archivos `EXAM_ENGINE_SHADOW_AUDIT_*` estan ignorados por Git porque pueden derivarse de datos institucionales reales. Para una prueba con datos reales se recomienda usar `--anonymize`.

`--no-write` es el modo permanente del runner respecto de datos de aplicacion. Las unicas escrituras permitidas son el reporte Markdown en esta carpeta y el JSON agregado solicitado explicitamente mediante `--output`.

Opciones:

```text
--snapshot <archivo.json>  Requerido. Snapshot local o wrapper con snapshot/payload.
--career <nombre>          Limita la auditoria a una carrera.
--callNumber <1|2>         Selecciona el llamado. Por defecto 1.
--anonymize                Reemplaza materias y carreras por aliases estables.
--output <reporte.json>    Escribe un JSON agregado adicional.
--strict                   Devuelve codigo 2 si el resultado no es READY.
--no-write                 Explicita el modo read-only, activo por defecto.
```

Sin `--strict`, las brechas quedan expresadas en el reporte y el proceso solo falla por problemas de seguridad o ejecucion. Con `--strict`, cualquier conclusion distinta de `READY` termina con codigo de salida `2`.

## Exportacion DEV completa

En desarrollo, un superadministrador puede abrir la seccion avanzada del generador y usar `Exportar snapshot completo anonimizado para shadow audit`. La descarga se llama:

```text
workspaceSnapshot.real.full.anon.local.json
```

El archivo conserva las relaciones mediante aliases estables y no se guarda dentro de la aplicacion. Para auditar Profesorado de Ingles desde la carpeta donde se descargo:

```powershell
node scripts\runExamEngineShadowAudit.mjs `
  --snapshot "C:\Users\User\Downloads\workspaceSnapshot.real.full.anon.local.json" `
  --career "profesorado de ingles" `
  --callNumber 1 `
  --anonymize `
  --output "docs\shadow-audits\resultado_real_prof_ingles.json" `
  --no-write
```

El nombre original de la carrera no se guarda en el snapshot exportado. El runner resuelve el filtro mediante el hash seguro incluido en `_auditExport.careerAliasLookup`.
