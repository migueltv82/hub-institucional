import { Moon, Sun } from 'lucide-react'

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark'
  const label = isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
  const Icon = isDark ? Sun : Moon

  return (
    <button
      aria-label={label}
      className="theme-toggle print-hidden"
      onClick={onToggle}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" className="h-5 w-5" />
    </button>
  )
}

export default ThemeToggle
