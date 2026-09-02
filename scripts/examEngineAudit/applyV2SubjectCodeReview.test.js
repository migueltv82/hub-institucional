import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  parseApplySubjectCodeReviewCliArgs,
  runApplyV2SubjectCodeReview,
} from './applyV2SubjectCodeReview.mjs'

const tempRoots = []

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'subject-code-apply-test-'))
  tempRoots.push(root)
  return root
}

function writeCsv(filePath, rows) {
  writeFileSync(filePath, `${rows.join('\n')}\n`, 'utf8')
}

function writeReviewFile(reviewDir, rows) {
  mkdirSync(reviewDir, { recursive: true })
  writeCsv(join(reviewDir, 'ING_codigos.csv'), [
    'review_id,carrera,carrera_id_final,plan_id_final,anio,materia_nombre,materia_codigo_sugerido,materia_codigo_borrador,materia_codigo_final,estado_revision,riesgo_nombre_duplicado,riesgo_codigo_duplicado,riesgo_homonimia,prioridad_revision,motivo_revision,accion_requerida,observaciones_revision',
    ...rows,
  ])
}

afterEach(() => {
  while (tempRoots.length) {
    const root = tempRoots.pop()
    rmSync(root, { recursive: true, force: true })
  }
})

describe('applyV2SubjectCodeReview script', () => {
  it('parsea review-dir y out-prefix externos', () => {
    const options = parseApplySubjectCodeReviewCliArgs([
      '--review-dir',
      'local-audit/v2-subject-code-review-prefilled',
      '--out-prefix=local-audit/v2_subject_code.prefilled',
    ])

    expect(options.reviewDir).toBe(resolve('local-audit/v2-subject-code-review-prefilled'))
    expect(options.outPrefix).toBe(resolve('local-audit/v2_subject_code.prefilled'))
  })

  it('valida carpeta externa sin pisar outputs anteriores', () => {
    const root = makeTempRoot()
    const reviewDir = join(root, 'prefilled')
    const previousOutput = join(root, 'v2_subject_code.corrected.csv')
    const outPrefix = join(root, 'v2_subject_code.prefilled')
    writeReviewFile(reviewDir, [
      'v2_subject_001,Profesorado de Ingles,ING,ING-2026,1,Materia Uno,ING-1-MATUNO,ING-1-MATUNO,ING-1-MATUNO,PRECONFIRMAR_CODIGO,NO,NO,NO,MEDIA,,COMPLETAR,',
    ])
    writeFileSync(previousOutput, 'salida anterior\n', 'utf8')

    const report = runApplyV2SubjectCodeReview({ reviewDir, outPrefix })

    expect(report).toMatchObject({
      totalReviewRows: 1,
      correctedRows: 0,
      pendingRows: 1,
      rejectedRows: 0,
      readyForIdentityV2: false,
      readyForCompactFinalTableComparison: false,
      safeToReplaceLegacy: false,
    })
    expect(existsSync(`${outPrefix}.pending.csv`)).toBe(true)
    expect(existsSync(`${outPrefix}.validation.summary.json`)).toBe(true)
    expect(readFileSync(previousOutput, 'utf8')).toBe('salida anterior\n')
  })
})
