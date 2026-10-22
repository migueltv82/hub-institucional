# Ítem 4 · Reauditoría liviana de fechas Excel

Base: release/v1, 0bc6640; correctivo 37961e4. Fecha: 2026-10-21. Codex, único revisor.
**Veredicto: PASS WITH WARNINGS.** El P1 de fechas nativas de Excel queda cerrado en este alcance.

- Diff 37961e4..HEAD: el parser y sus tests de fechas no cambiaron; los cambios del servicio posteriores corresponden a reintentos/concurrencia.
- `vitest run src/services/bulkRosterSheetDates.test.js src/services/bulkRoster.test.js`: 2 archivos / 11 tests PASS.
- El test de ExcelJS serializa un XLSX y usa `parseTemplateV2TeachersWorkbook` real: Date vencida/futura se omiten; la vigente se conserva.
- Calendarios imposibles, Date inválido y texto no fecha se rechazan con VIGENCIA_INVALIDA; Date usa getters UTC. Serial Excel, ISO con hora y DD/MM/AAAA cubiertos.
- La comprobación independiente UTC/Buenos Aires y el control negativo ya constan en la reauditoría del ítem 15 de BULK_ROSTER_INDEPENDENT_AUDIT.md; no se repitieron.

## P3 heredado · Sufijos ISO inválidos aceptados
Archivo: `src/services/bulkRoster.js:75–76`; parser idéntico al que ya se reprodujo en el informe anterior.
1. `parseSheetDate('2026-10-21Tbasura')` o `parseSheetDate('2026-10-21 texto')` conserva el prefijo calendario.
2. Ambos devuelven `2026-10-21` en vez de rechazar el texto completo.
3. Como vigencia_hasta y con today=21/10/2026, el builder admite la fila; no reabre el P1 de Date nativa.
Propuesta: validar el formato ISO completo antes de extraer la fecha, con tests negativos del sufijo. No se corrigió implementación.

Límites: auditoría del filtro de importación; no certifica SQL, permisos, deploy ni los ítems 1–3. Solo pruebas locales, sin check completo ni revisores adicionales.
Solo se versionan este informe y una línea de WORKLOG. **QUALITY GATE: PASS WITH WARNINGS.**
