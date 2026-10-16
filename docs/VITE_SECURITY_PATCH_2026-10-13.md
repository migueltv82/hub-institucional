# Vite security patch - 2026-10-13

PARCHE VITE - PASS LOCAL. QUALITY GATE: FAIL global por otras dependencias.

package.json fija Vite8.0.16; package-lock.json actualizado coherentemente. Cambio8.0.9->8.0.16 minimo patch corregido para GHSA-v6wh-96g9-6wx3/GHSA-fx2h-pf6j-xcff. Node24.12.0 compatible con engines ^20.19.0||>=22.12.0; npm ls vite PASS sin conflictos de peers.

Fuente/changelog: https://raw.githubusercontent.com/vitejs/vite/v8.0.16/packages/vite/CHANGELOG.md. Confirma rechazo UNC y rutas Windows alternativas y actualizaciones requeridas de Rolldown. No saltos minor/major de Vite, no npm audit fix --force ni ajustes de gates.

Lock:25 paquetes cambiados, todos dependencias de Vite/PostCSS/Rolldown. Rolldown/bindings1.0.0-rc.16->1.0.3, pluginutils1.0.1; oxc/types0.133.0; emnapi1.10.0; tinyglobby0.2.17; PostCSS8.5.30; nanoid3.3.20; source-map-js1.2.2. Registros npm oficiales con integridad SHA512. No otros paquetes directos actualizados.

Validacion: audit:repo PASS; lint PASS; suite2381 tests/291 archivos PASS; build/audit:prod PASS(114 archivos); servidor nuevo loopback temporal index/JSX HTTP200 y proceso de prueba detenido; CHIEF CODE AUDITOR CodeReview/Adversarial PASS sin hallazgos introducidos. Typecheck NO DISPONIBLE; Browser/E2E NO APLICA(interfaz intacta, smokeHTTP del tooling); Database/RLS NO APLICA; Security del cambio PASS; Performance NO APLICA. No se reproducen ataques UNC externos.

npm audit posterior:20 vulnerabilidades(9high/10moderate/1low), antes24(13high). Vite, PostCSS, nanoid y source-map-js ya no figuran vulnerables. Otros9high siguen abiertos: no release, no DR/fixtures mientras gate rojo.

Riesgo residual: npm aviso cleanup EPERM de antigua DLL en directorio temporal node_modules/@rolldown/.binding-win32-x64-msvc-zNiDIVSs. Nueva binding1.0.3 instalada y smoke/tests/build verdes. No se matan procesos ajenos ni se acredita eliminacion de DLL bloqueada. No cambios de runtime app/config/SQL/secret/deploy. Staging/Production/commit/push=NONE.

QUALITY GATE: FAIL
