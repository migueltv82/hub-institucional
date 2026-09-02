import { createEngineResult } from '../contracts.js'
import { runPreGenerationDiagnostics } from '../diagnostics/feasibility.js'

// Special generation only schedules explicitly selected subjects.

export function generateSpecialExams(input = {}) {
  const diagnostics = runPreGenerationDiagnostics(input)
  if (!diagnostics.canGenerate) {
    return createEngineResult({
      diagnostics,
      report: {
        diagnostics: [diagnostics],
        errors: diagnostics.errors,
        warnings: diagnostics.warnings,
      },
    })
  }

  return createEngineResult({
    cronograma: [],
    diagnostics,
    report: {
      diagnostics: [diagnostics],
      warnings: diagnostics.warnings,
    },
  })
}

