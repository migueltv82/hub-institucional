import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getInstitutionsPage } from '../services/superAdmin.js'

export function usePaginatedInstitutions({ page, pageSize, searchTerm, statusFilter = '', useRemote }) {
  return useQuery({
    queryKey: ['super-admin', 'institutions', useRemote, statusFilter, page, pageSize, searchTerm],
    queryFn: () => getInstitutionsPage({
      page,
      pageSize,
      searchTerm,
      statusFilter,
      useRemote,
    }),
    placeholderData: keepPreviousData,
  })
}
