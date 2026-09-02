import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  parseApplyPlanCatalogCliArgs,
  runApplyPlanCatalogToSubjectWorkpack,
} from './applyV2PlanCatalogToSubjectWorkpack.mjs'

const tempRoots = []

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'plan-apply-test-'))
  tempRoots.push(root)
  return root
}

function writeCsv(filePath, rows) {
  writeFileSync(filePath, `${rows.join('\n')}\n`, 'utf8')
}

function writeWorkpackFile(workpackDir, rows) {
  mkdirSync(workpackDir, { recursive: true })
  writeCsv(join(workpackDir, 'ING_revision.csv'), [
    'prioridad,review_id,carrera,carrera_id_sugerido,carrera_id_final,anio,materia_nombre,plan_id_sugerido,plan_id_final,materia_codigo_sugerido,materia_codigo_final,estado_revision,riesgo_nombre_duplicado,motivo_revision,accion_requerida,observaciones_revision',
    ...rows,
  ])
}

function writeCatalog(filePath, status = 'CONFIRMADO') {
  writeCsv(filePath, [
    'carrera_id,carrera_nombre,materias_requeridas,plan_id_sugerido,plan_id_final,plan_nombre_final,anio_plan,resolucion_plan,estado_revision,observaciones_revision',
    `ING,Profesorado de Ingles,2,ING-PLAN-ACTUAL,ING-2026,,2026,,${status},`,
  ])
}

afterEach(() => {
  while (tempRoots.length) {
    const root = tempRoots.pop()
    rmSync(root, { recursive: true, force: true })
  }
})

describe('applyV2PlanCatalogToSubjectWorkpack script', () => {
  it('parsea catalogo externo por argumento', () => {
    const options = parseApplyPlanCatalogCliArgs([
      '--catalog',
      'local-audit/v2-plan-catalog-review-prefilled/v2_plan_catalog_review.prefilled.csv',
      '--workpack-dir=local-audit/v2-subject-identity-workpack',
      '--out-dir',
      'local-audit/custom-plan-applied',
    ])

    expect(options.catalogPath).toBe(resolve(
      'local-audit/v2-plan-catalog-review-prefilled/v2_plan_catalog_review.prefilled.csv',
    ))
    expect(options.workpackDir).toBe(resolve('local-audit/v2-subject-identity-workpack'))
    expect(options.outDir).toBe(resolve('local-audit/custom-plan-applied'))
  })

  it('aplica desde catalogo confirmado externo sin pisar codigos ni confirmar materias', () => {
    const root = makeTempRoot()
    const catalogPath = join(root, 'catalog.csv')
    const workpackDir = join(root, 'workpack')
    const outDir = join(root, 'out')
    writeCatalog(catalogPath, 'CONFIRMADO')
    writeWorkpackFile(workpackDir, [
      'MEDIA,v2_subject_001,Profesorado de Ingles,ING,,1,Materia Uno,ING-PLAN-ACTUAL,,ING-1-MATUNO,,,NO,WEAK_KEY,COMPLETAR,',
      'MEDIA,v2_subject_002,Profesorado de Ingles,ING,,2,Materia Dos,ING-PLAN-ACTUAL,,ING-2-MATDOS,,,NO,WEAK_KEY,COMPLETAR,',
    ])

    const report = runApplyPlanCatalogToSubjectWorkpack({ catalogPath, workpackDir, outDir })
    const output = readFileSync(join(outDir, 'ING_revision.csv'), 'utf8')

    expect(report).toMatchObject({
      totalSubjectRows: 2,
      plansConfirmed: 1,
      plansPending: 0,
      subjectsUpdatedWithPlan: 2,
      subjectsWithoutPlan: 0,
      readyForSubjectCodeReview: true,
      readyForCompactFinalTableComparison: false,
      safeToReplaceLegacy: false,
    })
    expect(output).toContain('ING-2026')
    expect(output).toContain('PRECONFIRMAR_PLAN')
    expect(output).toContain('ING-1-MATUNO,,PRECONFIRMAR_PLAN')
    expect(output).not.toContain('CONFIRMADO')
  })

  it('no aplica planes desde catalogo PRECONFIRMAR', () => {
    const root = makeTempRoot()
    const catalogPath = join(root, 'catalog.csv')
    const workpackDir = join(root, 'workpack')
    const outDir = join(root, 'out')
    writeCatalog(catalogPath, 'PRECONFIRMAR')
    writeWorkpackFile(workpackDir, [
      'MEDIA,v2_subject_001,Profesorado de Ingles,ING,,1,Materia Uno,ING-PLAN-ACTUAL,,ING-1-MATUNO,,,NO,WEAK_KEY,COMPLETAR,',
    ])

    const report = runApplyPlanCatalogToSubjectWorkpack({ catalogPath, workpackDir, outDir })
    const output = readFileSync(join(outDir, 'ING_revision.csv'), 'utf8')

    expect(report).toMatchObject({
      totalSubjectRows: 1,
      plansConfirmed: 0,
      plansPending: 1,
      subjectsUpdatedWithPlan: 0,
      subjectsWithoutPlan: 1,
      skippedBecausePreconfirmar: 1,
      readyForSubjectCodeReview: false,
    })
    expect(output).not.toContain('ING-2026,,ING-1-MATUNO')
  })
})
