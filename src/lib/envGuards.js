const forbiddenPublicEnvKeys = [
  'VITE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'VITE_ADMIN_SERVICE_ROLE_KEY',
]

export function getPublicRuntimeEnvironmentIssues(env = import.meta.env) {
  const issues = []

  if (env.PROD && env.VITE_DISABLE_AUTH === 'true') {
    issues.push('VITE_DISABLE_AUTH=true no esta permitido en produccion.')
  }

  const leakedSecretKeys = forbiddenPublicEnvKeys.filter((key) => Boolean(env[key]))
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
