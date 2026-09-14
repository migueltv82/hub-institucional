const listeners = new Set()

function normalizeNotice(notice = {}) {
  if (typeof notice === 'string') {
    return {
      id: `notice-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      tone: 'info',
      title: 'Aviso importante',
      message: notice,
      details: [],
      actionLabel: 'Entendido',
    }
  }

  return {
    id: notice.id || `notice-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    tone: notice.tone || 'info',
    title: notice.title || 'Aviso importante',
    message: notice.message || '',
    details: Array.isArray(notice.details) ? notice.details.filter(Boolean) : [],
    actionLabel: notice.actionLabel || 'Entendido',
  }
}

export function subscribeImportantNotices(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function showImportantNotice(notice) {
  const normalized = normalizeNotice(notice)
  listeners.forEach((listener) => listener(normalized))
  return normalized
}
