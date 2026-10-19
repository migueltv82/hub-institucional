import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SUPABASE_DIR = join(process.cwd(), 'supabase')
const SRC_DIR = join(process.cwd(), 'src')
const ADMIN_USERS_FUNCTION = join(SUPABASE_DIR, 'functions/admin-users/index.ts')
const BASELINE_MANIFEST = join(SUPABASE_DIR, 'baseline/BASELINE_MANIFEST.md')
const BASELINE_READINESS = join(process.cwd(), 'docs/BASELINE_READINESS.md')
function walkFiles(root, predicate, acc = []) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name)
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, acc)
    } else if (predicate(fullPath)) {
      acc.push(fullPath)
    }
  }
  return acc
}

function readText(filePath) {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')
}

function allSqlFiles() {
  return walkFiles(SUPABASE_DIR, (filePath) => filePath.endsWith('.sql'))
}

function allRpcCallerFiles() {
  return [
    ...walkFiles(SRC_DIR, (filePath) => /\.(js|jsx|ts)$/.test(filePath) && !/\.test\./.test(filePath)),
    ADMIN_USERS_FUNCTION,
  ]
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getSqlFunctionNames() {
  const names = new Set()
  const functionPattern = /create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(/ig

  for (const filePath of allSqlFiles()) {
    const source = readText(filePath)
    for (const match of source.matchAll(functionPattern)) {
      names.add(match[1].replace(/^public\./, ''))
    }
  }

  return names
}

function sqlContains(pattern) {
  return allSqlFiles().some((filePath) => pattern.test(readText(filePath)))
}

function getSqlFunctionBlock(functionName) {
  const escapedName = escapeRegExp(functionName)
  const pattern = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${escapedName}\\s*\\(\\s*\\)[\\s\\S]*?\\n\\$\\$;`,
    'i',
  )

  for (const filePath of allSqlFiles()) {
    const source = readText(filePath)
    const match = source.match(pattern)
    if (match) return match[0]
  }

  return ''
}

function extractInvokedRpcContracts() {
  const rpcNames = new Set()
  const directLiteralRpcPattern = /\.rpc\(\s*['"]([^'"]+)['"]/g
  const directIdentifierRpcPattern = /\.rpc\(\s*([A-Z][A-Z0-9_]+)/g
  const constantStringPattern = /(?:const|export const)\s+([A-Z][A-Z0-9_]*(?:RPC|_RPC|RPCS)?)\s*=\s*['"]([^'"]+)['"]/g
  const objectFreezeRpcPattern = /const\s+RPC\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/g
  const objectStringPattern = /:\s*['"]([^'"]+)['"]/g

  for (const filePath of allRpcCallerFiles()) {
    const source = readText(filePath)
    if (!source.includes('.rpc(')) continue

    const constants = new Map()
    for (const match of source.matchAll(constantStringPattern)) {
      constants.set(match[1], match[2])
    }

    for (const match of source.matchAll(directLiteralRpcPattern)) {
      rpcNames.add(match[1])
    }

    for (const match of source.matchAll(directIdentifierRpcPattern)) {
      const resolvedName = constants.get(match[1])
      if (resolvedName) rpcNames.add(resolvedName)
    }

    for (const objectMatch of source.matchAll(objectFreezeRpcPattern)) {
      for (const valueMatch of objectMatch[1].matchAll(objectStringPattern)) {
        rpcNames.add(valueMatch[1])
      }
    }
  }

  return rpcNames
}

const invokedRpcContracts = new Set([
  'academic_admin_confirm_exam_assignment',
  'academic_admin_import_student_history',
  'academic_admin_create_student_career_enrollment',
  'academic_admin_correct_student_career_enrollment',
  'academic_admin_get_student_career_enrollment_history',
  'academic_admin_get_teacher_profile_link_candidates',
  'academic_admin_invalidate_student_career_enrollment',
  'academic_admin_link_teacher_record_profile',
  'academic_admin_reset_exam_process',
  'academic_create_teacher_subject_leave',
  'academic_enroll_first_year_student',
  'academic_enroll_student_in_course_offering',
  'academic_get_student_course_enrollment_preview',
  'academic_get_student_portal_grades',
  'academic_get_student_subject_teacher_notices',
  'academic_get_teacher_course_roster_preview',
  'academic_get_teacher_subject_rosters',
  'academic_reconcile_expired_exam_confirmations',
  'academic_resolve_member_profile_by_email',
  'academic_teacher_confirm_exam_assignment',
  'academic_teacher_create_class_session',
  'academic_teacher_object_exam_assignment',
  'academic_teacher_upsert_attendance_records',
  'academic_teacher_upsert_student_grade',
  'academic_update_teacher_assignment_condition',
  'admin_enroll_student_in_exam_table',
  'delete_institution_user',
  'get_academic_transition_config',
  'get_exam_table_roster',
  'get_exam_tables_admin_overview',
  'get_public_app_status',
  'get_student_portal_workspace_snapshot',
  'list_active_login_institutions',
  'publish_exam_tables_from_schedule',
  'remove_user_membership',
  'set_institution_logo',
  'set_user_access_status',
  'teacher_remove_student_subject_records',
  'teacher_reset_student_subject_academic_records',
  'upsert_exam_enrollment_from_portal',
  'upsert_subject_enrollment_from_portal',
  'update_membership_role',
])

const expectedRemoteOnlyRpcContracts = new Set([
  'academic_admin_create_student_career_enrollment',
  'academic_admin_correct_student_career_enrollment',
  'academic_admin_get_student_career_enrollment_history',
  'academic_admin_get_teacher_profile_link_candidates',
  'academic_admin_invalidate_student_career_enrollment',
  'academic_admin_link_teacher_record_profile',
  'academic_enroll_first_year_student',
  'academic_enroll_student_in_course_offering',
  'academic_get_student_course_enrollment_preview',
  'academic_get_teacher_course_roster_preview',
  'upsert_exam_enrollment_from_portal',
])

const academicTransitionConfigSqlFields = [
  'stage',
  'write_mode',
  'read_mode',
  'dual_write_enabled',
  'hybrid_read_enabled',
  'relational_primary_enabled',
  'snapshot_fallback_enabled',
  'snapshot_write_compat_enabled',
  'strict_drift_block_enabled',
]

const academicTransitionConfigJsFields = [
  'stage',
  'writeMode',
  'readMode',
  'dualWriteEnabled',
  'hybridReadEnabled',
  'relationalPrimaryEnabled',
  'snapshotFallbackEnabled',
  'snapshotWriteCompatEnabled',
  'strictDriftBlockEnabled',
]

describe('Supabase function security matrix', () => {
  it('mantiene la copia de is_member_of_institution del SQL de bajo riesgo igual al baseline (06.3)', () => {
    const extract = (filePath) => {
      const sql = readText(join(SUPABASE_DIR, filePath))
      const start = sql.indexOf('create or replace function public.is_member_of_institution(')
      expect(start, filePath).toBeGreaterThanOrEqual(0)
      return sql.slice(start, sql.indexOf('$$;', start) + 3)
    }
    expect(extract('security/2026-09-05_low_risk_indexes_search_path_auth_uid.sql')).toBe(extract('schema/01_foundation.sql'))
  })

  it('fija search_path en toda funcion del baseline y del gateway (advisor 0011)', () => {
    const files = [
      ...walkFiles(join(SUPABASE_DIR, 'schema'), (filePath) => filePath.endsWith('.sql')),
      join(SUPABASE_DIR, 'security/source_file_storage_gateway.sql'),
    ]
    const missing = files.flatMap((filePath) => {
      const sql = readText(filePath)
      return [...sql.matchAll(/create or replace function\s+([\w.]+)\s*\(/gi)]
        .filter((match) => !/\bset\s+search_path\b/i.test(sql.slice(match.index, sql.indexOf('$$', match.index))))
        .map((match) => match[1])
    })
    expect(missing).toEqual([])
  })

  it('mantiene inventariadas todas las RPC invocadas por codigo local', () => {
    expect([...extractInvokedRpcContracts()].sort()).toEqual([...invokedRpcContracts].sort())
  }, 15000)

  it('no reintroduce raw_user_meta_data.account_role en SQL versionado', () => {
    const vulnerablePattern = /new\.raw_user_meta_data\s*->>\s*'account_role'|raw_user_meta_data\s*->>\s*'account_role'/i

    const offenders = allSqlFiles()
      .filter((filePath) => vulnerablePattern.test(readText(filePath)))
      .map((filePath) => filePath.replace(process.cwd(), ''))

    expect(offenders).toEqual([])
  })

  it('mantiene funciones trigger internas sin ejecucion directa publica', () => {
    const triggerFunctions = [
      'handle_new_user',
      'sync_teacher_record_ui_compat_fields',
      'sync_student_record_ui_compat_fields',
      'touch_workspace_operational_updated_at',
      'touch_subject_teacher_assignments_updated_at',
      'touch_academic_operations_updated_at',
      'validate_exam_table_subject_integrity',
      'validate_exam_enrollment_integrity',
      'validate_exam_absence_penalty_integrity',
    ]

    const schemaSql = allSqlFiles()
      .filter((filePath) => filePath.includes(`${join('supabase', 'schema')}`))
      .map(readText)
      .join('\n')

    for (const functionName of triggerFunctions) {
      expect(schemaSql).toMatch(new RegExp(`execute\\s+function\\s+public\\.${escapeRegExp(functionName)}\\s*\\(`, 'i'))
      expect(schemaSql).toMatch(new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${escapeRegExp(functionName)}\\s*\\([^;]*\\)\\s+from\\s+public,\\s*anon,\\s*authenticated`, 'i'))
    }
  })

  it('documenta toda RPC invocada que no tiene definicion SQL local auditable', () => {
    const sqlFunctions = getSqlFunctionNames()
    const missingLocalDefinitions = [...invokedRpcContracts]
      .filter((rpcName) => !sqlFunctions.has(rpcName))
      .filter((rpcName) => !expectedRemoteOnlyRpcContracts.has(rpcName))
      .sort()

    expect(missingLocalDefinitions).toEqual([])
  })

  it('mantiene revokes explicitos en RPC SQL locales invocadas por clientes', () => {
    const sqlFunctions = getSqlFunctionNames()
    const invokedLocalRpcNames = [...invokedRpcContracts]
      .filter((rpcName) => sqlFunctions.has(rpcName))
      .filter((rpcName) => !['get_public_app_status', 'list_active_login_institutions'].includes(rpcName))

    const missingRevokes = invokedLocalRpcNames
      .filter((rpcName) => !sqlContains(new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${escapeRegExp(rpcName)}\\s*\\([^;]*\\)\\s+from\\s+public,\\s*anon`, 'i')))
      .sort()

    expect(missingRevokes).toEqual([])
  })

  it('documenta las RPC necesarias ya implementadas en el baseline local', () => {
    const manifest = readText(BASELINE_MANIFEST)
    const readiness = readText(BASELINE_READINESS)
    const requiredLocalRpc = [
      'upsert_exam_enrollment_from_portal',
    ]

    for (const rpcName of requiredLocalRpc) {
      expect(manifest).toContain(rpcName)
      expect(readiness).toContain(rpcName)
    }

    expect(manifest).toContain('get_academic_transition_config')
    expect(readiness).toContain('get_academic_transition_config')
    expect(manifest).toContain('RESUELTO LOCALMENTE — PENDIENTE VALIDACIÓN DB')
    expect(readiness).toContain('RESUELTO LOCALMENTE — PENDIENTE VALIDACIÓN DB')
    expect(manifest).toContain('`upsert_exam_enrollment_from_portal` ya está implementada localmente en `supabase/schema/08_exam_tables.sql`')
    expect(readiness).toContain('Implementación local canónica: SÍ, en `supabase/schema/08_exam_tables.sql`')
  })

  it('versiona get_academic_transition_config con seguridad minima y sin argumentos', () => {
    const functionBlock = getSqlFunctionBlock('get_academic_transition_config')

    expect(functionBlock).toMatch(/create\s+or\s+replace\s+function\s+public\.get_academic_transition_config\s*\(\s*\)/i)
    expect(functionBlock).toMatch(/returns\s+table\s*\(/i)
    expect(functionBlock).toMatch(/security\s+definer/i)
    expect(functionBlock).toMatch(/set\s+search_path\s*=\s*''/i)
    expect(functionBlock).not.toMatch(/set\s+search_path\s*=\s*public/i)
    expect(functionBlock).toContain('(select auth.uid()) is null')
    expect(functionBlock).toContain('from public.app_settings setting')
    expect(functionBlock).toContain("where setting.key = 'academic_relational_transition'")
    expect(functionBlock).not.toMatch(/raw_user_meta_data|account_role|user_metadata/i)
    expect(functionBlock).not.toMatch(/select\s+\*/i)
    expect(functionBlock).not.toContain('public.app_settings%rowtype')
    expect(functionBlock).not.toContain('setting.is_public')
    expect(functionBlock).not.toContain('setting.updated_at')
  })

  it('mantiene grants explícitos de get_academic_transition_config sin exposición anonima', () => {
    const source = allSqlFiles().map(readText).join('\n')

    expect(source).toMatch(/revoke\s+execute\s+on\s+function\s+public\.get_academic_transition_config\s*\(\s*\)\s+from\s+public,\s*anon,\s*authenticated/i)
    expect(source).toMatch(/grant\s+execute\s+on\s+function\s+public\.get_academic_transition_config\s*\(\s*\)\s+to\s+authenticated/i)
    expect(source).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.get_academic_transition_config\s*\(\s*\)\s+to\s+(?:public|anon|service_role)/i)
  })

  it('mantiene el DTO SQL de get_academic_transition_config alineado con el contrato JS', () => {
    const functionBlock = getSqlFunctionBlock('get_academic_transition_config')
    const frontendSource = readText(join(SRC_DIR, 'modules/alumnos/services/academicRelationalData.js'))

    for (const sqlField of academicTransitionConfigSqlFields) {
      expect(functionBlock).toMatch(new RegExp(`\\b${escapeRegExp(sqlField)}\\b`, 'i'))
    }

    for (const jsField of academicTransitionConfigJsFields) {
      expect(frontendSource).toContain(jsField)
    }

    expect(functionBlock).not.toMatch(/\b(?:key|value|is_public|updated_at)\s+(?:text|jsonb|boolean|timestamptz)\b/i)
  })

  it('documenta defaults fail-safe para get_academic_transition_config', () => {
    const functionBlock = getSqlFunctionBlock('get_academic_transition_config')

    expect(functionBlock).toContain("config_value jsonb := '{}'::jsonb")
    expect(functionBlock).toContain("config_value := coalesce(config_value, '{}'::jsonb)")
    expect(functionBlock).toMatch(/stage\s*:=\s*case[\s\S]*else\s+'snapshot_only'/i)
    expect(functionBlock).toMatch(/write_mode\s*:=\s*case[\s\S]*else\s+'snapshot_only'/i)
    expect(functionBlock).toMatch(/read_mode\s*:=\s*case[\s\S]*else\s+'snapshot_only'/i)
    expect(functionBlock).toContain("dual_write_enabled := coalesce((config_value -> 'dual_write_enabled') = 'true'::jsonb, false)")
    expect(functionBlock).toContain("hybrid_read_enabled := coalesce((config_value -> 'hybrid_read_enabled') = 'true'::jsonb, false)")
    expect(functionBlock).toContain("relational_primary_enabled := coalesce((config_value -> 'relational_primary_enabled') = 'true'::jsonb, false)")
    expect(functionBlock).toContain("snapshot_fallback_enabled := coalesce((config_value -> 'snapshot_fallback_enabled') <> 'false'::jsonb, true)")
    expect(functionBlock).toContain("snapshot_write_compat_enabled := coalesce((config_value -> 'snapshot_write_compat_enabled') <> 'false'::jsonb, true)")
    expect(functionBlock).toContain("strict_drift_block_enabled := coalesce((config_value -> 'strict_drift_block_enabled') = 'true'::jsonb, false)")
  })

  it('documenta el orden canónico local y distingue el SQL de validación del baseline', () => {
    const manifest = readText(BASELINE_MANIFEST)
    const installOrderSection = manifest.slice(manifest.indexOf('## Orden exacto de instalación futura'))
    const expectedOrder = [
      'supabase/schema/01_foundation.sql',
      'supabase/schema/02_academic_relational_schema.sql',
      'supabase/schema/03_workspace_data.sql',
      'supabase/schema/04_teacher_exam_date_exclusions.sql',
      'supabase/schema/05_workspace_operational_compat.sql',
      'supabase/schema/06_subject_teacher_assignments.sql',
      'supabase/schema/07_academic_operations.sql',
      'supabase/schema/08_exam_tables.sql',
      'supabase/schema/05_student_portal_secure_read.sql',
    ]

    let previousIndex = -1
    for (const filePath of expectedOrder) {
      const nextIndex = installOrderSection.indexOf(filePath)
      expect(nextIndex, `${filePath} debe figurar en el manifest`).toBeGreaterThan(previousIndex)
      previousIndex = nextIndex
    }

    const executableBaselineSqlFiles = allSqlFiles()
      .filter((filePath) => filePath.includes(`${join('supabase', 'baseline')}`))

    expect(executableBaselineSqlFiles).toEqual([
      join(SUPABASE_DIR, 'baseline/local_ab_rls_rpc_validation.sql'),
    ])
  })

  it('exige search_path explicito en funciones SECURITY DEFINER versionadas', () => {
    const offenders = []
    const functionPattern = /create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\([\s\S]*?\n\$\$/ig

    for (const filePath of allSqlFiles().filter((path) => path.includes(`${join('supabase', 'schema')}`))) {
      const source = readText(filePath)
      for (const match of source.matchAll(functionPattern)) {
        const functionBlock = match[0]
        if (/security\s+definer/i.test(functionBlock) && !/set\s+search_path\s*=/i.test(functionBlock)) {
          offenders.push(`${filePath.replace(process.cwd(), '')}:${match[1]}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
