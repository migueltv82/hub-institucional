import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Smoke post-deploy, solo lectura: nunca escribe, nunca usa service_role.
// Uso: node scripts/smokeCheck.mjs --supabase-url https://REF.supabase.co --anon-key <clave publica> [--frontend-url https://dominio] [--skip storage,edge]
// Tambien acepta SMOKE_SUPABASE_URL, SMOKE_ANON_KEY y SMOKE_FRONTEND_URL.

export const CHECK_IDS = Object.freeze(['auth', 'rest', 'storage', 'edge', 'anonSensitive', 'invalidJwt', 'frontend']);
// Tablas que anon nunca debe poder leer: si devuelven filas, es una fuga.
export const SENSITIVE_TABLES = Object.freeze(['profiles', 'memberships', 'student_records', 'teacher_records', 'student_grades', 'subject_enrollments', 'exam_enrollments', 'admin_audit_logs', 'workspace_snapshots']);
const TIMEOUT_MS = 8000;

export function parseArgs(argv, env = {}) {
  const options = { supabaseUrl: env.SMOKE_SUPABASE_URL, anonKey: env.SMOKE_ANON_KEY, frontendUrl: env.SMOKE_FRONTEND_URL, skip: [] };
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--supabase-url') { options.supabaseUrl = value; i++; }
    else if (flag === '--anon-key') { options.anonKey = value; i++; }
    else if (flag === '--frontend-url') { options.frontendUrl = value; i++; }
    else if (flag === '--skip') { options.skip = String(value ?? '').split(',').map(item => item.trim()).filter(Boolean); i++; }
    else throw new Error(`Argumento desconocido: ${flag}`);
  }
  if (!options.supabaseUrl) throw new Error('Falta --supabase-url');
  if (!options.anonKey) throw new Error('Falta --anon-key');
  const unknown = options.skip.filter(id => !CHECK_IDS.includes(id));
  if (unknown.length) throw new Error(`--skip desconocido: ${unknown.join(',')}`);
  if (!options.frontendUrl && !options.skip.includes('frontend')) options.skip.push('frontend');
  options.supabaseUrl = options.supabaseUrl.replace(/\/+$/, '');
  assertPublicKey(options.anonKey);
  return options;
}

// Rechaza cualquier clave que no sea publica: el smoke corre desde la maquina de un operador.
export function assertPublicKey(key) {
  if (/^sb_secret_/i.test(key)) throw new Error('Clave secreta rechazada: usar la clave publica (anon/publishable)');
  if (/^sb_publishable_/i.test(key)) return;
  const parts = key.split('.');
  if (parts.length !== 3) throw new Error('Clave publica con formato desconocido');
  let role;
  try { role = JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role; } catch { throw new Error('Clave publica ilegible'); }
  if (role !== 'anon') throw new Error(`Clave con rol ${role} rechazada: usar la clave anon`);
}

async function request(fetchImpl, url, { headers = {}, method = 'GET' } = {}) {
  const response = await fetchImpl(url, { method, headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await response.text().catch(() => '');
  return { status: response.status, text };
}

export function buildChecks({ supabaseUrl, anonKey, frontendUrl }, fetchImpl) {
  const apikey = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
  return {
    auth: async () => {
      const { status } = await request(fetchImpl, `${supabaseUrl}/auth/v1/health`, { headers: { apikey: anonKey } });
      return { pass: status === 200, detail: `HTTP ${status}` };
    },
    rest: async () => {
      const { status } = await request(fetchImpl, `${supabaseUrl}/rest/v1/institutions?select=id&limit=1`, { headers: apikey });
      return { pass: status === 200, detail: `HTTP ${status}` };
    },
    storage: async () => {
      const { status } = await request(fetchImpl, `${supabaseUrl}/storage/v1/status`, { headers: apikey });
      return { pass: status === 200, detail: `HTTP ${status}` };
    },
    edge: async () => {
      // 405 confirma que admin-users esta publicada y rechaza GET; 404 = no desplegada.
      const { status } = await request(fetchImpl, `${supabaseUrl}/functions/v1/admin-users`, { headers: apikey });
      return { pass: status === 405, detail: `HTTP ${status} (esperado 405)` };
    },
    anonSensitive: async () => {
      const leaks = [];
      for (const table of SENSITIVE_TABLES) {
        const { status, text } = await request(fetchImpl, `${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, { headers: apikey });
        if (status === 200) {
          let rows;
          try { rows = JSON.parse(text); } catch { rows = null; }
          if (!Array.isArray(rows) || rows.length > 0) leaks.push(table);
        } else if (![401, 403, 404].includes(status)) {
          leaks.push(`${table}:HTTP${status}`);
        }
      }
      return { pass: leaks.length === 0, detail: leaks.length ? `anon ve filas o respuesta inesperada en: ${leaks.join(', ')}` : `${SENSITIVE_TABLES.length} tablas sin filas para anon` };
    },
    invalidJwt: async () => {
      const { status } = await request(fetchImpl, `${supabaseUrl}/rest/v1/institutions?select=id&limit=1`, { headers: { apikey: anonKey, Authorization: 'Bearer invalid.smoke.jwt' } });
      return { pass: status === 401, detail: `HTTP ${status} (esperado 401)` };
    },
    frontend: async () => {
      const base = frontendUrl.replace(/\/+$/, '');
      const page = await request(fetchImpl, `${base}/`);
      if (page.status !== 200 || !/<div id="root"/.test(page.text)) return { pass: false, detail: `HTTP ${page.status}, sin #root` };
      const assets = [...page.text.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1]).slice(0, 5);
      if (assets.length === 0) return { pass: false, detail: 'index.html sin assets /assets/' };
      const failed = [];
      for (const asset of assets) { const { status } = await request(fetchImpl, `${base}${asset}`); if (status !== 200) failed.push(`${asset}:HTTP${status}`); }
      const spa = await request(fetchImpl, `${base}/ruta-inexistente-smoke`);
      if (spa.status !== 200) failed.push(`fallback SPA HTTP${spa.status}`);
      return { pass: failed.length === 0, detail: failed.length ? failed.join(', ') : `index + ${assets.length} assets + fallback SPA OK` };
    },
  };
}

export async function runSmoke(options, fetchImpl = fetch) {
  const checks = buildChecks(options, fetchImpl);
  const started = Date.now();
  const results = {};
  for (const id of CHECK_IDS) {
    if (options.skip.includes(id)) { results[id] = { status: 'SKIPPED' }; continue; }
    try {
      const { pass, detail } = await checks[id]();
      results[id] = { status: pass ? 'PASS' : 'FAIL', detail };
    } catch (error) {
      results[id] = { status: 'FAIL', detail: `${error.name}: ${String(error.message).slice(0, 120)}` };
    }
  }
  const failed = Object.keys(results).filter(id => results[id].status === 'FAIL');
  return {
    target: new URL(options.supabaseUrl).host.replace(/^([a-z0-9]{4})[a-z0-9]+([a-z0-9]{4})\./, '$1…$2.'),
    result: failed.length ? 'FAIL' : 'PASS',
    failed,
    skipped: Object.keys(results).filter(id => results[id].status === 'SKIPPED'),
    durationMs: Date.now() - started,
    checks: results,
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let report;
  try { report = await runSmoke(parseArgs(argv, env)); }
  catch (error) { report = { result: 'FAIL', error: error.message }; }
  console.log(JSON.stringify(report, null, 2));
  if (report.result !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
