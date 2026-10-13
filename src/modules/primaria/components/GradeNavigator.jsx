import { usePrimStore } from '../stores/primStore.js'
import { useMemo } from 'react'
import { 
  GraduationCap, 
  Users, 
  Calculator, 
  Folder,
  FolderOpen,
  Layers,
} from 'lucide-react'

const gradesData = [
  { value: 1, label: "1°", icon: GraduationCap, color: "teal", totalActividades: 12 },
  { value: 2, label: "2°", icon: Users, color: "lime", totalActividades: 11 },
  { value: 3, label: "3°", icon: Calculator, color: "amber", totalActividades: 10 },
  { value: 4, label: "4°", icon: Folder, color: "blue", totalActividades: 9 },
  { value: 5, label: "5°", icon: FolderOpen, color: "purple", totalActividades: 8 },
  { value: 6, label: "6°", icon: Layers, color: "red", totalActividades: 7 },
]

export default function GradeNavigator({ currentGrade }) {
  const { setCurrentGrade } = usePrimStore()

  const grades = useMemo(() => gradesData, [])

  return (
    <div className="mt-8 p-6 rounded-lg border border-slate-200 bg-white shadow-sm mb-6">
      <h3 className="text-xl font-medium text-slate-800 mb-6">Selección de Grado Primario</h3>
      
      <div className="grid grid-cols-6 gap-2">
        {grades.map((grade) => {
          const isCurrent = grade.value === currentGrade
          const Icon = grade.icon
          
          return (
            <button
              key={grade.value}
              onClick={() => setCurrentGrade(grade.value)}
              className={`col-span-1 rounded-md border px-4 py-3 text-sm font-medium transition-all ${
                isCurrent
                  ? 'bg-teal-100 text-teal-800 border-teal-400 shadow-lg'
                  : 'text-slate-600 hover:bg-slate-50 hover:border-teal-200'
              }`}
            >
              <Icon className={`h-4 w-4 ${isCurrent ? 'text-teal-500' : 'text-slate-400'}`} />
              <span className={`font-bold ${isCurrent ? 'text-teal-800' : 'text-slate-700'}`}>
                {grade.label}
              </span>
              <span className="text-xs text-slate-400 ml-auto">
                {grade.totalActividades} act.
              </span>
            </button>
          )
        })}
      </div>
      
      <div className="mt-6 pt-6 border-t border-slate-200">
        <p className="text-sm text-slate-500">
          Total actividades por grado: {gradesData.map(g => g.totalActividades).reduce((a, b) => a + b, 0)}
        </p>
      </div>
    </div>
  )
}
