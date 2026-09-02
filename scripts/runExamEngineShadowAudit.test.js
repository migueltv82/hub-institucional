import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseShadowAuditArguments,
  runExamEngineShadowAuditCli,
} from './runExamEngineShadowAudit.mjs'
import { buildFullAnonymizedWorkspaceSnapshotAuditPayload } from '../src/components/generadorCronograma/workspaceSnapshotAuditExport.js'

function minimalSnapshot() {
  return {
    planesEstudio: [{
      carrera: 'Carrera CLI',
      materia: 'CLI1',
      nombreMateria: 'Materia CLI',
      requiereMesa: true,
    }],
    cargaHorariaDocente: [],
    disponibilidadDocente: [],
    fechasBloqueadasDocente: [],
    horariosDocentes: [],
    correlatividades: [],
    alumnos: [],
    cronograma: [{ id: 'official-cli', materia: 'OFFICIAL' }],
  }
}

function inMemoryFs(cwd, snapshot = minimalSnapshot()) {
  const snapshotPath = resolve(cwd, 'snapshot.json')
  const files = new Map([[snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`]])
  return {
    snapshotPath,
    files,
    api: {
      existsSync: (filePath) => files.has(resolve(filePath)),
      readFileSync: (filePath) => {
        const value = files.get(resolve(filePath))
        if (value === undefined) throw new Error('ENOENT')
        return value
      },
      mkdirSync: () => {},
      writeFileSync: (filePath, value) => files.set(resolve(filePath), value),
    },
  }
}

describe('runExamEngineShadowAudit CLI', () => {
  it('aborta si falta --snapshot o el archivo no existe', () => {
    expect(() => parseShadowAuditArguments([])).toThrow('SHADOW_AUDIT_SNAPSHOT_ARGUMENT_REQUIRED')
    expect(() => runExamEngineShadowAuditCli({
      argv: ['--snapshot', 'missing.json'],
      cwd: 'C:/shadow-test',
      fsApi: inMemoryFs('C:/shadow-test').api,
      writeReports: false,
    })).toThrow('SHADOW_AUDIT_SNAPSHOT_NOT_FOUND')
  })

  it('genera Markdown y JSON agregado sin alterar el archivo fuente', () => {
    const cwd = 'C:/shadow-test'
    const memory = inMemoryFs(cwd)
    const original = memory.files.get(memory.snapshotPath)
    const result = runExamEngineShadowAuditCli({
      argv: ['--snapshot', 'snapshot.json', '--output', 'report.json', '--anonymize', '--no-write'],
      cwd,
      now: () => '2026-07-14T11:30:00.000Z',
      fsApi: memory.api,
    })

    expect(result.summary).toMatchObject({
      sourceFileUnchanged: true,
      snapshotUnchanged: true,
      officialScheduleUnchanged: true,
      supabaseUsed: false,
      persistencePerformed: false,
      anonymized: true,
    })
    expect(memory.files.get(memory.snapshotPath)).toBe(original)
    expect(memory.files.get(resolve(cwd, 'report.json'))).toContain('"rawSnapshotIncluded": false')
    expect(memory.files.get(result.summary.outputs.markdown)).toContain('# Shadow audit del motor de examenes')
  })

  it('rechaza que --output reemplace el snapshot', () => {
    const cwd = 'C:/shadow-test'
    const memory = inMemoryFs(cwd)
    expect(() => runExamEngineShadowAuditCli({
      argv: ['--snapshot', 'snapshot.json', '--output', 'snapshot.json'],
      cwd,
      fsApi: memory.api,
    })).toThrow('SHADOW_AUDIT_OUTPUT_CANNOT_REPLACE_SNAPSHOT')
  })

  it('acepta el snapshot completo anonimizado y resuelve el filtro de carrera por hash', () => {
    const cwd = 'C:/shadow-test'
    const exported = buildFullAnonymizedWorkspaceSnapshotAuditPayload({
      docentes: [{ id: 'teacher-1', nombre: 'Docente Real' }],
      planesEstudio: [{
        id: 'subject-1',
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        nombreMateria: 'Lengua Inglesa I',
        requiereMesa: true,
      }],
      cargaHorariaDocente: [{
        teacher_record_id: 'teacher-1',
        docente: 'Docente Real',
        carrera: 'Profesorado de Ingles',
        subject_id: 'subject-1',
        materia: 'ING1',
        nombreMateria: 'Lengua Inglesa I',
        rol: 'TITULAR',
        titularidad: true,
        horasCatedra: 6,
        estado: 'ACTIVE',
      }],
      disponibilidadDocente: [{
        teacher_record_id: 'teacher-1',
        docente: 'Docente Real',
        dia: 'lunes',
        turno: 'NOCHE',
        horaDesde: '18:00',
        horaHasta: '21:00',
        disponible: true,
        estado: 'ACTIVE',
      }],
      horariosDocentes: [],
      correlatividades: [],
      alumnos: [],
      fechasBloqueadasDocente: [],
      cronograma: [],
      examGenerationConfig: {
        regularCallRanges: {
          first: { start: '2026-07-27', end: '2026-07-27' },
        },
      },
    })
    const memory = inMemoryFs(cwd, exported)
    const result = runExamEngineShadowAuditCli({
      argv: [
        '--snapshot',
        'snapshot.json',
        '--career',
        'profesorado de ingles',
        '--callNumber',
        '1',
        '--no-write',
      ],
      cwd,
      fsApi: memory.api,
      writeReports: false,
    })

    expect(result.audit.scope.career).toBe('CARRERA_001')
    expect(result.audit.teacherSource.source).toBe('structured')
    expect(result.audit.expectedUniverse.count).toBe(1)
    expect(result.audit.generated.count).toBe(1)
    expect(result.summary.sourceFileUnchanged).toBe(true)
  })

  it('no importa Supabase ni servicios de persistencia', () => {
    const source = [
      'scripts/runExamEngineShadowAudit.mjs',
      'src/utils/examEngine/audit/buildExamEngineShadowAudit.js',
      'src/components/generadorCronograma/workspaceSnapshotAuditAnonymizer.js',
      'src/components/generadorCronograma/workspaceSnapshotAuditExport.js',
    ].map((filePath) => readFileSync(resolve(process.cwd(), filePath), 'utf8')).join('\n')
    expect(source).not.toContain('@supabase/supabase-js')
    expect(source).not.toContain("from '../src/services")
    expect(source).not.toContain("from '../../services")
    expect(source).not.toContain('saveWorkspaceSnapshot(')
  })
})
