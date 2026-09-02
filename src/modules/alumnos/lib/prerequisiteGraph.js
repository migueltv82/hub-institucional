// Calcula, a partir de las correlativas DIRECTAS de cada materia (las que
// realmente estan cargadas en el Excel, una fila por par materia/correlativa
// inmediata), la cadena completa de requisitos: cuales son "inmediatas"
// (alcanza con regular para cursar) y cuales son "indirectas" -- heredadas
// transitivamente de la cadena, que exigen aprobada incluso para cursar.
//
// No hace falta cargar la correlativa "de mas atras" a mano en cada materia:
// alcanza con cargar el eslabon directo (ej: Ingles II -> Ingles I, Ingles I
// -> Didactica General) y esta funcion deriva sola que Didactica General es
// indirecta para Ingles II.
//
// Regla del instituto: para CURSAR alcanza con tener regular la inmediata (las
// indirectas deben estar aprobadas); para RENDIR el final, todas deben estar
// aprobadas sin importar si son inmediatas o indirectas.
//
// direct: Map<subjectKey, string[]> — codigos de correlativas DIRECTAS por materia.
export function classifyPrerequisites(direct) {
  const reachableCache = new Map()

  // DFS con marca temporal (Set vacio) para cortar ciclos sin recomputar.
  function reachableFrom(code) {
    if (reachableCache.has(code)) return reachableCache.get(code)

    reachableCache.set(code, new Set())
    const result = new Set()

    for (const next of direct.get(code) ?? []) {
      result.add(next)
      for (const transitive of reachableFrom(next)) result.add(transitive)
    }

    reachableCache.set(code, result)
    return result
  }

  const classification = new Map()

  for (const subjectKey of direct.keys()) {
    const immediate = Array.from(new Set(direct.get(subjectKey) ?? []))
    const immediateSet = new Set(immediate)
    const indirect = []
    const seenIndirect = new Set()

    for (const code of immediate) {
      for (const transitive of reachableFrom(code)) {
        if (immediateSet.has(transitive) || seenIndirect.has(transitive)) continue
        seenIndirect.add(transitive)
        indirect.push(transitive)
      }
    }

    classification.set(subjectKey, { immediate, indirect })
  }

  return classification
}
