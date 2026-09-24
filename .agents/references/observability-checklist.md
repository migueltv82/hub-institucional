# Observability Checklist

Use this checklist when adding or changing critical flows, integrations, scheduled work, imports, exports, background processing, or production support paths.

## Instrument What Matters

- Log meaningful lifecycle events for critical operations.
- Include correlation IDs or stable request/job identifiers when available.
- Record enough context to diagnose failures without exposing secrets or sensitive personal data.
- Capture error boundaries and rejected promises where the user or operator needs an actionable message.
- Prefer structured fields over long free-form strings for operational events.

## Do Not Log

- Passwords.
- Access tokens.
- Refresh tokens.
- Service role keys.
- API secrets.
- Full authorization headers.
- Sensitive user data that is not required to diagnose the failure.

## Failure Signals

For important flows, verify that a maintainer can answer:

- What operation failed?
- Which tenant or institution was affected, when safe to log?
- Which record or job was involved, when safe to log?
- Was the failure user-caused, validation-caused, dependency-caused, permission-caused, or unexpected?
- Can the operation be retried safely?

## Pre-Launch Gate

- Logs are useful but not noisy.
- Error messages do not reveal secrets or internal implementation details.
- Critical failures are surfaced to the user or operator.
- Retries and fallbacks are visible when they can affect correctness.
- Tests or manual verification cover the observable failure path when practical.
