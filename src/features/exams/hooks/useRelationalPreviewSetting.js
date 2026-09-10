import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { fetchRelationalPreviewSetting } from '../../../services/relationalExamPreview.js'

export function useRelationalPreviewSetting(institutionId, enabled = true) {
  const { user, isRemoteSession } = useAuth()
  return useQuery({
    queryKey: ['relational-preview-setting', user?.id, institutionId],
    queryFn: ({ signal }) => fetchRelationalPreviewSetting({ institutionId, signal }),
    enabled: Boolean(enabled && isRemoteSession && user?.id && institutionId),
    staleTime: 0,
    refetchInterval: 30_000,
    retry: false,
  })
}
