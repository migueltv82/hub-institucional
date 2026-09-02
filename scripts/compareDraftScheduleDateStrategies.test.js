import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  compareDraftScheduleDateStrategies,
  parseCompareArguments,
  runCompareDraftScheduleDateStrategiesCli,
} from './compareDraftScheduleDateStrategies.mjs'

function scheduleRowsForTeacher(profesor, materia, nombreMateria, dias) {
  return dias.map((dia, index) => ({
    id: `${profesor}-${materia}-${index}`,
    profesor,
    carrera: 'Profesorado de Geografia',
    materia,
    nombreMateria,
    dia,
    inicio: '18:00',
    fin: '20:40',
  }))
}

// 2026-07-30 es jueves, 2026-07-31 es viernes. La titular solo asiste los
// viernes, asi que el round-robin (que arranca en el primer dia habil) la
// deja en un dia que no dicta clase.
function fixtureSnapshot() {
  return {
    fechaInicio: '2026-07-30',
    fechaFin: '2026-07-31',
    docentes: [],
    docenteMateria: [{
      docente: 'Vero Viernes',
      carrera: 'Profesorado de Geografia',
      materia_codigo: 'GEO4A',
      materia_nombre: 'Geografia Regional',
      rol_en_materia: 'TITULAR',
      estado_asignacion: 'ACTIVO',
    }],
    horariosDocentes: scheduleRowsForTeacher('Vero Viernes', 'GEO4A', 'Geografia Regional', ['viernes']),
    planesEstudio: [{
      id: 'GEO4A',
      carrera: 'Profesorado de Geografia',
      materia: 'GEO4A',
      nombreMateria: 'Geografia Regional',
      anio: 4,
    }],
    correlatividades: [],
    cronograma: [],
  }
}

function inMemoryFs(cwd, snapshot = fixtureSnapshot()) {
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

describe('compareDraftScheduleDateStrategies', () => {
  it('muestra que availabilityAware saca la mesa del dia en que la titular no asiste', () => {
    const result = compareDraftScheduleDateStrategies({ workspaceSnapshot: fixtureSnapshot() })

    expect(result.roundRobinSummary.titularAusenteEnFechaAsignada).toBe(1)
    expect(result.availabilityAwareSummary.titularAusenteEnFechaAsignada).toBe(0)
    expect(result.changedMesas).toEqual([
      expect.objectContaining({
        titular: 'Vero Viernes',
        fechaAntes: '2026-07-30',
        fechaDespues: '2026-07-31',
      }),
    ])
  })

  it('mantiene el total de mesas igual entre estrategias, solo cambia la fecha', () => {
    const result = compareDraftScheduleDateStrategies({ workspaceSnapshot: fixtureSnapshot() })

    expect(result.roundRobinSummary.totalMesas).toBe(result.availabilityAwareSummary.totalMesas)
  })
})

describe('runCompareDraftScheduleDateStrategiesCli', () => {
  it('aborta si falta --snapshot o el archivo no existe', () => {
    expect(() => parseCompareArguments([])).toThrow('COMPARE_DATE_STRATEGIES_SNAPSHOT_ARGUMENT_REQUIRED')
    expect(() => runCompareDraftScheduleDateStrategiesCli({
      argv: ['--snapshot', 'missing.json'],
      cwd: 'C:/compare-test',
      fsApi: inMemoryFs('C:/compare-test').api,
      writeReports: false,
    })).toThrow('COMPARE_DATE_STRATEGIES_SNAPSHOT_NOT_FOUND')
  })

  it('genera el reporte Markdown sin alterar el archivo fuente', () => {
    const cwd = 'C:/compare-test'
    const memory = inMemoryFs(cwd)
    const original = memory.files.get(memory.snapshotPath)

    const result = runCompareDraftScheduleDateStrategiesCli({
      argv: ['--snapshot', 'snapshot.json', '--output', 'report.md'],
      cwd,
      now: () => '2026-07-14T11:30:00.000Z',
      fsApi: memory.api,
    })

    expect(result.summary).toMatchObject({
      sourceFileUnchanged: true,
      anonymized: false,
      mesasConFechaDistinta: 1,
      titularAusenteAntes: 1,
      titularAusenteDespues: 0,
    })
    expect(memory.files.get(memory.snapshotPath)).toBe(original)
    expect(memory.files.get(resolve(cwd, 'report.md'))).toContain('Comparacion de estrategias de fecha del precronograma')
  })

  it('anonimiza cuando se pasa --anonymize y sigue sin tocar el archivo fuente', () => {
    const cwd = 'C:/compare-test'
    const memory = inMemoryFs(cwd)

    const result = runCompareDraftScheduleDateStrategiesCli({
      argv: ['--snapshot', 'snapshot.json', '--output', 'report.md', '--anonymize'],
      cwd,
      now: () => '2026-07-14T11:30:00.000Z',
      fsApi: memory.api,
    })

    expect(result.summary.anonymized).toBe(true)
    expect(result.summary.sourceFileUnchanged).toBe(true)
    expect(result.markdown).toContain('anonimizados')
    expect(result.comparison.changedMesas[0].titular).not.toBe('Vero Viernes')
  })
})
