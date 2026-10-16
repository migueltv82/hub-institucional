---
name: spec-first-development
description: "Orquesta un flujo Spec First obligatorio antes de implementar funcionalidades nuevas, cambios de comportamiento, refactors con impacto funcional, reglas de negocio, base de datos, APIs, autenticacion, permisos, UI/UX relevante o bugs no triviales. No usar para typos, cambios cosmeticos minimos, consultas sin modificacion ni exploracion pura."
---

# Spec First Development

Convierte una solicitud de cambio relevante en un contrato verificable antes de modificar codigo. Esta skill orquesta el proceso; no reemplaza las skills especializadas ni los gates del repositorio.

## Activacion y limites

Usar el flujo completo cuando la tarea incluya al menos uno de estos casos:

- una funcionalidad nueva o una modificacion de comportamiento;
- un refactor que pueda alterar comportamiento observable;
- reglas de negocio;
- base de datos, APIs, autenticacion, autorizacion o permisos;
- UI/UX relevante;
- un bug no trivial.

No activar esta skill para correcciones tipograficas, cambios cosmeticos minimos, consultas sobre el codigo sin cambios o tareas puramente exploratorias.

Se puede usar el modo lightweight solo si el cambio es claramente trivial, tiene riesgo minimo de regresion y no afecta reglas de negocio, datos, permisos ni APIs publicas. Si existe duda, usar el flujo completo.

## Flujo obligatorio

Seguir este orden y no modificar codigo de aplicacion antes de completar SPEC y PLAN:

`UNDERSTAND -> SPEC -> ACCEPTANCE CRITERIA -> PLAN -> IMPLEMENT -> VERIFY -> REVIEW -> COMPARE AGAINST SPEC`

### 1. UNDERSTAND

Antes de escribir la especificacion:

1. Leer `AGENTS.md`, las instrucciones aplicables al repositorio y los archivos de restricciones o arquitectura que esas instrucciones indiquen.
2. Inspeccionar el codigo real, la arquitectura existente y los scripts disponibles; no inferir el funcionamiento solo por el pedido.
3. Identificar componentes, dependencias, contratos, reglas de negocio y datos afectados.
4. Identificar posibles regresiones y requisitos de seguridad, rendimiento, accesibilidad y UX.
5. Registrar supuestos. Pedir aclaracion solo si una decision faltante cambia materialmente el alcance o el resultado; no inventar requisitos.

### 2. SPEC

Crear o actualizar `specs/<feature>.md`, con un nombre breve en kebab-case y estable. Si ya existe una especificacion para el mismo comportamiento, actualizarla en vez de duplicarla.

La especificacion debe contener, adaptadas al cambio:

```markdown
# Objetivo
# Problema que resuelve
# Alcance
# Fuera de alcance
# Comportamiento esperado
# Reglas de negocio
# Estados y transiciones
# Entradas
# Salidas
# Casos de error
# Casos limite
# Seguridad y permisos
# Requisitos de UX/UI
# Impacto en datos / base de datos
# Compatibilidad hacia atras
# Criterios de aceptacion
```

Marcar una seccion como `No aplica` con una razon breve cuando corresponda; no inventar contenido. En esta etapa no implementar.

### 3. ACCEPTANCE CRITERIA

Escribir criterios observables y verificables, con identificadores estables:

```markdown
### AC-01 - <resultado observable>
Given <precondicion>
When <accion o evento>
Then <resultado verificable>

Verificacion: <test automatizado, verificacion estatica, inspeccion funcional o combinacion explicita>
```

Cubrir caminos exitosos, errores relevantes, permisos y casos limite que pertenezcan al alcance. Cada criterio debe poder producir evidencia concreta.

### 4. PLAN

Agregar a la especificacion una seccion `# Plan tecnico` antes de implementar. Incluir:

- archivos a crear y modificar;
- componentes y contratos afectados;
- cambios de datos, base de datos, tipos/interfaces y APIs;
- estrategia de tests y evidencia esperada por criterio;
- riesgos y regresiones posibles;
- estrategia de rollback cuando corresponda;
- skills especializadas que deben aplicarse segun el alcance.

Mantener el plan acotado a la spec. No agregar refactors, dependencias ni cambios arquitectonicos no necesarios; justificar cualquier excepcion antes de hacerla.

### 5. IMPLEMENT

Implementar solamente despues de completar la spec y el plan:

- hacer cambios pequenos y enfocados;
- respetar la arquitectura y convenciones existentes;
- evitar duplicacion y abstracciones innecesarias;
- mantener el nivel de tipado que exige el proyecto;
- preservar compatibilidad salvo que la spec autorice expresamente romperla;
- actualizar la spec primero si aparece un requisito nuevo o cambia una decision material.

No modificar la rama principal directamente cuando el repositorio use un flujo por pull request. Usar una rama de feature/fix y no hacer merge automatico. No crear ramas, commits o PR salvo que el pedido y el flujo del repositorio lo autoricen.

### 6. VERIFY

Detectar los comandos reales en `package.json` y en la configuracion del proyecto. Ejecutar los tests especificos del cambio y, cuando existan y correspondan, lint, typecheck, suite completa y build.

Si una comprobacion falla:

1. mostrar el fallo sin ocultarlo;
2. investigar si fue introducido o afectado por el cambio;
3. corregir los problemas dentro del alcance;
4. repetir la comprobacion;
5. informar explicitamente cualquier check inexistente o bloqueo externo.

No declarar completado un cambio con una verificacion obligatoria fallando. No debilitar tests, restricciones, auditorias o configuraciones para obtener verde.

### 7. REVIEW

Revisar criticamente el diff completo y el codigo relacionado. Aplicar los revisores o skills exigidos por el repositorio. Buscar como minimo:

- bugs, regresiones, null/undefined y manejo incorrecto de estado;
- seguridad, autenticacion, autorizacion y permisos;
- perdida o corrupcion de datos, fallos parciales y race conditions;
- duplicacion, codigo muerto y mantenibilidad;
- consultas o renders innecesarios, N+1, payloads y rendimiento;
- accesibilidad e inconsistencias de UX.

Los hallazgos P0/P1 introducidos por el cambio bloquean la finalizacion hasta corregirlos y repetir la revision.

### 8. COMPARE AGAINST SPEC

Revisar cada criterio y publicar evidencia, sin marcar PASS por intencion o por compilacion solamente:

| Criterio | Estado | Evidencia |
|----------|--------|-----------|
| AC-01 | PASS/FAIL | test, verificacion estatica o inspeccion funcional concreta |

La tarea solo esta completa si todos los criterios estan `PASS` y los gates obligatorios del repositorio estan satisfechos. El informe final debe conservar el formato y estado de quality gate exigidos por `AGENTS.md` o documentos equivalentes.

## Modo lightweight

Para cambios que cumplan todas las condiciones de trivialidad, usar:

`UNDERSTAND -> MINI-SPEC -> IMPLEMENT -> VERIFY`

La mini-spec puede vivir en el plan de trabajo de la tarea y debe declarar objetivo, archivos afectados, resultado esperado y verificacion. Si durante la inspeccion aparece impacto funcional, de datos, permisos, API o riesgo relevante, abandonar este modo y crear `specs/<feature>.md` con el flujo completo.

## Integracion con otras skills

Esta skill decide el orden y conserva la trazabilidad entre necesidad, implementacion y evidencia. Usar ademas las skills especializadas disponibles cuando el alcance lo requiera, especialmente testing, seguridad, Supabase/PostgreSQL, API, frontend, accesibilidad, rendimiento, observabilidad, debugging y code review. Si una instruccion especializada o un gate del repositorio es mas estricto, prevalece el requisito mas estricto.

No asumir que usar Spec First concede permiso para desplegar, cambiar produccion, aplicar migraciones, modificar datos reales, secretos, Auth o RLS. Esas acciones conservan sus autorizaciones propias.
