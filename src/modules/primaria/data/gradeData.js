export const gradeData = {
  1: {
    id: 1,
    nombre: "1° de Primaria",
    nivel: "primer_ciclo",
    moduloLectura: {
      comprensionFrases: { id: "lit-1", titulo: "Comprensión de frases", actividades: 4, tipo: "reading" },
      vocabularioBasico: { id: "voc-1", titulo: "Vocabulario básico", actividades: 3, tipo: "vocabulary" },
      descodificacionBisi: { id: "dec-1", titulo: "Descodificación bisilábicas", actividades: 5, tipo: "decoding" }
    },
    moduloMatematicas: {
      operacionesBasicas: { id: "math-1", titulo: "Operaciones básicas", actividades: 6, tipo: "math" }
    },
    moduloGeneral: {
      concienciaCiudadana: { id: "civ-1", titulo: "Conciencia ciudadana", actividades: 3, tipo: "social" }
    }
  },
  
  2: {
    id: 2,
    nombre: "2° de Primaria",
    nivel: "primer_ciclo",
    moduloLectura: {
      comprensionInstrucciones: { id: "lit-2", titulo: "Comprensión de instrucciones", actividades: 5, tipo: "reading" },
      lecturaTextosInformativos: { id: "lit-2b", titulo: "Lectura de textos informativos", actividades: 4, tipo: "reading" },
      fablesMoraleja: { id: "fable-2", titulo: "Fábulas y moraleja", actividades: 3, tipo: "reading" }
    },
    moduloMatematicas: {
      multiplicacionIntro: { id: "math-2", titulo: "Multiplicación introductoria", actividades: 5, tipo: "math" }
    }
  },
  
  3: {
    id: 3,
    nombre: "3° de Primaria",
    nivel: "segundo_ciclo",
    moduloLectura: {
      comprehensionMetaphors: { id: "lit-3", titulo: "Comprensión de metáforas", actividades: 4, tipo: "reading" },
      biografiasSimplificadas: { id: "bio-3", titulo: "Biografías simplificadas", actividades: 3, tipo: "reading" },
      metodoSocratico: { id: "soc-3", titulo: "Método socrático", actividades: 5, tipo: "critical_thinking" }
    },
    moduloMatematicas: {
      fraccionesBasicas: { id: "math-3", titulo: "Fracciones básicas", actividades: 4, tipo: "math" }
    }
  },
  
  4: {
    id: 4,
    nombre: "4° de Primaria",
    nivel: "segundo_ciclo",
    moduloLectura: {
      analisisTexto: { id: "lit-4", titulo: "Análisis de texto", actividades: 5, tipo: "reading" },
      vocabularioTechnico: { id: "voc-4", titulo: "Vocabulario técnico", actividades: 4, tipo: "vocabulary" },
      probabilidadBasica: { id: "prob-4", titulo: "Probabilidad básica", actividades: 3, tipo: "math" }
    }
  },
  
  5: {
    id: 5,
    nombre: "5° de Primaria",
    nivel: "tercer_ciclo",
    moduloLectura: {
      comprehensionAvanzada: { id: "lit-5", titulo: "Comprensión avanzada", actividades: 5, tipo: "reading" },
      resolucionProblemas: { id: "res-5", titulo: "Resolución de problemas", actividades: 4, tipo: "math" },
      proyectosIntegrados: { id: "proj-5", titulo: "Proyectos integrados", actividades: 6, tipo: "project" }
    }
  },
  
  6: {
    id: 6,
    nombre: "6° de Primaria",
    nivel: "tercer_ciclo",
    moduloLectura: {
      criticaYSintesis: { id: "lit-6", titulo: "Crítica y síntesis", actividades: 5, tipo: "reading" },
      preparacionSecundaria: { id: "pre-6", titulo: "Preparación secundaria", actividades: 4, tipo: "transition" },
      evaluacionIntegral: { id: "eje-6", titulo: "Evaluación integral", actividades: 6, tipo: "assessment" }
    }
  }
}

// Exportar también un arreglo ordenado por grado para iteración fácil
export const gradesOrdered = [1, 2, 3, 4, 5, 6]