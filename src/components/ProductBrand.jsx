import logoHorizontal from '../assets/institutional-hub-logo-horizontal-web.png'

function ProductBrand({ className = '' }) {
  return (
    <div className={`brand-mark ${className}`} aria-label="Institutional Hub">
      <span className="brand-symbol" aria-hidden="true">
        <img src={logoHorizontal} alt="" />
      </span>
      <span className="brand-wordmark">
        <span>Institutional</span>
        <span>Hub</span>
      </span>
    </div>
  )
}

export default ProductBrand
