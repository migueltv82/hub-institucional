# Cola nocturna de Hub Institucional

Revisión: 2026-10-22-01. Preparada por el PM Codex el 22/10/2026, 09:17 Argentina (12:17 UTC).
Fuente: [tablero de Trello](https://trello.com/b/lrkR4RTc), descripciones y comentarios consultados en esta revisión.
Repositorio: `migueltv82/hub-institucional`. Base mínima: `edfb96ea47b7c8f5c90e18423133f0edecedf5f8`.

## Propósito y alcance

Esta copia permite ejecutar una cola acotada sin conector de Trello y sin pedir un prompt por tarea. Trello sigue siendo el registro del PM; este archivo no sincroniza sus cambios automáticamente ni concede acceso al conector.

La autorización es ejecutar las unidades disponibles de esta revisión, en orden, dentro de una sesión Cloud iniciada por Miguel. No configura un horario, no inicia sesiones ni garantiza ejecución indefinida. Usar una sola sesión nocturna para esta cola: los registros locales de ramas diferentes no son un sistema de bloqueo distribuido.

Cloud conserva los límites ya indicados por Miguel: commits locales y entrega de resultados; sin push, merge, deploy, secretos o escrituras de aplicación remotas. El PM revisa, integra y actualiza Trello al retomar.

## Preparación obligatoria

1. Leer `AGENTS.md`, `CLAUDE.md` y `CONSTRAINTS.md`. No debilitar sus controles. El proyecto se llama `examenes` en package.json: es el correcto, no `examenes-v3`.
2. Confirmar origin, rama y cambios existentes. Actualizar referencias de `origin/release/v1` mediante lectura, sin cambiar origin ni sobrescribir trabajo.
3. Verificar que la base incluye el commit mínimo. Inspeccionar commits posteriores por cierres o cambios que invaliden esta cola. Ante una contradicción material, registrar `STALE` para esa unidad y no implementarla a ciegas.
4. Preservar la rama y los commits de cualquier tarea previa. Reanudar una rama propia reconocible o crear una rama nueva desde la release actual. Nunca hacer reset destructivo, reescribir historia ni descartar archivos ajenos.
5. Crear `docs/cloud-night/<id-de-sesion>/REPORT.md` con identificador único de sesión, revisión de esta cola, HEAD inicial, rama y reservas. Antes de cada unidad registrar su estado `IN_PROGRESS`; al salir registrar resultado, commit, pruebas y límites.
6. Respetar reservas aunque Trello muestre la tarjeta todavía en PRIORIDAD: Cloud no tiene visibilidad de otras sesiones ni de sus commits locales.
7. En Cloud usar los comandos npm disponibles en Linux; `npm.cmd` corresponde al entorno Windows. El comando completo es `npm run quality:full`; no existe `npm run quality`.

No colocar nombres de personas reales, planillas privadas, tokens o secretos en informes. Las credenciales que los harness generen solo para su stack local sintético son distintas de credenciales productivas y se gestionan según esos harness.

## Reservas: evitar trabajo duplicado

| Unidad | Reserva en esta revisión | Acción permitida |
|---|---|---|
| [GATE.C2b: N3/N4](https://trello.com/c/w0biAsIq) | Sesión Cloud original a la que Miguel ya pasó el prompt de implementación | Solo esa misma sesión puede continuar su trabajo existente. Otra sesión nocturna la omite; no intenta localizar o integrar commits locales ajenos ni reinicia la implementación. |
| GATE.C2c: N5 | PM Codex local | No tomar ni modificar SQL 07 en esta sesión. |
| GATE.C2a y DEP.2 | Cerradas en release/v1, 09281ea y edfb96e | No repetir ni revertir. |
| GATE.C2 padre y re-gate de auditorías 1–3 | Bloqueados hasta cerrar N3/N4/N5 | No declarar Fase 1 aprobada. |
| I4: aceptación operativa | Miguel | Solo se autoriza la revisión documental inferior; nunca la aceptación humana ni ejecutar sus pasos. |

### Continuación opcional de GATE.C2b en su sesión original

Únicamente si esta es la sesión que recibió e inició esa tarea, terminar la unidad antes de tomar las siguientes. Mantener su alcance y las restricciones originales. Si no puede identificarse esa continuidad, omitirla como `RESERVED`.

Contrato: operaciones de A mantienen su destino de persistencia; resultados, errores y finally antiguos no pueden publicar datos, indicadores ni limpiar conflictos de B. Incluir cambio de workspace y A→B→A mediante generación de contexto, no solo igualdad de id.

Áreas: `GeneradorCronograma`, `useCronogramaFiles`, `useWorkspacePersistence`, `StudentHistoryImportSection` y `AcademicCatalogPublishSection`. Regresiones con promesas diferidas que fallen antes del fix, caminos positivos, revisión independiente, pruebas focales, quality:full y navegador cuando sea posible. No tocar SQL, Auth, dependencias o permisos docentes. Esta continuación no autoriza tareas adicionales del padre.

## Unidades disponibles para una sesión nocturna nueva

### 1. AUD-D1b — auditar los estados del catálogo de instituciones

Tarjeta fuente: [D1b](https://trello.com/c/kwMlrZUr). Correctivo original: `8d9d276`. Estado consultado: implementado, pendiente de auditoría liviana.

- Leer el diff original y la versión actual de `src/utils/institutionCatalogState.js`, su test y `src/pages/SuperAdminUsersPage.jsx`, junto con el servicio de lectura correspondiente.
- Verificar estados de carga, error con reintento, vacío real y éxito; no confundir solicitud pendiente o fallida con catálogo vacío. Revisar habilitación de "Nuevo usuario" y comportamiento de reintento.
- Ejecutar `npx vitest run src/utils/institutionCatalogState.test.js`. No presentar esta prueba del helper como validación completa de la página.
- Si el entorno permite navegador, verificar demora de consulta, respuesta 500 y recuperación con datos sintéticos o interceptación local controlada, sin Supabase remoto. No debilitar autenticación para montar el ensayo.
- Entrega: `docs/cloud-night/<id-de-sesion>/AUD-D1b.md`, con base exacta, archivos/líneas, pruebas, hallazgos, límites y recomendación. PASS solo para el alcance efectivamente cubierto; si falta browser, indicar ese gate pendiente.
- Propiedad: solo el informe y, si hace falta para una reproducción nueva, un test aislado dentro del directorio de sesión. No corregir la página ni el servicio en esta unidad. Un hallazgo se entrega al PM; no abrir implementación fuera de la cola.

### 2. AUD-I4 — contrastar el checklist de implementación con la evidencia

Tarjeta fuente: [I4](https://trello.com/c/WPpXk5M1). Documento implementado en `da9a923`; aceptación pendiente de Miguel.

- Leer `docs/DIA_D_CHECKLIST.md`, `docs/RUNBOOK_PRODUCCION_V1.md`, `docs/PRE_DEMO_CHECKLIST.md`, `docs/DEMO_GUIDE.md` y las evidencias versionadas que citen.
- Contrastar orden de instalación, backup/restore, limpieza, fuentes SQL, carga de catálogo/accesos/cursadas/historia y aprobaciones. Distinguir fechas y estados históricos de instrucciones vigentes.
- Consultar en particular `supabase/security/PRODUCTION_APPLY_2026-10-21.md` y `supabase/security/GATE_C2_ROSTER_ACCESS_RESULT.md`: aplicado, probado localmente y aprobado para producción son estados diferentes. Revisar también referencias antiguas a Claude como responsable frente a la dirección vigente del PM Codex.
- Entrega: `docs/cloud-night/<id-de-sesion>/AUD-I4.md`, tabla documento/sección/evidencia/inconsistencia/propuesta. Señalar qué exige decisión humana y qué dato remoto no pudo verificarse.
- Propiedad: solo el informe. No editar el checklist/runbook, no ejecutar sus comandos remotos, no consultar producción y no afirmar que backups, SMTP, dominio o protección de ramas están configurados a partir de documentación vieja. La aprobación de Miguel sigue abierta.

### 3. DEP.3a — reducir las alertas de Vitest/mocker, sin cambios de aplicación

Tarjeta fuente: [DEP.3](https://trello.com/c/Ergkop0k). Subunidad autorizada de esa tarjeta; no supone cerrar toda DEP.3.

- Leer `docs/DEPENDENCY_TRIAGE_2026-10-22.md` y obtener un audit actual. Base histórica: 7 moderate, 0 high/critical; no asumir que el conteo continúa igual.
- Verificar en fuentes primarias la versión compatible que corrige los avisos de Vitest/@vitest/mocker y sus requisitos de Node, Vite y plugins. Respetar Node 22.13 de CI y Vite 8.3.5 o la versión posterior ya aprobada en release.
- Actualizar únicamente Vitest y su cierre transitivo necesario, dentro de la misma versión mayor y de rangos compatibles. Mantener las demás dependencias directas. Generar el lock con npm, sin --force, downgrades, nuevos overrides o edición manual del lock.
- Si no existe solución compatible, entregar triage sin cambiar paquetes. No saltar a un upgrade mayor ni actualizar Mammoth, ExcelJS o Vite en esta unidad.
- Revisar el diff programáticamente y ejecutar `npm ci`, pruebas focales afectadas y `npm run quality:full`. Se permite limitar paralelismo por recursos, sin cambiar assertions o timeouts. Registrar la versión del gestor usada; no modificar herramientas globales.
- Obtener la revisión independiente exigida por AGENTS. No ajustar tests de negocio para conseguir verde. Si se requiere una migración no acotada, registrar bloqueo.
- Propiedad: `package.json`, `package-lock.json`, y el informe `docs/cloud-night/<id-de-sesion>/DEP-3a.md`. No editar código de aplicación, SQL, workflows, AGENTS o CONSTRAINTS.
- Entrega: conteos/advisories antes y después, versiones, compatibilidad, diff y resultados de checks. Las alertas de otras rutas quedan explícitamente pendientes. Un fallo high/critical nuevo impide aprobar esta unidad.

## Reglas para encadenar trabajo

- Solo una unidad activa por vez. Terminarla o dejarla en estado recuperable antes de continuar.
- Una auditoría que encuentra un defecto cumple su cometido al documentarlo fielmente; no significa PASS del componente. No corregirlo fuera del alcance autorizado.
- Un FAIL de seguridad o corrupción confirmado se documenta y detiene las unidades que dependan de ese componente. Se pueden continuar las auditorías documentales independientes.
- No combinar commits no aprobados con pruebas de otro componente sin declarar explícitamente la base. No cherry-pickear trabajo de terceros ni tocar ramas ajenas.
- Mantener commits separados por unidad; el PM integra después. Un bloqueo en una unidad no obliga a abandonar otra independiente, pero no se oculta ni se relajan gates.
- No declarar DONE de producto ni actualizar Trello sin conector. Estados del informe: `RESERVED`, `STALE`, `IN_PROGRESS`, `REVIEW_READY`, `BLOCKED` o `SKIPPED`; añadir veredicto técnico y gates pendientes por separado.

## Infraestructura y autonomía

No dedicar toda la sesión a preparar infraestructura bloqueada. Una comprobación acotada permite clasificar capacidades disponibles; una descarga bloqueada se registra con dominio/error y no se repite indefinidamente.

Docker instalado no demuestra que existan las imágenes, red, base sana o navegadores que exige el harness. No cambiar versiones/digests, nombres de recursos, `channel: 'chrome'`, configuración de red ni tests para forzar PASS. No borrar recursos ajenos. Usar únicamente stacks sintéticos locales de propiedad verificada y comprobar su limpieza.

Si faltan infraestructura, revisión independiente o credenciales de prueba válidas, ejecutar lo disponible, indicar lo no ejecutado y entregar para validación local. No tratarlo como autorización para omitir un gate ni para usar producción.

No enviar mensajes a otros chats ni pedir aprobación durante una espera nocturna para acciones fuera del alcance: registrar el bloqueo y pasar a otra unidad independiente autorizada.

## Informe y conservación del trabajo

Actualizar REPORT.md después de cada unidad, antes de seguir. Incluir:

| Campo | Contenido obligatorio |
|---|---|
| Identidad | Revisión de cola, sesión, fecha/zona y rama |
| Base | SHA de release leído y HEAD inicial/final |
| Unidad | ID y URL de tarjeta fuente; reserva o motivo de selección |
| Resultado | Estado de entrega distinto del veredicto del componente |
| Cambios | Archivos y commit propio; no mezclar datos privados |
| Pruebas | Comando, exit code y resultado real; pendientes y errores de entorno |
| Revisión | Revisor independiente y alcance, o gate pendiente |
| Riesgo | Hallazgos P0/P1/P2/P3 y decisiones humanas pendientes |
| Integración | Orden de commits, dependencias y conflictos previstos |

Al finalizar, conservar commits locales y exportar sus cambios en un patch y, si el entorno lo admite, un git bundle verificable. Entregarlos como archivos descargables junto con REPORT.md y logs sin secretos. Probar que el bundle/patch corresponde a la base informada. No asumir que una rama local de Cloud puede verse desde esta PC o desde origin sin exportación.

No hacer push: ese permiso no está incluido en esta cola. Si la plataforma no permite exportar o conservar los archivos, informarlo como bloqueo de entrega; no afirmar que el PM ya puede recuperar los commits. No depender únicamente del texto final de la conversación para registrar el trabajo.

Cuando se agoten estas unidades o se alcance el límite de la sesión, entregar el informe y terminar de forma segura. No crear sesiones nuevas, programaciones, tareas externas o requisitos de producto para prolongar la ejecución.

## Actualización por el PM

Esta cola es una instantánea con reservas explícitas. El PM revisa resultados, integra commits y actualiza Trello y la siguiente revisión antes de una nueva tanda. Si Miguel cambia el alcance, su instrucción directa prevalece; debe quedar registrada en REPORT.md para la revisión posterior.
