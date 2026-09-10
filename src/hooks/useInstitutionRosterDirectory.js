import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchInstitutionRosterDirectory } from '../services/superAdminDashboard.js'

export function useInstitutionRosterDirectory({
  institutionId,
  audience,
  useRemote,
  enabled = true,
}) {
  return useQuery({
    queryKey: ['super-admin', 'institution-directory', useRemote, institutionId, audience],
    queryFn: () => fetchInstitutionRosterDirectory({
      institutionId,
      audience,
      useRemote,
    }),
    enabled: Boolean(enabled && institutionId),
    placeholderData: keepPreviousData,
  })
}
