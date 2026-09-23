const forbiddenPublicEnvKeyPattern = /^VITE_(?:.*_)?SERVICE_ROLE/i

export function getPublicRuntimeEnvironmentIssues(env = import.meta.env) {
  const issues = []

  if (env.PROD && env.VITE_DISABLE_AUTH === 'true') {
    issues.push('VITE_DISABLE_AUTH=true no esta permitido en produccion.')
  }

  const leakedSecretKeys = Object.keys(env).filter((key) => (
    forbiddenPublicEnvKeyPattern.test(key) && Boolean(env[key])
  ))
  if (leakedSecretKeys.length > 0) {
    issues.push(
      `Variables privadas expuestas al frontend: ${leakedSecretKeys.join(', ')}. ` +
      'La service_role key solo puede vivir en Supabase Function secrets.',
    )
  }

  return issues
}

export function validatePublicRuntimeEnvironment(env = import.meta.env) {
  const issues = getPublicRuntimeEnvironmentIssues(env)

  if (issues.length > 0) {
    throw new Error(issues.join(' '))
  }
}
