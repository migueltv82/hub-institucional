# HOOKS_TEST_COVERAGE_AND_ERROR_BOUNDARY_AUDIT

Fecha: 2026-07-18  
Rama: `codex/hooks-test-coverage-and-error-boundary-audit`

## Alcance y garantias

Este corte caracteriza generacion, hidratacion, autosave y limites de error existentes. No modifica `cronogramaInteligente.js`, reglas del motor, cronograma oficial, UI productiva, servicios de snapshot ni contratos publicos. No usa Supabase remoto y no agrega retries.

La unica correccion productiva es defensiva y local a `useWorkspacePersistence`: si un autosave ya iniciado termina despues del unmount, su resultado se ignora. La escritura iniciada no se cancela, pero ya no actualiza estado ni muestra toast sobre un componente desmontado.

## Matriz de cobertura

| Area | Tests actuales despues del corte | Cobertura faltante | Riesgo | Accion segura |
| ---- | -------------------------------: | ------------------ | ------ | ------------- |
| `useCronogramaGeneration` | 14 casos directos | No existe estado de carga ni operacion asincrona que caracterizar; `adjuntarMetadatosCronograma` sigue privado | Medio | Mantener prueba por `normalizarResultadoGeneracion` y contrato publico |
| Generacion exitosa | Cubierta con argumentos legacy y estructurados, resultado array/objeto y metadata | Comparacion exhaustiva con el motor real pertenece a tests del motor | Bajo | Mantener mock solo en `generarCronogramaDesdeArchivos` |
| Generacion fallida | Cubierta: captura, toast, no reemplazo del cronograma | El error no se propaga ni queda en estado observable | Medio | Definir contrato de error en un corte posterior |
| Confirmacion/reset | Cubierta: inmutabilidad, preservacion de mesas, borrado y limpieza | Fecha por defecto depende del locale del entorno | Bajo | Inyectar `confirmedAt` en tests directos |
| Resultado vacio/invalido | Cubierto: se normaliza a `[]` y se informa exito | Puede ocultar una salida invalida del motor | Alto | Evaluar validacion explicita sin cambiarla en este corte |
| `useWorkspacePersistence` | 12 casos directos | No hay deduplicacion por contenido ni cancelacion de red real | Medio | Mantener debounce probado; evaluar fingerprint en otro corte |
| Hidratacion | Cubierta con `institutionId`, snapshot vacio, error y unmount | Cambio rapido entre instituciones no tiene prueba de carrera entre respuestas | Medio | Agregar prueba multi-institucion antes de tocar seleccion institucional |
| Autosave | Cubierto con fake timers: hidratacion inicial, 700 ms, cambio, unmount y error | Una copia estructuralmente igual se guarda por cambio de referencia | Medio | Decidir estrategia de igualdad/fingerprint por separado |
| `workspaceSnapshot` | 17 casos locales y 2 relacionales simulados | Errores remotos de consulta/upsert y fallos parciales de sincronizacion tienen cobertura limitada | Alto | Extender el mock ya existente, sin crear otro cliente Supabase falso |
| `sourceFiles` | 3 casos de servicio y 5 del hook consumidor | Upload, cleanup y metadata remotos no tienen caracterizacion directa | Alto | Parametrizar el mock Supabase existente en un corte de servicios |
| `auth` | 1 caso directo y cobertura adicional en `AuthContext` | Sign-in exitoso, membership denegada, bloqueo y fallo de sign-out | Alto | Tests con mock de la frontera Supabase; no usar red |
| `errorHandling` puro | 10 casos | No esta integrado deliberadamente | Bajo | Revisar contrato antes de adopcion modulo por modulo |

No se crearon fixtures ni mocks compartidos: los tests existentes ya tenian dobles pequenos para las fronteras efectivamente usadas.

## Contrato observado de generacion

- `generar()` es sincrono y no expone `isLoading`.
- Entrega las referencias de entrada al motor sin transformarlas en el hook.
- Acepta array o `{ cronograma, ...metadata }`.
- Un resultado `null`, `undefined`, booleano o string se convierte en `[]` y aun genera toast de exito.
- Un error lanzado se captura, se muestra con `toast.error(error.message)` y no se propaga.
- El error original no se modifica, pero tampoco queda accesible al consumidor del hook.
- `toggleMesaConfirmacion` crea un array nuevo, clona solo la mesa objetivo y preserva las demas referencias.
- No hay tarea asincrona ni suscripcion que limpiar al desmontar.

## Contrato observado de persistencia

- La institucion se carga primero; luego se hidrata `workspaceKey: main` con `institutionId` explicito.
- La hidratacion inicial activa `skipAutoSaveRef` y no escribe inmediatamente lo recien leido.
- El debounce es de 700 ms y se limpia al cambiar dependencias o desmontar.
- Despues del corte, un autosave ya iniciado ignora resolucion o rechazo posteriores al unmount.
- El hook no compara contenido: la misma referencia no reactiva el efecto, pero un objeto nuevo equivalente se considera cambio.
- Los roles de solo lectura no guardan y exponen `syncStatus: read-only`.
- Los errores se convierten en estado `error` y toast; no se propagan al componente.
- No existen retries de lectura ni escritura.

## Matriz de manejo de errores

| Operacion | Tipo | Idempotente | Responsable de mensaje | Retry seguro | Riesgo |
| --------- | ---- | ----------: | ---------------------- | -----------: | ------ |
| Generar cronograma | Validacion/calculo local | Si con input estable | `useCronogramaGeneration` | No aporta valor | El hook consume el error y pierde observabilidad externa |
| Confirmar mesa | Mutacion local pura | No, es toggle | Componente/hook | No | Repetir invierte nuevamente el estado |
| Cargar instituciones | Lectura | Si | `useWorkspacePersistence` | Manual, ante red transitoria | No hay clasificacion tipada |
| Hidratar snapshot remoto | Lectura | Si | `useWorkspacePersistence` | Manual, ante red transitoria | El hook consume el error |
| Leer snapshot local | Lectura | Si | Servicio, sin mensaje UI | No necesario | JSON invalido se reemplaza silenciosamente por snapshot vacio |
| Guardar snapshot local | Escritura por clave | Si para el mismo payload | Servicio, sin mensaje UI | No automatico | Error de `localStorage` se registra y se reporta como exito local |
| Upsert snapshot remoto | Escritura compuesta | Parcialmente | Hook consumidor | No automatico | Snapshot, roster y datos docentes no estan en una transaccion unica |
| Leer datos docentes relacionales | Lectura | Si | `workspaceSnapshot` | Manual | El fallo se degrada silenciosamente al snapshot legacy |
| Guardar archivo fuente | Escritura compuesta | No | Hook consumidor | No | Path con timestamp, cleanup y metadata pueden quedar parciales |
| Eliminar archivo fuente | Escritura compuesta | Parcialmente | Hook consumidor | No | Storage puede borrarse antes de fallar metadata |
| Login institucional | Autorizacion/escritura de sesion | No | UI de login | No | Un fallo de `signOut` durante cleanup puede ocultar el error original |

## Propagacion por modulo

| Modulo | Captura | Transforma | Propaga | Conserva `cause` | Toast | Log | Retry |
| ------ | ------- | ---------- | ------- | ---------------- | ----- | --- | ----- |
| `useCronogramaGeneration` | Todos los errores del motor | No | No | El objeto original queda intacto, pero no se expone | Si | No | No |
| `useWorkspacePersistence` | Instituciones, hidratacion y autosave | Solo a texto/estado | No | No reemplaza el error; el consumidor no lo recibe | Si | Solo DEV, sin payload | No |
| `workspaceSnapshot` | Contexto, localStorage y sincronizaciones auxiliares | Crea errores de contexto; otros se relanzan | Mixto | Directos si se relanzan | No | Solo DEV | No |
| `sourceFiles` | Contexto y etapas remotas | Upload/cleanup se envuelven en `Error` sin `cause` | Si | No en los errores envueltos | No | Solo DEV | No |
| `auth` | Validacion y post-login | Crea errores de dominio simples | Si | Directos, salvo posible fallo del cleanup | No | No | No |

## Propuesta pura de errores

`src/lib/errorHandling.js` define:

- `ApplicationError`: conserva `code`, `message`, `cause`, metadata y stack causal.
- `ERROR_CODES`: codigos iniciales estables.
- `normalizeError`: conserva instancias existentes y clasifica red/autorizacion.
- `isRetryable`: solo acepta fallos transitorios reconocidos; rechaza validacion y autorizacion.
- `logError`: emite una estructura segura y redacta credenciales, tokens, passwords, keys y JWT.

No tiene dependencias de React o Supabase, no muestra toast, no implementa retry y no esta importada por ningun modulo productivo.

## Riesgos pendientes

1. Un resultado invalido del motor se presenta hoy como generacion exitosa vacia.
2. Los hooks consumen errores y solo conservan un mensaje visible; no existe error estructurado para componentes.
3. Autosave detecta identidad, no igualdad semantica, y puede escribir copias equivalentes.
4. El guardado remoto es una secuencia de upserts/sincronizaciones sin transaccion global.
5. `sourceFiles` pierde `cause` al envolver dos clases de error.
6. `auth` necesita caracterizacion del cleanup fallido para evitar que `signOut` oculte la causa principal.
7. La libreria propuesta debe adoptarse gradualmente, con tests de compatibilidad por modulo.

## Recomendacion

El siguiente corte seguro es `SERVICE_ERROR_CONTRACT_CHARACTERIZATION`: ampliar los tests remotos simulados de `workspaceSnapshot`, `sourceFiles` y `auth`, fijar los mensajes publicos actuales y decidir por modulo si `ApplicationError` puede incorporarse sin cambiar consumidores. No agregar retries hasta separar claramente lecturas idempotentes de escrituras compuestas.
