const KEY = 'plaster_klipy_id'

export function getKlipyId(): string {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored) return stored
    const id = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'k_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem(KEY, id)
    return id
  } catch {
    return 'anon'
  }
}
