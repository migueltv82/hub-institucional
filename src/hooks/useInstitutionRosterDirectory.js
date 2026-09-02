import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchInstitutionRosterDirectory } from '../services/superAdminDashboard.js'

export function useInstitutionRosterDirectory({
  institutionId,
  audience,
  useRemote,
}) {
  return useQuery({
    queryKey: ['super-admin', 'institution-directory', useRemote, institutionId, audience],
    queryFn: () => fetchInstitutionRosterDirectory({
      institutionId,
      audience,
      useRemote,
    }),
    enabled: Boolean(institutionId),
    placeholderData: keepPreviousData,
  })
}
