import RegularExamComparisonAudit from './RegularExamComparisonAudit.jsx'

export function RegularExamComparisonAuditHarness() {
  return (
    <main className="exam-engine-comparison-audit-harness" aria-label="Harness interno de auditoria comparativa examEngine">
      <header className="exam-engine-comparison-audit-harness__header">
        <h1>Harness interno - Auditoría comparativa examEngine</h1>
        <p>Uso exclusivo de desarrollo. No reemplaza el generador oficial.</p>
        <p>No guarda, no publica y no modifica cronogramas reales.</p>
      </header>

      <RegularExamComparisonAudit />
    </main>
  )
}

export default RegularExamComparisonAuditHarness
