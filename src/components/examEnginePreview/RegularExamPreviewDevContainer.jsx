import RegularExamPreviewScreen from './RegularExamPreviewScreen.jsx'
import { buildRegularPreviewInstitutionalFixture } from '../../utils/examEngine/__fixtures__/regularPreviewInstitutionalFixture.js'

const regularPreviewInstitutionalFixture = buildRegularPreviewInstitutionalFixture()

export function RegularExamPreviewDevContainer() {
  return (
    <section className="exam-engine-preview-dev" aria-label="Vista interna de desarrollo del motor nuevo">
      <header className="exam-engine-preview-dev__header">
        <h1>Vista interna de desarrollo - Motor nuevo</h1>
        <p>No reemplaza el generador actual ni publica cronograma oficial.</p>
      </header>

      <RegularExamPreviewScreen input={regularPreviewInstitutionalFixture} initialFilters={{}} />
    </section>
  )
}

export default RegularExamPreviewDevContainer
