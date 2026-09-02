import RegularExamPreviewDevContainer from './RegularExamPreviewDevContainer.jsx'

export function RegularExamPreviewHarness() {
  return (
    <main className="exam-engine-preview-harness" aria-label="Harness interno del preview examEngine">
      <header className="exam-engine-preview-harness__header">
        <h1>Harness interno - Preview examEngine</h1>
        <p>Uso exclusivo de desarrollo. No reemplaza el generador oficial.</p>
      </header>

      <RegularExamPreviewDevContainer />
    </main>
  )
}

export default RegularExamPreviewHarness
