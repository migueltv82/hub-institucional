# Protección de `main`

Estas reglas aplican a `main` de `migueltv82/hub-institucional`. Son la política de integración del producto; **este documento no configura GitHub ni confirma que la protección esté activa**. La configuración remota y su verificación son estados separados.

## Estado auditado

- Repositorio remoto local: `https://github.com/migueltv82/hub-institucional.git`.
- Rama default detectada localmente y por GitHub: `main`.
- Workflow principal: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), nombre `CI`.
- Job principal: `Quality gate (Node 22.13)`.
- Comando protegido por el job: `npm run check`.
- Required status check esperado: `Quality gate (Node 22.13)`.
- Confirmación remota del check: **PENDIENTE DE PRIMERA EJECUCIÓN REMOTA**. GitHub muestra el check real después de que el workflow haya corrido al menos una vez en PR/push.
- Rulesets visibles por lectura remota: ninguno (`[]`).
- Branch protection clásica: **NO VERIFICABLE** con el conector disponible; GitHub respondió `403 Resource not accessible by integration` para el endpoint de protección.

### Nombres que no deben confundirse

| Concepto | Valor en este repo | Uso |
| --- | --- | --- |
| Workflow | `CI` | Nombre que aparece bajo Actions y agrupa ejecuciones del archivo `ci.yml`. |
| Job | `Quality gate (Node 22.13)` | Nombre del trabajo que ejecuta `npm ci` y `npm run check`. |
| Required status check | `Quality gate (Node 22.13)`, pendiente de confirmar tras primera corrida remota | Check que debe seleccionarse en Branch protection/rulesets. No seleccionar `Dependency Audit` mientras siga vigente `EX-001`. |

## Reglas de integración

- `main` requiere CI verde para la versión que se va a integrar: el job `Quality gate (Node 22.13)` del workflow `CI` debe terminar correctamente. Un resultado pendiente, fallido, cancelado o con etapas omitidas por fallo no habilita el merge.
- Pull Request obligatorio para cambios normales. Evitar push directo a `main`; trabajar en una rama corta y abrir PR.
- Antes de solicitar el merge, ejecutar `npm run check` (`npm.cmd run check` en PowerShell) según el [runbook](RUNBOOK.md#puerta-de-calidad-obligatoria-antes-de-merge-y-despliegue). El resultado local no reemplaza el check del PR.
- Cada PR debe explicar qué cambia y cómo probarlo. Resolver observaciones bloqueantes antes de integrar y repetir la validación cuando cambien los commits.
- No desactivar auditorías, omitir tests ni ampliar excepciones de secretos para conseguir CI verde. Los fallos conocidos también bloquean salvo que exista una excepción formal vigente en [CONSTRAINTS.md](../CONSTRAINTS.md), como `EX-001` para la auditoría de dependencias.

## Configuración manual en GitHub

Un administrador del repositorio debe crear o revisar una regla para `main` en Settings → Branches → Branch protection rules. Si el repositorio utiliza rulesets, configurar las reglas equivalentes allí, con aplicación activa a `main`. La disponibilidad depende del plan y la visibilidad del repositorio. Consultar la [guía oficial de protección de ramas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule).

Configuración recomendada para esta política:

- Exigir PR antes de integrar. Si el repo sigue con un único mantenedor, no imponer una cantidad de reviews imposible de cumplir; usar el PR como trazabilidad y hacer obligatoria la revisión humana adicional cuando haya otro colaborador disponible. Si se suma un colaborador estable, exigir al menos una aprobación externa e invalidarla cuando haya nuevos cambios revisables.
- Exigir status checks y seleccionar `Quality gate (Node 22.13)`, emitido por GitHub Actions, **solo después de confirmarlo en una ejecución real**. No seleccionar un check inexistente ni uno de otro workflow.
- Mantener `Dependency Audit` como auditoría manual mientras `EX-001` esté vigente; no agregarla como check obligatorio de PR/main sin completar antes el triage de dependencias.
- Exigir que la rama esté actualizada respecto de `main` antes del merge. Costo: puede requerir actualizar/re-ejecutar CI si `main` avanza. Beneficio: evita integrar código validado contra una base vieja; para este repo se prioriza seguridad sobre comodidad.
- Exigir que las conversaciones estén resueltas antes del merge.
- Mantener deshabilitados force push sobre `main`.
- No permitir borrado de `main`. Esto no impide borrar ramas de feature después del merge; son conceptos distintos.
- Aplicar reglas también a administradores para evitar saltos accidentales del quality gate. Si se necesita bypass de emergencia, debe quedar como excepción operacional explícita, con responsable, motivo, evidencia y validación posterior.

## Estrategia de merge

No reescribir historial existente. La metadata remota visible informa habilitados `allow_squash_merge`, `allow_merge_commit` y `allow_rebase_merge`; no se cambió esa configuración remota en esta etapa.

Política recomendada:

- Usar `squash merge` para PRs pequeños y autocontenidos, con título de commit claro.
- Usar merge commit solo cuando se quiera conservar la estructura de una rama con varios commits relevantes.
- Evitar rebase merge en `main` salvo decisión explícita del mantenedor, porque hace más difícil auditar qué PR incorporó cada conjunto de cambios.
- Eliminar ramas de feature después del merge si GitHub lo permite y ya no se necesitan; nunca confundirlo con permitir borrar `main`.

Estas opciones permiten exigir revisiones y checks mediante GitHub; guardar este archivo no las activa. Ver [comportamiento de las ramas protegidas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

Si el check no aparece, publicar primero el workflow y obtener una ejecución del PR; no sustituirlo por un nombre aproximado. No habilitar merge queue con el workflow actual sin adaptarlo y validarlo para ese flujo: hoy contempla `push` a `main` y `pull_request`.

### Verificación de la configuración

Registrar responsable, fecha y evidencia de la regla activa, sin secretos. En un PR de prueba, comprobar que el merge permanece bloqueado con CI pendiente/fallido y sin la aprobación requerida; con la última versión aprobada y todos los checks correctos, comprobar que las condiciones quedan satisfechas. Verificar en la configuración que no hay permisos de bypass no previstos; no intentar un push destructivo para probarlo.

Hasta completar esa verificación, el estado es **protección pendiente de acreditar**. No se debe describir `main` como protegida basándose solo en el workflow o en este documento.

## Descripción mínima del PR

Copiar y completar este esquema en español:

```markdown
## Qué cambia

Problema que resuelve y comportamiento resultante. Indicar el alcance.

## Cómo probar

Pasos reproducibles, rol/datos de prueba y resultado esperado.
Resultado de npm run check y enlace a la ejecución de CI del PR.

## Datos y riesgos

SQL: sin cambios / archivos, orden y verificaciones necesarias.
Estado de aplicación por ambiente: pendiente o verificado con evidencia.
Riesgos residuales y recuperación si corresponde.
```

Para documentación, indicar qué enlaces y consistencia se revisaron; CI sigue siendo obligatorio. No adjuntar credenciales, `.env` reales ni datos personales como evidencia.

## Checklist de revisión

### Seguridad y alcance

- [ ] El cambio permanece en este repo y conserva JavaScript/JSX y el stack actual.
- [ ] No incorpora secretos ni `.env` reales; `audit:repo` y `audit:prod` siguen activos y sin relajaciones para ocultar hallazgos.
- [ ] Los componentes no importan el cliente Supabase; el acceso a red pasa por `services/`, incluidos los servicios de módulos.
- [ ] Si cambia autorización o acceso a datos, se revisan rol, membresía e institución en servidor y se prueba el rechazo de acceso ajeno. Un control visual no basta.

### Pruebas y comportamiento

- [ ] La descripción permite reproducir el cambio y comprobar el resultado esperado.
- [ ] `npm run check` termina correctamente y el CI de la última versión del PR está verde, incluido build y su auditoría.
- [ ] `quality:deps` fue ejecutado manualmente o queda cubierto por una excepción vigente con responsable y vencimiento; no se ignoran hallazgos nuevos fuera de ese alcance.
- [ ] Las pruebas cubren la lógica modificada y los casos de error relevantes; no hay tests desactivados ni expectativas debilitadas para encubrir regresiones.
- [ ] Documentación y mensajes visibles están en español; identificadores sin tildes. Se explican riesgos residuales y recuperación cuando corresponda.

### Migraciones y cambios SQL

- [ ] Se declara explícitamente si hay cambios SQL; si no los hay, marcar los puntos restantes de esta sección como no aplicables con motivo.
- [ ] Los archivos SQL, dependencias, orden de aplicación y compatibilidad con frontend/Edge Function están documentados para el esquema de este repo.
- [ ] Se revisan RLS, permisos, firmas RPC y efectos sobre datos; las operaciones destructivas tienen respaldo y procedimiento de recuperación documentados.
- [ ] Hay evidencia de prueba en un ambiente aislado y de las verificaciones posteriores necesarias. Se distingue SQL versionado de SQL efectivamente aplicado.
- [ ] No se afirma aplicación en producción sin verificarla contra ese ambiente. El CI local no aplica ni certifica migraciones remotas.

El merge aprobado no equivale a autorización de despliegue: también debe completarse la [preparación para producción](PRODUCTION_READINESS.md).
