// Soft scoring ranks valid candidates without bypassing hard rules.

export const SOFT_RULE_SCORES = {
  SECOND_CALL_REPLICATION: 35,
  TWO_VOCALES: 20,
  ONE_VOCAL: 10,
  TEACHER_LOAD_BALANCE: 15,
  AVOID_A_DESIGNAR: 20,
}

export function buildCandidateScore({
  replicatesSecondCall = false,
  teacherLoadBalanced = false,
  usesADesignar = false,
  vocalesCount = 0,
} = {}) {
  const reasons = []
  let score = 0

  function add(condition, points, reason) {
    if (!condition) return
    score += points
    reasons.push({ reason, points })
  }

  add(replicatesSecondCall, SOFT_RULE_SCORES.SECOND_CALL_REPLICATION, 'Replicates first call logic.')
  add(vocalesCount >= 2, SOFT_RULE_SCORES.TWO_VOCALES, 'Assigns two vocales.')
  add(vocalesCount === 1, SOFT_RULE_SCORES.ONE_VOCAL, 'Assigns one vocal.')
  add(teacherLoadBalanced, SOFT_RULE_SCORES.TEACHER_LOAD_BALANCE, 'Balances teacher load.')
  add(!usesADesignar, SOFT_RULE_SCORES.AVOID_A_DESIGNAR, 'Avoids A designar.')

  return { score, reasons }
}

