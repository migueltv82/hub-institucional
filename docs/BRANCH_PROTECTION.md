# Protección de ramas para producción

Estas reglas aplican a `main` de este repo. Son la política de integración del producto; **este documento no configura GitHub ni confirma que la protección esté activa**. Su configuración y verificación son manuales.

## Reglas de integración

- `main` requiere CI verde para la versión que se va a integrar: el job `Calidad (Node 22)` del [workflow CI](../.github/workflows/ci.yml) debe terminar correctamente. Un resultado pendiente, fallido, cancelado o con etapas omitidas por fallo no habilita el merge.
- Se recomienda no hacer push directo a `main`: trabajar en una rama y abrir un PR. Configurar la exigencia de PR para que GitHub haga cumplir ese recorrido.
- Antes de solicitar el merge, ejecutar `npm run check` (`npm.cmd run check` en PowerShell) según el [runbook](RUNBOOK.md#puerta-de-calidad-obligatoria-antes-de-merge-y-despliegue). El resultado local no reemplaza el check del PR.
- Cada PR debe explicar qué cambia y cómo probarlo. Resolver observaciones bloqueantes antes de integrar y repetir la validación cuando cambien los commits.
- No desactivar auditorías, omitir tests ni ampliar excepciones de secretos para conseguir CI verde. Los fallos conocidos también bloquean; no se convierten en excepciones por ser anteriores al PR.

## Configuración manual en GitHub

Un administrador del repositorio debe crear o revisar una regla para `main` en Settings → Branches → Branch protection rules. Si el repositorio utiliza rulesets, configurar las reglas equivalentes allí, con aplicación activa a `main`. La disponibilidad depende del plan y la visibilidad del repositorio. Consultar la [guía oficial de protección de ramas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule).

Configuración recomendada para esta política:

- Exigir PR antes de integrar y al menos una aprobación de otra persona; invalidar aprobaciones cuando haya nuevos cambios revisables.
- Exigir status checks y seleccionar `Calidad (Node 22)`, emitido por GitHub Actions. Confirmar el nombre en una ejecución real del PR; no seleccionar un check inexistente ni uno de otro workflow.
- Exigir que la rama esté actualizada respecto de `main` y que las conversaciones de revisión estén resueltas.
- Mantener deshabilitados force push y borrado de `main`, y evitar bypass de las reglas, incluidos administradores.

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
- [ ] Las pruebas cubren la lógica modificada y los casos de error relevantes; no hay tests desactivados ni expectativas debilitadas para encubrir regresiones.
- [ ] Documentación y mensajes visibles están en español; identificadores sin tildes. Se explican riesgos residuales y recuperación cuando corresponda.

### Migraciones y cambios SQL

- [ ] Se declara explícitamente si hay cambios SQL; si no los hay, marcar los puntos restantes de esta sección como no aplicables con motivo.
- [ ] Los archivos SQL, dependencias, orden de aplicación y compatibilidad con frontend/Edge Function están documentados para el esquema de este repo.
- [ ] Se revisan RLS, permisos, firmas RPC y efectos sobre datos; las operaciones destructivas tienen respaldo y procedimiento de recuperación documentados.
- [ ] Hay evidencia de prueba en un ambiente aislado y de las verificaciones posteriores necesarias. Se distingue SQL versionado de SQL efectivamente aplicado.
- [ ] No se afirma aplicación en producción sin verificarla contra ese ambiente. El CI local no aplica ni certifica migraciones remotas.

El merge aprobado no equivale a autorización de despliegue: también debe completarse la [preparación para producción](PRODUCTION_READINESS.md).
