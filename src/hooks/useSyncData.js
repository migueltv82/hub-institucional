import { useEffect, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

function buildChannelName({ schema, table, filter }) {
  const normalizedFilter = String(filter ?? 'all')
    .replace(/[^a-z0-9_=.-]/gi, '-')
    .slice(0, 80)

  return `sync:${schema}:${table}:${normalizedFilter}:${Math.random().toString(36).slice(2, 10)}`
}

export function useSyncData({
  enabled = true,
  filter,
  onChange,
  onDelete,
  onInsert,
  onUpdate,
  schema = 'public',
  table,
}) {
  const canSubscribe = Boolean(enabled && table && isSupabaseConfigured && supabase)
  const handlersRef = useRef({
    onChange,
    onDelete,
    onInsert,
    onUpdate,
  })
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    handlersRef.current = {
      onChange,
      onDelete,
      onInsert,
      onUpdate,
    }
  }, [onChange, onDelete, onInsert, onUpdate])

  useEffect(() => {
    if (!canSubscribe) {
      return undefined
    }

    const channel = supabase
      .channel(buildChannelName({ schema, table, filter }))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema,
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          const handlers = handlersRef.current

          handlers.onChange?.(payload)

          if (payload.eventType === 'INSERT') {
            handlers.onInsert?.(payload.new, payload)
            return
          }

          if (payload.eventType === 'UPDATE') {
            handlers.onUpdate?.(payload.new, payload.old, payload)
            return
          }

          if (payload.eventType === 'DELETE') {
            handlers.onDelete?.(payload.old, payload)
          }
        },
      )

    channel.subscribe((nextStatus) => {
      setStatus(String(nextStatus).toLowerCase())
    })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [canSubscribe, filter, schema, table])

  const effectiveStatus = canSubscribe
    ? (status === 'idle' ? 'connecting' : status)
    : 'disabled'

  return {
    isSubscribed: effectiveStatus === 'subscribed',
    status: effectiveStatus,
  }
}

export default useSyncData
