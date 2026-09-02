# Control de horas de desarrollo

Este documento sirve como referencia interna para estimar las horas trabajadas en el proyecto y tener una base al momento de presupuestar o cobrar.

No es una ficha exacta de reloj. La estimacion se armo a partir del historial de commits, las fechas de trabajo, el alcance implementado y las tareas recientes pendientes de commit.

## Resumen

- Proyecto: Institutional Hub / Generador de cronogramas
- Primer archivo registrado en Git: 20/04/2026
- Fecha de corte: 14/05/2026
- Periodo estimado: 20/04/2026 al 14/05/2026
- Total estimado facturable: 71 horas
- Rango razonable de referencia: 60 a 82 horas

## Criterio usado

Las horas se agruparon por jornadas y por entregables. Se considero tiempo de:

- Desarrollo frontend.
- Integracion con Supabase.
- Seguridad, RLS, RPCs y Edge Functions.
- Modulos de Super Admin, alumnos y docentes.
- Carga, parsing y exportacion de planillas.
- Ajustes visuales y experiencia de usuario.
- Pruebas, correcciones y documentacion.
- Limpieza de archivos reemplazados.

## Detalle por fecha

| Fecha | Trabajo principal | Horas estimadas |
|---|---|---:|
| 20/04/2026 | Creacion inicial del proyecto, estructura base, primeras pantallas, pruebas con login/backend y cambios iniciales de arquitectura. | 7.5 |
| 21/04/2026 | Mejoras visuales, base del generador, carga de archivos y primeros pasos de persistencia/base de datos. | 5 |
| 22/04/2026 | Conexion con Supabase, inicio de multi-tenant, autenticacion, gestion de usuarios, instituciones y Super Admin. | 8.5 |
| 24/04/2026 | Mejoras del dashboard, paginacion, usuarios, blanqueo de contrasenas, SQL multi-tenant y Edge Function. | 7 |
| 27/04/2026 | Seguridad, escalabilidad, RLS/RPCs, mejoras de calidad y ajustes en funciones administrativas. | 5 |
| 28/04/2026 | Reorganizacion del proyecto, separacion de componentes, hooks, tests y estructura del generador de cronogramas. | 7.5 |
| 07/05/2026 | Nueva base de datos conectada, ajustes remotos, ordenamiento de scripts y cambios visuales. | 4 |
| 08/05/2026 | Preparacion demo/PWA, assets, service worker, guias y mejoras en flujo de trabajo. | 4.5 |
| 09/05/2026 | Refactorizacion grande, documentacion, modulo alumnos, autenticacion, permisos y mejoras del generador. | 9 |
| 11/05/2026 | Dashboard de alumnos, rutas, error boundary, accesos de alumnos y ajustes en Supabase/Auth. | 6 |
| 12/05/2026 | Carga de materias y ajustes del portal del estudiante. | 4 |
| 13/05/2026 - 14/05/2026 | Modulo docentes, alta/listado/edicion/borrado de alumnos y docentes, dashboard docente, UI, README y consolidacion de scripts Supabase. | 8 |

## Total

| Concepto | Horas |
|---|---:|
| Total estimado | 71 |
| Margen conservador | 60 |
| Margen alto razonable | 82 |

## Distribucion por modulo

| Area | Horas estimadas |
|---|---:|
| Base del proyecto y generador de cronogramas | 14 |
| Supabase, multi-tenant, Auth, RLS y Edge Functions | 18 |
| Super Admin e instituciones | 8 |
| Modulo alumnos | 11 |
| Modulo docentes | 7 |
| UI, dashboard, responsive y ajustes visuales | 6 |
| Tests, documentacion y limpieza | 7 |

Total por area: 71 horas.

## Nota para facturacion

Para una liquidacion simple, se puede usar:

```text
Total a cobrar = 71 horas x valor hora
```

Si se quiere cobrar con criterio conservador:

```text
Total conservador = 60 horas x valor hora
```

Si se quiere contemplar investigacion, pruebas, retrabajo y ajustes fuera de alcance:

```text
Total completo = 82 horas x valor hora
```

## Observaciones

- El historial Git arranca el 20/04/2026.
- Hay trabajo no commiteado al momento de armar este documento, especialmente el modulo docentes, mejoras del dashboard, README y consolidacion de scripts Supabase.
- Las horas incluyen tiempo de analisis, implementacion, pruebas y correccion.
- Este archivo puede actualizarse al cerrar cada nueva etapa del proyecto.
