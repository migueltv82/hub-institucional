# Oficializacion server-side del flujo administrativo de examenes

## Alcance

Este documento prepara la oficializacion transaccional del cronograma revisado. No crea tablas, no aplica migraciones, no llama Supabase y no modifica `workspaceSnapshot.cronograma`. La generacion y las exportaciones oficiales conservan su comportamiento actual.

## Diagnostico actual

- `src/services/workspaceSnapshot.js` persiste un unico documento en `workspace_snapshots.payload`. Alli conviven `cronograma` y los eventos experimentales `adminReviewDecisions`, `adminReviewDrafts`, `adminReviewPromotions`, `adminReviewApprovalRequests` y `adminReviewSecondApprovals`.
- El cronograma considerado oficial es actualmente el array `payload.cronograma`. No existe una tabla relacional de versiones oficiales ni un evento de oficializacion inmutable.
- El cliente puede guardar el snapshot con la sesion autenticada y RLS. Ese mecanismo es valido para compatibilidad y borradores, pero no ofrece una transaccion aislada para verificar y versionar una oficializacion.
- El proyecto es multi-tenant por `institution_id` y `workspace_key`. Los roles administrativos se resuelven mediante perfil global y membresia institucional.
- La Edge Function `admin-users` ya implementa el patron de autenticar el JWT, verificar permisos y crear un cliente Supabase con `service_role` solo en servidor.
- `supabase/setup_multi_tenant/03_academic_portal_rpc.sql` ya usa RPC exclusivas de `service_role` y `pg_advisory_xact_lock` para escrituras atomicas con concurrencia controlada.
- Las tablas relacionales academicas y docentes existentes no representan versiones oficiales del cronograma ni la cadena administrativa completa.

## Decision arquitectonica

| Opcion | Uso recomendado | Decision |
| --- | --- | --- |
| RPC PostgreSQL | Transaccion, locks, idempotencia, constraints y escritura atomica | Necesaria como limite transaccional |
| Edge Function Supabase | Autenticacion, autorizacion, rate limiting, auditoria de solicitud y llamada a RPC | Necesaria como puerta de entrada |
| Servicio JS con `service_role` | Orquestacion sin garantia atomica entre multiples escrituras | No usar como unico mecanismo |
| Evento append-only + version oficial | Historial, trazabilidad y activacion sin overwrite | Modelo de persistencia recomendado |

La arquitectura recomendada es:

```text
cliente autenticado
  -> Edge Function admin-users / officialize_admin_review_schedule
  -> autorizacion institucional obtenida del servidor
  -> cliente service_role solo dentro de la Edge Function
  -> RPC public.officialize_admin_review_schedule(...)
  -> lock + revalidacion + evento append-only + nueva version oficial
```

La Edge Function no debe hacer varias escrituras REST independientes. Debe delegar una unica operacion atomica a la RPC.

## Contrato de evento

El helper `adminReviewOfficializationServerContract.js` define y valida el contrato preparatorio:

```js
{
  officializationId,
  type: 'ADMIN_REVIEW_OFFICIALIZATION_EVENT',
  status: 'OFFICIALIZED',
  institutionId,
  workspaceKey,
  planId,
  candidateId,
  promotionId,
  requestId,
  secondApprovalId,
  draftId,
  revisionNumber,
  officializedAt,
  officializedBy: { userId, role },
  basedOn: {
    currentOfficialScheduleFingerprint,
    proposedOfficialScheduleFingerprint,
    finalCandidateHash,
    promotionIntegrityHash,
    requestIntegrityHash,
    secondApprovalIntegrityHash
  },
  previousOfficialVersionId,
  newOfficialVersionId,
  serverVerification: {
    authorization: 'PASSED',
    hashReverification: 'PASSED',
    currentScheduleRecheck: 'PASSED',
    appendOnlyWrite: 'PASSED',
    noDirectOverwrite: 'PASSED'
  },
  isOfficial: true
}
```

El actor y el rol del evento deben provenir del JWT y de la membresia consultada por el servidor. No se aceptan desde el cuerpo del cliente.

## Contrato de version oficial

Tabla propuesta: `official_exam_schedule_versions`.

```js
{
  versionId,
  institutionId,
  workspaceKey,
  source: 'admin_review_officialization',
  status: 'ACTIVE' | 'SUPERSEDED' | 'ROLLED_BACK',
  createdAt,
  createdBy: { userId, role },
  scheduleFingerprint,
  schedule,
  basedOnOfficializationId,
  previousVersionId,
  isOfficial: true
}
```

Tabla propuesta para eventos: `admin_review_officialization_events`. Cada fila es inmutable y referencia la version anterior y la nueva. La version guarda el cronograma oficial completo como `jsonb` durante esta etapa, para preservar el contrato actual sin normalizar prematuramente cada mesa.

Restricciones minimas propuestas:

- claves foraneas por institucion/workspace y entre evento/version;
- `unique (institution_id, workspace_key, plan_id)`;
- `unique (institution_id, workspace_key, candidate_id)`;
- una unica version `ACTIVE` por institucion/workspace mediante indice parcial;
- `check` de tipo, estado, `is_official` y fingerprints no vacios;
- trigger que rechace `UPDATE` y `DELETE` sobre eventos;
- timestamps de servidor, nunca suministrados como autoridad por el cliente.

## Revalidacion obligatoria

La RPC debe reconstruir el estado desde fuentes persistidas y recalcular:

1. Actor autenticado y rol administrativo vigente.
2. Pertenencia a `institution_id` y acceso a `workspace_key`.
3. Existencia y vigencia de plan, candidato, promocion, request y segunda aprobacion.
4. Integridad de todos los hashes de la cadena administrativa.
5. Ultima promocion/revision del borrador.
6. Readiness final equivalente usando datos actuales.
7. Reglas duras, tribunales completos y fechas bloqueadas docentes.
8. Fingerprint de la version oficial activa.
9. Fingerprint de la propuesta reconstruida por servidor.
10. Ausencia de evento previo para plan o candidato.

El cliente puede enviar identificadores y expectativas de concurrencia, pero no debe ser autoridad sobre rol, actor, cronograma, readiness, hashes ni fingerprints.

## Transaccion propuesta

```sql
-- BORRADOR DE DISENO. NO EJECUTAR COMO MIGRACION.
begin;

-- Clave estable derivada de institution_id + workspace_key.
perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));

-- Leer version activa y bloquearla durante la transaccion.
select *
from public.official_exam_schedule_versions
where institution_id = p_institution_id
  and workspace_key = p_workspace_key
  and status = 'ACTIVE'
for update;

-- Revalidar autorizacion, cadena administrativa, hashes, readiness,
-- reglas duras, fechas bloqueadas, ultima revision e idempotencia.

-- Marcar la version previa como SUPERSEDED dentro de la misma transaccion.
-- Insertar la nueva version ACTIVE.
-- Insertar ADMIN_REVIEW_OFFICIALIZATION_EVENT append-only.

commit;
```

Una excepcion en cualquier revalidacion o escritura produce `ROLLBACK`. El orden concreto de insercion debe evitar una dependencia circular entre evento y version; puede usarse un ID generado previamente por servidor y una FK diferible, o insertar la version con el ID de evento ya reservado dentro de la misma RPC.

## Idempotencia y concurrencia

- Idempotencia primaria: `planId`; defensa adicional: `candidateId`.
- El servidor genera `officializationId` y `versionId`. No acepta IDs autoritativos del cliente.
- El lock transaccional se toma por `institutionId + workspaceKey`, no globalmente.
- La version activa se lee con `FOR UPDATE` y su fingerprint debe coincidir con `currentOfficialScheduleFingerprint` del plan.
- Si otro proceso oficializa primero, cambia la version activa o aparece una revision posterior, la RPC rechaza la operacion.
- Repetir el mismo request debe devolver el evento existente o un error idempotente estable; nunca crear dos versiones.
- La restriccion parcial de una unica version activa actua como ultima barrera ante carreras.

## Seguridad y RLS

- La `service_role` vive solo como secret de la Edge Function.
- El endpoint exige JWT valido y obtiene `userId` desde el token.
- La autorizacion se consulta en base de datos; no se confia en `role` enviado por cliente.
- La RPC se revoca para `anon` y `authenticated`, y se concede solo a `service_role`.
- Las tablas permiten lectura segun membresia institucional. Las escrituras directas de cliente quedan denegadas.
- Los eventos no admiten update/delete ni siquiera mediante el flujo normal de aplicacion.
- Los diagnostics exponen codigos, conteos y presencia de datos, nunca schedules completos, tokens ni hashes privados adicionales.

## Compatibilidad y activacion gradual

1. Crear migracion revisable para las dos tablas, constraints, indices, RLS y RPC.
2. Implementar la accion autenticada en `admin-users` y pruebas locales transaccionales.
3. Ejecutar en modo dry-run: revalidar y devolver el contrato sin escribir.
4. Habilitar escritura de evento/version detras de una feature flag server-side.
5. Mantener `workspaceSnapshot.cronograma` como lectura legacy durante la transicion.
6. En un corte posterior, hacer que consumidores oficiales lean la version `ACTIVE`; no sincronizar el snapshot mediante overwrite dentro de la RPC.

No debe agregarse un boton de oficializacion hasta completar las fases 1 a 3 y validar rollback, concurrencia y RLS contra Supabase real.

## Riesgos pendientes

- Los eventos administrativos previos siguen siendo JSON mutable dentro del snapshot. La RPC futura debe reconstruirlos y verificarlos, o migrarlos a eventos relacionales inmutables antes de confiar en ellos.
- Debe garantizarse paridad entre la serializacion/hash JavaScript y la implementacion server-side. PostgreSQL no debe recalcular SHA-256 sobre JSON con un orden de claves diferente.
- El primer cronograma oficial puede no tener una version relacional. Hace falta una estrategia explicita de version inicial a partir del snapshot, sin borrar el dato legacy.
- La politica exacta de roles institucionales autorizados debe cerrarse antes de desplegar; el helper usa `superadmin` y `admin_instituto` solo como contrato preparatorio.
- La version oficial en `jsonb` mantiene compatibilidad, pero requerira limites de tamano y validacion de schema.

