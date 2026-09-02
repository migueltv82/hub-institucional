import { useQuery } from '@tanstack/react-query'
import { fetchRosterAudit } from '../services/rosterAudit.js'

export function useRosterAudit({ institutionId, useRemote, workspaceKey = 'main' }) {
  return useQuery({
    queryKey: ['super-admin', 'roster-audit', useRemote, institutionId, workspaceKey],
    queryFn: () => fetchRosterAudit({
      institutionId,
      workspaceKey,
      useRemote,
    }),
    enabled: Boolean(institutionId),
  })
}
