import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// RB.2b (R4b del runbook): apunta el COPY de un `pg_restore --data-only --table=<t> --file=...` a la tabla temporal
// pg_temp.repair_<t>. Trabaja sobre bytes: solo reemplaza el encabezado ASCII del COPY y deja los datos intactos
// (UTF-8, tabs, saltos de linea), cosa que Get-Content/Set-Content de PowerShell 5.1 no garantiza.
// Uso: node scripts/retargetRepairCopy.mjs <repair_<t>.sql> <t>

export function retargetCopyBuffer(buffer, table) {
  assert.match(table, /^[a-z_][a-z0-9_]*$/, 'Nombre de tabla invalido');
  const header = Buffer.from(`COPY public.${table} `, 'ascii');
  const replacement = Buffer.from(`COPY pg_temp.repair_${table} `, 'ascii');
  const matches = [];
  for (let index = buffer.indexOf(header); index >= 0; index = buffer.indexOf(header, index + 1)) {
    if (index === 0 || buffer[index - 1] === 0x0a) matches.push(index);
  }
  assert.equal(matches.length, 1, `Se esperaba exactamente un COPY public.${table} al inicio de linea`);
  return Buffer.concat([buffer.subarray(0, matches[0]), replacement, buffer.subarray(matches[0] + header.length)]);
}

export function main(argv = process.argv.slice(2)) {
  const [file, table] = argv;
  assert.ok(file && table, 'Uso: node scripts/retargetRepairCopy.mjs <archivo.sql> <tabla>');
  writeFileSync(file, retargetCopyBuffer(readFileSync(file), table));
  console.log(`COPY public.${table} -> pg_temp.repair_${table} en ${file}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
