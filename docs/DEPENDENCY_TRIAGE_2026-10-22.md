# DEP.2 — triage y parche acotado de Vite

2026-10-22. Base funcional: 09281ea (GATE.C2a). No se modifica EX-001 ni el nivel de auditoría.

## Problema y cambio

La verificación actual encontró 1 high y 7 moderate. Vite estaba fijado en 8.0.16; su grupo incluía avisos de launch-editor y del servidor de desarrollo. Se actualiza exclusivamente la dependencia directa Vite a **8.3.5**, conservando versión exacta.

Compatibilidad declarada de Vite 8.3.5: Node `^20.19.0 || >=22.12.0`; CI usa 22.13.0 y la prueba local Node24.12.0. Los rangos de @vitejs/plugin-react y @tailwindcss/vite resuelven la misma versión. Vitest4.1.5 y demás dependencias directas permanecen iguales.

El lock generado cambia las transitivas de Vite: Rolldown1.0.3→1.2.15 y bindings por plataforma, tipos OXC, picomatch y LightningCSS privado. No se editó el lock a mano, no se usó --force, no se añadieron overrides ni se bajaron versiones de Mammoth/ExcelJS.

npm11.4.2 falló internamente en Arborist `edgesOut`, sin modificar package.json/lock. La resolución se ejecutó con npm11.21.1 temporal, sin instalación global. La auditoría automática de esa instalación se evitó por su consulta bloqueada; la auditoría de seguridad del producto se ejecutó por separado y sigue formando parte de quality:full.

## Auditoría posterior

`npm audit --audit-level=high --fetch-retries=0 --fetch-timeout=30000`: **PASS**, exit0; **0 high, 0 critical, 7 moderate**. Los parámetros de red acotan la espera, sin alterar severidad ni excepciones.

Pendientes moderate inventariados, sin ocultarlos:

| Ruta | Advisory | Siguiente unidad |
|---|---|---|
| Vitest / @vitest/mocker (dev/test) | GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8 | Actualización compatible separada y regresión del entorno de pruebas |
| Mammoth / argparse / sprintf-js | GHSA-hp3w-g68c-fv3c | Evaluar alcance en lectura DOCX y solución mantenida; no aceptar downgrade mayor automático |
| ExcelJS / uuid | GHSA-w5hq-g745-h8pq | Revisar uso real del buffer y actualización compatible; no aceptar downgrade automático |

## Fuentes primarias

- [Release oficial de Vite8.3.5](https://github.com/vitejs/vite/releases/tag/v8.3.5)
- [Aviso oficial sobre middleware de desarrollo](https://github.com/vitejs/vite/security/advisories/GHSA-9jrq-w75r-8gcw)
- [Aviso launch-editor: escape de argumentos](https://github.com/advisories/GHSA-698v-4r3x-3vcv)
- [Aviso launch-editor: flags de editor](https://github.com/advisories/GHSA-r825-w8mm-5pxw)
- [Aviso launch-editor: rutas Windows](https://github.com/advisories/GHSA-587h-7wmj-h5pm)
- [Aviso Vite: server.fs.allow](https://github.com/advisories/GHSA-rq7h-c2jc-7f22)

## Validación final de la rama integrada

quality:full exit0: 362 archivos/2784 tests, lint, auditoría del repositorio, compilación y auditoría del bundle PASS (114 archivos). Tiempo de build1.58s en este entorno, sin afirmar mejora de rendimiento. VITEST_MAX_WORKERS=4; parámetros de red acotados, sin cambiar assertions ni timeouts de pruebas. Navegador integral repetido con Vite8.3.5: PASS; alumno/docente/admin, aislamiento, inscripciones y cancelaciones, notas/asistencia, PB.4 sin drift, limpieza completa sin errores. Revisión independiente del diff y lock: PASS.

Typecheck NO DISPONIBLE (JS/JSX). Database/RLS: sin cambios; denegaciones de institución/rol cubiertas por el recorrido y el ensayo HTTP. CI/CodeQL remoto se comprueba después del push. Advertencias:7 moderate inventariadas y tamaño de bundle. Nada de este parche implica despliegue ni acceso a Producción.

**QUALITY GATE: PASS WITH WARNINGS** en el alcance local de DEP.2.
