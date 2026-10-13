import { create } from 'zustand'

export const usePrimStore = create((set, get) => ({
  // Estado del grado actual (1-6 primaria)
  currentGrade: 1,
  
  // Progreso por grado
  progress: {
    1: { actividades: 0, completadas: 0 },
    2: { actividades: 0, completadas: 0 },
    3: { actividades: 0, completadas: 0 },
    4: { actividades: 0, completadas: 0 },
    5: { actividades: 0, completadas: 0 },
    6: { actividades: 0, completadas: 0 }
  },
  
  // UI State
  loading: false,
  error: null,
  success: null,
  selectedActivity: null,
  
  // ============================================================
  // SETTERS
  // ============================================================
  
  setCurrentGrade: (grade) => set({ currentGrade: grade }),
  
  setProgress: (grade, data) => set((state) => ({
    progress: {
      ...state.progress,
      [grade]: { ...state.progress[grade], ...data }
    }
  })),
  
  setLoading: (loading) => set({ loading }),
  
  setError: (error) => set({ error }),
  
  setSuccess: (success) => set({ success }),
  
  setSelectedActivity: (activityId) => set({ selectedActivity: activityId }),
  
  // ============================================================
  // BULK SETTERS
  // ============================================================
  
  setGradeProgress: (grade, actividades, completadas) => set((state) => ({
    progress: {
      ...state.progress,
      [grade]: {
        actividades: state.progress[grade] ? state.progress[grade].actividades + actividades : actividades,
        completadas: state.progress[grade] ? state.progress[grade].completadas + completadas : completadas
      }
    }
  })),
  
  // ============================================================
  // GETTERS (Selectors)
  // ============================================================
  
  getGradeProgress: (grade) => {
    return get().progress[grade] || { actividades: 0, completadas: 0 }
  },
  
  getCurrentGrade: () => {
    return get().currentGrade
  },
  
  getActivitiesCompleted: (grade) => {
    return get().progress[grade]?.completadas || 0
  },
  
  getActivitiesTotal: (grade) => {
    return get().progress[grade]?.actividades || 0
  },
  
  // ============================================================
  // RESET
  // ============================================================
  
  reset: () => set({
    currentGrade: 1,
    progress: {
      1: { actividades: 0, completadas: 0 },
      2: { actividades: 0, completadas: 0 },
      3: { actividades: 0, completadas: 0 },
      4: { actividades: 0, completadas: 0 },
      5: { actividades: 0, completadas: 0 },
      6: { actividades: 0, completadas: 0 }
    },
    loading: false,
    error: null,
    success: null,
    selectedActivity: null
  }),
  
  clearError: () => set({ error: null }),
  
  clearSuccess: () => set({ success: null })
}))

export const primStore = usePrimStore

export default usePrimStore