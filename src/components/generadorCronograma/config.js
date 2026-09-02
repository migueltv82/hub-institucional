export const initialFiles = {
  masterWorkbook: null,
  docentesWorkbook: null,
  alumnosWorkbook: null,
  horarios: null,
  planes: null,
  correlatividades: null,
  alumnos: null,
  docentes: null,
  docenteMateria: null,
}

export function createInitialRegularCallRanges() {
  return {
    callCount: 2,
    first: {
      start: '',
      end: '',
    },
    second: {
      start: '',
      end: '',
    },
  }
}

export const initialEdicionMesa = {
  fechaIso: '',
  inicio: '',
  fin: '',
  examType: 'regular',
  profesorTitular: '',
  vocal1: '',
  vocal2: '',
  aula: '',
  observacionManual: '',
}

