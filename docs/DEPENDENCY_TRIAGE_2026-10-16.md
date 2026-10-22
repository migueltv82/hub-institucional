# Dependency triage — 2026-10-16 (EX-001)

Tarjeta: [CODEX] EX-001 (https://trello.com/c/aoWt2SaR). La ejecutó Claude mientras Codex no estaba disponible; la auditoría cruzada queda para Codex. Base: `release/v1`. Sin actualización de paquetes, sin `npm audit fix` y sin cambios en `CONSTRAINTS.md`.

## Resultado

| Comando | Resultado |
| --- | --- |
| `npm audit --json` | 10 paquetes: **0 critical, 0 high**, 9 moderate, 1 low |
| `npm run quality:deps` (`npm audit --audit-level=high`, el mismo del workflow manual `Dependency Audit`) | **exit 0** |

Comparado con el triage del 2026-10-13 (`DEPENDENCY_TRIAGE_2026-10-13.md`): 24 → 10 paquetes y 13 → 0 high. No apareció ningún high/critical nuevo: no hay P1.

## Inventario restante

"Runtime prod" indica si el código llega al bundle del navegador y si la app usa la parte afectada.

| Paquete | Sev. | Ruta | Fix compatible | Runtime prod | Explotabilidad en esta app |
| --- | --- | --- | --- | --- | --- |
| @babel/core | low | eslint-plugin-react-hooks → @babel/core | Sí, dentro del rango | No (lint) | Solo herramientas de desarrollo |
| vitest | moderate | directa (dev) | Sí, dentro del rango `^4.1.5` | No (tests) | Solo desarrollo/CI |
| @vitest/mocker | moderate | vitest → @vitest/mocker | Sí, con vitest | No | Solo desarrollo/CI |
| dompurify | moderate | jspdf → dompurify | Sí, dentro del rango | En el bundle, código no alcanzado | jspdf la usa solo en `doc.html()`; `src/` no llama a `.html()` ni a `addHTML` |
| fflate | moderate | jspdf → fflate | Sí, dentro del rango | En el bundle, código no alcanzado | El advisory es sobre `unzipSync` con ZIP64 malformado; jspdf solo comprime y `src/` no importa fflate |
| uuid | moderate | exceljs → uuid (override ya presente) | No: npm propone exceljs 3.4.0 (downgrade major) | En el bundle | El advisory afecta v3/v5/v6 con `buf`; exceljs usa `v4()` sin buffer |
| mammoth | moderate | directa | No: npm propone 0.3.29 (downgrade major) | Sí (`src/utils/parseCSV.js`, lectura de .docx) | Se marca solo por arrastrar argparse/sprintf-js (abajo) |
| argparse | moderate | mammoth → argparse@1.0.10 | No (vía mammoth) | No: es el parser de la CLI de mammoth, que el navegador no ejecuta | No alcanzable |
| sprintf-js | moderate | mammoth → argparse → sprintf-js | No (vía mammoth) | No: solo lo usa argparse | No alcanzable |
| argparse@2.0.1 (eslint → js-yaml) | — | sin advisory | — | — | — |

## Recomendación de salida (no aplicada)

**(a) Cerrar EX-001.** La excepción dice "Dependency audit currently fails", y hoy `quality:deps` pasa: la condición que la justificaba ya no existe. Mantenerla abierta solo agregaría una fecha de vencimiento sin propósito.

Los moderate/low quedan como deuda no bloqueante, sin excepción formal, porque el gate del proyecto es `--audit-level=high`. Para reducirlos se propone una tarjeta aparte: `npm update` dentro de rangos para dompurify, fflate, vitest y @babel/core, con `quality:full`. mammoth y exceljs no tienen fix compatible: quedan en seguimiento hasta que publiquen versiones nuevas.

Si Miguel prefiere (b), renovar EX-001 acotada: alcance "solo los 9 moderate + 1 low de esta tabla; cualquier high/critical nuevo invalida la excepción", con vencimiento 2026-11-30.

Aplicar la salida elegida en `CONSTRAINTS.md` queda **pendiente de aprobación de Miguel** (tarjeta [HUMANO]).

## Actualización DEP.1 (mismo día)

Updates semver-compatibles con `npm update <paquete>` (npm 10.9.4, el mismo de CI), sin `--force`, sin overrides nuevos y sin tocar `package.json`:

| Paquete | Antes | Después |
| --- | --- | --- |
| dompurify (vía jspdf) | 3.4.3 | 3.4.17 |
| fflate (vía jspdf) | 0.8.2 | 0.8.3 |
| @babel/core y familia @babel/* (dev, vía eslint-plugin-react-hooks) | 7.29.0 | 7.29.7–7.29.10 |
| Transitivas de browserslist (baseline-browser-mapping, electron-to-chromium, node-releases) | — | patch |

`npm audit`: **10 → 7** (0 critical, 0 high, 7 moderate, 0 low). Quedan:
- vitest y @vitest/mocker (dev);
- mammoth, argparse y sprintf-js (sin fix compatible);
- exceljs y uuid (sin fix compatible).

**vitest no se pudo actualizar.** `npm update vitest` y `npm install -D vitest@^4.1.12` abortan con un error interno de npm 10 (`TypeError: Cannot read properties of null (reading 'edgesOut')` en `@npmcli/arborist` `#loadPeerSet`). npm 11 no crashea, pero tampoco sube la versión, y reescribe el lockfile con otro formato; se descartó para no desalinear con el `npm ci` de CI (npm 10). Es una dependencia solo de desarrollo y el advisory exige un servidor de Vitest expuesto. Queda como deuda no bloqueante.

Verificación: un PDF comprimido generado con jspdf (FlateDecode vía fflate 0.8.3) se emite bien, y `quality:full` pasa (ver WORKLOG).
