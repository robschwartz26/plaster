/**
 * Client-side hashing for contact matching. Values are SHA-256 hashed
 * before leaving the device — no plaintext PII is ever sent to the server.
 * Discard hashes immediately after calling match_contacts(); never store
 * or log them.
 */

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
