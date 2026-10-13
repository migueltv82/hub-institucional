import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { usePrimStore } from '../stores/primStore.js'
import { gradeData, gradesOrdered } from '../data/gradeData.js'
import GradeNavigator from './GradeNavigator.jsx'

function PrimariaGradePage() {
  const { grade } = useParams() // "1", "2", ..., "6"
  const { setCurrentGrade, getCurrentGrade, getGradeProgress } = usePrimStore()
  const [activeActivity, setActiveActivity] = useState(null)
  
  // Actualizar grado actual en el store
  useEffect(() => {
    const gradeNum = parseInt(grade)
    if (!isNaN(gradeNum) && gradeNum >= 1 && gradeNum <= 6) {
      setCurrentGrade(gradeNum)
    }
  }, [grade, setCurrentGrade])

  const currentGrade = getCurrentGrade()
  const gradeInfo = gradeData[currentGrade]
  const gradeProgress = getGradeProgress(currentGrade)

  if (!gradeInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <h1 className="text-2xl font-bold text-red-600">Grado no disponible</h1>
        <p className="text-slate-600">El grado {grade} no existe en el sistema.</p>
        <button
          onClick={() => window.history.back()}
          className="mt-4 btn-primary"
        >
          ← Volver
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <GradeNavigator currentGrade={currentGrade} />
      
      <main className="p-6 max-w-7xl mx-auto">
        <div className="grid gap-6">
          {/* Panel de Información del Grado */}
          <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <GraduationCap className="h-6 w-6 text-teal-600" />
              <div>
                <h2 className="text-xl font-bold text-slate-900">{gradeInfo.nombre}</h2>
                <p className="text-sm text-slate-500">Nivel: {gradeInfo.nivel}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Módulo Lector</p>
                <p className="text-slate-700">{gradeInfo.moduloLectura?.comprensionFrases?.actividades || 0} actividades</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Matemáticas</p>
                <p className="text-slate-700">{gradeInfo.moduloMatematicas?.operacionesBasicas?.actividades || 0} actividades</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">General</p>
                <p className="text-slate-700">{gradeInfo.moduloGeneral?.concienciaCiudadana?.actividades || 0} actividades</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Progreso</p>
                <p className="text-slate-700">
                  {gradeProgress.completadas}/{gradeProgress.actividades} actividades completadas
                </p>
              </div>
            </div>
          </div>

          {/* Módulos del Grado */}
          <div>
            <h3 className="text-base font-medium text-slate-700 mb-4">Módulos Disponibles</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {gradesOrdered.map((g) => {
                const isCurrent = g === currentGrade
                const listedGrade = gradeData[g]
                if (!listedGrade) return null
                
                return (
                  <div
                    key={g}
                    className={`group rounded-lg border ${isCurrent 
                      ? 'border-teal-500 bg-teal-50/50' 
                      : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/20 transition-colors'}`}
                    onClick={() => setActiveActivity(g)}
                  >
                    <div className="p-4 flex flex-col group-hover:-translate-y-1 transition-transform">
                      <h4 className={`font-medium ${isCurrent ? 'text-teal-600' : 'text-slate-600'}`}>
                        {listedGrade.nombre}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">
                        {listedGrade.moduloLectura?.comprensionFrases?.actividades || 0} lectora
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {listedGrade.moduloMatematicas?.operacionesBasicas?.actividades || 0} matemáticas
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Área de Actividad Seleccionada */}
          {activeActivity && (
            <div className="mt-8 p-6 rounded-xl border border-slate-200 bg-slate-50">
              <h3 className="text-xl font-bold text-slate-900 mb-4">
                Actividad: {gradeData[activeActivity]?.moduloLectura?.comprensionFrases?.titulo || 'Seleccionar actividad'}
              </h3>
              
              <p className="text-sm text-slate-600">Actividad no disponible todavía.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default PrimariaGradePage
