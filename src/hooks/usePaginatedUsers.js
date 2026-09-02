import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getUsersDirectoryPage } from '../services/superAdmin.js'

export function useUsersDirectoryPage({ page, pageSize, searchTerm, selectedRole, useRemote }) {
  return useQuery({
    queryKey: ['super-admin', 'users-directory', useRemote, selectedRole, page, pageSize, searchTerm],
    queryFn: () => getUsersDirectoryPage({
      page,
      pageSize,
      searchTerm,
      selectedRole,
      useRemote,
    }),
    placeholderData: keepPreviousData,
  })
}

export const usePaginatedUsers = useUsersDirectoryPage
