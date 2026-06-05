/**
 * Client-side hashing for contact matching. Values are SHA-256 hashed
 * before leaving the device — no plaintext PII is ever sent to the server.
 * Discard hashes immediately after calling match_contacts(); never store
 * or log them.
 */
import { Contacts } from '@capacitor-community/contacts'

/**
 * Normalize a raw phone string to E.164 (+1XXXXXXXXXX for US numbers).
 * Returns null if the input cannot be mapped to a plausible number.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')

  if (digits.length === 10) {
    // Bare 10-digit US number — assume +1
    return `+1${digits}`
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    // 11-digit with leading country code 1
    return `+${digits}`
  }
  if (raw.trim().startsWith('+') && digits.length >= 7 && digits.length <= 15) {
    // Already E.164-looking (international)
    return `+${digits}`
  }
  return null
}

/** SHA-256 hash of a UTF-8 string, returned as lowercase hex. */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Hash a raw phone string after E.164 normalization.
 * Returns null if the number cannot be normalized.
 */
export async function hashPhone(raw: string): Promise<string | null> {
  const normalized = normalizePhone(raw)
  if (!normalized) return null
  return sha256Hex(normalized)
}

/** Hash an email address (lowercased + trimmed before hashing). */
export async function hashEmail(raw: string): Promise<string> {
  return sha256Hex(raw.toLowerCase().trim())
}

// ── Contact reading ──────────────────────────────────────────────────────────

export interface DeviceContact {
  name: string
  phones: string[]
  emails: string[]
  /** SHA-256 hex of each normalized phone + lowercased email. */
  hashes: string[]
}

/**
 * Checks and requests contacts permission if needed.
 * Returns 'granted' (includes 'limited'), 'denied', or 'prompt' (if the
 * system is still deciding after a request — shouldn't happen normally).
 */
export async function ensureContactsPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    const { contacts: state } = await Contacts.checkPermissions()
    console.log('[contactHash] checkPermissions returned:', state)
    if (state === 'granted' || state === 'limited') return 'granted'
    if (state === 'denied') return 'denied'

    // 'prompt' or 'prompt-with-rationale' — request
    const { contacts: granted } = await Contacts.requestPermissions()
    console.log('[contactHash] requestPermissions returned:', granted)
    if (granted === 'granted' || granted === 'limited') return 'granted'
    if (granted === 'denied') return 'denied'
    return 'prompt'
  } catch (err) {
    console.error('[contactHash] ensureContactsPermission threw:', err)
    return 'denied'
  }
}

/**
 * Reads device contacts and returns them with pre-computed match hashes.
 * Caller must have already confirmed permission. Never logs raw contact data.
 * Returns [] on any error.
 */
export async function readDeviceContacts(): Promise<DeviceContact[]> {
  try {
    const { contacts: raw } = await Contacts.getContacts({
      projection: { name: true, phones: true, emails: true },
    })

    const results: DeviceContact[] = []
    for (const c of raw) {
      const phones = (c.phones ?? [])
        .map(p => p.number)
        .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)

      const emails = (c.emails ?? [])
        .map(e => e.address)
        .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)

      if (phones.length === 0 && emails.length === 0) continue

      const name = c.name?.display
        || c.name?.given
        || phones[0]
        || emails[0]
        || 'Unknown'

      const hashes: string[] = []
      for (const phone of phones) {
        const h = await hashPhone(phone)
        if (h) hashes.push(h)
      }
      for (const email of emails) {
        hashes.push(await hashEmail(email))
      }

      results.push({ name, phones, emails, hashes })
    }
    return results
  } catch (err) {
    console.error('[contactHash] readDeviceContacts threw:', err)
    return []
  }
}
