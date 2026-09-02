# Project Structure

Este documento marca donde vive cada responsabilidad. La idea es evitar carpetas duplicadas y que cada cambio tenga un lugar natural.

## Raiz

```text
package.json        scripts, dependencias y comandos de operacion
vite.config.js      config de Vite, React, Tailwind y particion de chunks
vitest.config.js    config de tests
eslint.config.js    reglas de lint
vercel.json         rewrite SPA y headers de seguridad para deploy
index.html          shell HTML de Vite
.env.example        variables esperadas para desarrollo
```

## `src/`

### Entrada de la app

- `src/main.jsx`: monta React y providers globales.
- `src/App.jsx`: define rutas publicas, rutas protegidas y lazy loading de paginas.
- `src/lib/envGuards.js`: bloquea variables publicas peligrosas al iniciar.

### Autenticacion y permisos

- `src/auth/AuthContext.jsx`: sesion, usuario actual, modo remoto/local y rol superadmin.
- `src/components/ProtectedSuperAdminRoute.jsx`: protege rutas de administracion.

### Paginas

- `src/pages/LoginPage.jsx`: login y seleccion de modo.
- `src/pages/DashboardPage.jsx`: workspace principal del usuario institucional.
- `src/pages/SuperAdminLayout.jsx`: layout del panel de gobierno.
- `src/pages/SuperAdminOverviewPage.jsx`: resumen operativo.
- `src/pages/SuperAdminInstitutionsPage.jsx`: administracion de instituciones.
- `src/pages/SuperAdminUsersPage.jsx`: administracion de usuarios y accesos.

### Generador de cronogramas

La implementacion activa vive en:

```text
src/components/GeneradorCronograma.jsx
src/components/generadorCronograma/
```

Responsabilidades:

- `GeneradorCronograma.jsx`: orquesta hooks, estado y componentes del flujo.
- `generadorCronograma/config.js`: definiciones de archivos, estado inicial y metadatos.
- `generadorCronograma/derivedState.js`: estado derivado para UI.
- `generadorCronograma/helpers.js`: helpers chicos de vista y formato.
- `generadorCronograma/*Section.jsx`: secciones visuales del flujo.
- `generadorCronograma/CronogramaTable.jsx`: tabla de resultados.
- `generadorCronograma/ManualEditPanel.jsx`: edicion manual de una mesa.

La carpeta duplicada `src/components/cronograma/` fue retirada porque ya no estaba importada.

### Hooks

- `src/hooks/useCronogramaFiles.js`: carga, parseo, limpieza y persistencia de archivos fuente.
- `src/hooks/useCronogramaGeneration.js`: generacion, reinicio y confirmacion de mesas.
- `src/hooks/useManualMesaEditing.js`: edicion manual de mesas.
- `src/hooks/useWorkspacePersistence.js`: hidratacion y autosave del workspace por institucion.
- `src/hooks/useCronogramaExports.js`: exportaciones XLSX, PNG y texto.
- `src/hooks/usePaginatedInstitutions.js`: instituciones paginadas con cache.
- `src/hooks/usePaginatedUsers.js`: usuarios paginados con cache.
- `src/hooks/useSuperAdminSummary.js`: metricas del panel superadmin.

### Servicios

Todo acceso externo o persistencia va aca:

- `src/services/auth.js`: login y datos de sesion.
- `src/services/institutions.js`: instituciones accesibles y seleccion activa.
- `src/services/superAdmin.js`: operaciones del panel superadmin.
- `src/services/workspaceSnapshot.js`: guardado/carga del snapshot del workspace.
- `src/services/sourceFiles.js`: archivos fuente persistidos.

Regla: los componentes no deberian hablar directo con Supabase; deben pasar por `services/`.

### Utilidades

- `src/utils/cronogramaInteligente.js`: motor de generacion de cronograma.
- `src/utils/parseCSV.js`: parseo de CSV, XLSX y DOCX.

Regla: si una funcion contiene logica de negocio testeable, preferir `utils/` o `hooks/` antes que esconderla dentro de JSX.

### Tests

Los tests viven junto al modulo que validan:

```text
*.test.js
*.test.jsx
src/test/setup.js
```

La suite actual cubre motor, parseo, hooks criticos, persistencia, archivos fuente y ruta protegida de superadmin.

## `supabase/`

- `setup_multi_tenant/`: SQL principal para tablas, RLS, RPCs, indices y seeds.
- `functions/admin-users/`: Edge Function que usa `service_role` del lado servidor.
- `security/`: pruebas negativas de RLS, RPCs y Storage.
- `docs/`: documentacion operativa de despliegue.
- `config/`: configuracion local de funciones Supabase.

Los archivos fuente del workspace se guardan en el bucket privado `workspace-source-files`;
la tabla `workspace_source_files` queda como indice de metadata.

Regla: nunca exponer `service_role` en frontend ni en variables `VITE_*`.

## `docs/`

- `RUNBOOK.md`: operaciones diarias y diagnostico.
- `SECURITY.md`: modelo de seguridad, checklist y riesgos residuales.
- `TESTING_CHECKLIST.md`: prueba manual de punta a punta.
- `WORKLOG.md`: registro de trabajo y estimacion.
- `PROJECT_STRUCTURE.md`: este mapa.

## Convenciones

- Mantener componentes de UI pequenos y sin llamadas directas a red.
- Mantener reglas de negocio testeables fuera del JSX.
- Agregar tests cuando se toque motor, persistencia, parseo, roles o exportaciones.
- Usar rutas relativas en documentacion; no rutas absolutas de una PC.
- Evitar carpetas duplicadas para el mismo modulo.
