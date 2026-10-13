// Generates SELECT-only verification SQL; never connects, deploys or mutates.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const files = ['01_foundation', '02_academic_relational_schema', '03_workspace_data',
  '04_teacher_exam_date_exclusions', '05_workspace_operational_compat',
  '06_subject_teacher_assignments', '07_academic_operations', '08_exam_tables',
  '05_student_portal_secure_read'];

export function extractCanonicalTables(sources) {
  // SQL identifiers include digits: do not truncate exam_engine_v21_states.
  return [...new Set(sources.flatMap((source) => [...source.matchAll(
    /create\s+table\s+if\s+not\s+exists\s+public\.([a-z_][a-z0-9_]*)\b/gi,
  )].map((match) => match[1])))].sort();
}

export function buildCountsQuery(tables) {
  if (!tables.length || tables.some((table) => !/^[a-z_][a-z0-9_]*$/i.test(table))) {
    throw new Error('Invalid or empty canonical table inventory');
  }
  const counts = tables.map((table) => `SELECT '${table}' AS table_name, count(*) AS rows FROM public.${table}`).join(' UNION ALL ');
  return `BEGIN READ ONLY; SELECT jsonb_agg(to_jsonb(c) ORDER BY table_name) AS counts FROM (${counts}) c; COMMIT;`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sources = files.map((file) => readFileSync(new URL(`../schema/${file}.sql`, import.meta.url), 'utf8'));
  const tables = extractCanonicalTables(sources);
  process.stdout.write(`${buildCountsQuery(tables)}\n`);
}
