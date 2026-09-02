export function isExamEngineAuditEnabled(env = import.meta.env) {
  return env?.DEV === true && env?.VITE_ENABLE_EXAM_ENGINE_AUDIT === 'true'
}

export default isExamEngineAuditEnabled
