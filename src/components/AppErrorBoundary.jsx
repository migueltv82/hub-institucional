import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    const { error } = this.state

    if (!error) return this.props.children

    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center p-4 md:p-6">
        <section className="panel w-full">
          <span className="soft-title">Institutional Hub</span>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">No se pudo cargar esta vista</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Recarga la pagina. Si el problema continua, usa este detalle para ubicar el fallo.
          </p>
          <pre className="mt-4 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-white">
            {error.message || String(error)}
          </pre>
        </section>
      </main>
    )
  }
}
