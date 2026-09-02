function AppFooter({ compact = false }) {
  const year = new Date().getFullYear()

  return (
    <footer className={compact ? 'app-footer app-footer--compact' : 'app-footer'}>
      <span>© {year} Institutional Hub.</span>
      <span>
        Desarrollado por{' '}
        <a href="mailto:migueltvism@gmail.com">
          Miguel Torres Viaña
        </a>
      </span>
    </footer>
  )
}

export default AppFooter
