import { useQuery } from '@tanstack/react-query'
import { fetchSuperAdminDashboardData } from '../services/superAdminDashboard.js'

export function useSuperAdminSummary({ useRemote }) {
  return useQuery({
    queryKey: ['super-admin', 'summary', useRemote],
    queryFn: () => fetchSuperAdminDashboardData({ useRemote }),
  })
}
