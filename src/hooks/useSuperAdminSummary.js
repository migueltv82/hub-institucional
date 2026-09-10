import { useQuery } from '@tanstack/react-query'
import { fetchSuperAdminDashboardData } from '../services/superAdminDashboard.js'

export function useSuperAdminSummary({ useRemote, enabled = true }) {
  return useQuery({
    queryKey: ['super-admin', 'summary', useRemote],
    queryFn: () => fetchSuperAdminDashboardData({ useRemote }),
    enabled,
  })
}
