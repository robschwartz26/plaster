import { useState, useRef, useEffect } from 'react'
import QRCode from 'qrcode'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { supabase } from '@/lib/supabase'
import { Diamond } from '@/components/Diamond'
import { FollowButton } from '@/components/FollowButton'
import { ensureContactsPermission, readDeviceContacts, normalizePhone, type DeviceContact } from '@/lib/contactHash'
import { openAppSettings } from '@/lib/pickImage'

interface Props {
  onDone: () => void
}

type ScreenState = 'consent' | 'loading' | 'results' | 'denied' | 'error'

interface MatchedUser {
  id: string
  username: string
  avatar_diamond_url: string | null
  avatar_url: string | null
  account_type: string
  matched_phone_hash: string | null
  matched_email_hash: string | null
}

// Stable key for a contact: name + first phone (used for selection Set)
function contactKey(c: DeviceContact): string {
  return `${c.name}|${c.phones[0] ?? ''}`
}

// Resolve `p`, but never wait longer than `ms` — fall back to `fallback`.
// Guards against a native plugin call that never settles.
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

// Live on the App Store as of Aug 2026 — invites point straight at the listing.
const APP_STORE_URL = 'https://apps.apple.com/us/app/plaster-the-wall/id6771572698'
const INVITE_TEXT = `Join me on Plaster — Portland's music & events app: ${APP_STORE_URL}`

// Manual invite: type a number → opens Messages with the invite prefilled.
// Works without contacts permission (it's just an sms: deep link — we never
// see or store the number). Shown on the results + denied screens.
function InviteByNumber() {
  const [num, setNum] = useState('')
  const normalized = normalizePhone(num)
  function send() {
    if (!normalized) return
    const sep = Capacitor.getPlatform() === 'android' ? '?' : '&'
    window.open(`sms:${normalized}${sep}body=${encodeURIComponent(INVITE_TEXT)}`, '_self')
    setNum('')
  }
  return (
    <div style={{ display: 'flex', gap: 8, padding: '4px 16px 10px' }}>
      <input
        type="tel"
        inputMode="tel"
        placeholder="Or text a number an invite…"
        value={num}
        onChange={e => setNum(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') send() }}
        style={{
          flex: 1, padding: '10px 14px', borderRadius: 10,
          border: '1px solid var(--fg-15)', background: 'var(--fg-08)',
          color: 'var(--fg)', fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 14, outline: 'none', boxSizing: 'border-box', minWidth: 0,
        }}
      />
      <button
        onClick={send}
        disabled={!normalized}
        style={{
          flexShrink: 0, padding: '0 16px', borderRadius: 10, border: 'none',
          background: normalized ? '#A855F7' : 'var(--fg-15)', color: '#fff',
          fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700,
          cursor: normalized ? 'pointer' : 'default',
        }}
      >
        Invite
      </button>
    </div>
  )
}

export function FindFriends({ onDone }: Props) {
  const [screen, setScreen] = useState<ScreenState>('consent')
  const [qrUrl, setQrUrl] = useState<string | null>(null)

  // QR → App Store listing. Generated locally (no network; CSP-safe), themed
  // to Plaster's palette.
  useEffect(() => {
    QRCode.toDataURL(APP_STORE_URL, { width: 360, margin: 1, color: { dark: '#0c0b0b', light: '#f0ece3' } })
      .then(setQrUrl)
      .catch(() => setQrUrl(null))
  }, [])
  const [matched, setMatched] = useState<MatchedUser[]>([])
  const [unmatched, setUnmatched] = useState<DeviceContact[]>([])
  const [contactNames, setContactNames] = useState<Map<string, string>>(new Map())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  // Build a map from key → DeviceContact for sendBulkInvite
  const contactById = useRef<Map<string, DeviceContact>>(new Map())

  // Apple 5.1.2 (informed consent): matching does NOT auto-run. The 'consent'
  // screen explains exactly what leaves the device (one-way hashes only) and
  // what happens server-side, and the user must explicitly tap "Find my
  // friends" before the iOS Contacts prompt ever fires. Declining skips the
  // feature entirely — no permission prompt, no data sent.

  async function runMatching() {
    try {
      setScreen('loading')

      // Contacts only exist on the native app. On web/localhost the Capacitor
      // plugin has no implementation and its calls can hang forever — so short-
      // circuit to the (empty) results screen instead of spinning.
      if (!Capacitor.isNativePlatform()) {
        setMatched([])
        setUnmatched([])
        setScreen('results')
        return
      }

      // Time-box the native calls so a stalled permission/read can never trap
      // the user on the spinner. Falls through to denied/empty on timeout.
      const perm = await withTimeout(ensureContactsPermission(), 12000, 'denied' as const)
      if (perm === 'denied') {
        setScreen('denied')
        return
      }

      const contacts = await withTimeout(readDeviceContacts(), 15000, [] as DeviceContact[])
      console.log('[FindFriends] read', contacts.length, 'contacts')

      // hash → contact name map
      const nameMap = new Map<string, string>()
      const idMap = new Map<string, DeviceContact>()
      for (const c of contacts) {
        const key = contactKey(c)
        idMap.set(key, c)
        for (const h of c.hashes) {
          if (!nameMap.has(h)) nameMap.set(h, c.name)
        }
      }
      setContactNames(nameMap)
      contactById.current = idMap

      const allHashes = [...new Set(contacts.flatMap(c => c.hashes))]
      let matchedUsers: MatchedUser[] = []
      const matchedKeys = new Set<string>()

      if (allHashes.length > 0) {
        const { data, error } = await supabase.rpc('match_contacts', { hashes: allHashes })
        if (error) console.error('[FindFriends] match_contacts error:', error)
        matchedUsers = (data ?? []) as MatchedUser[]
      }

      // Build set of contact keys already matched, to exclude from invite list
      for (const u of matchedUsers) {
        const matchHash = u.matched_phone_hash ?? u.matched_email_hash
        if (matchHash) {
          // Find which contact had this hash and mark its key
          for (const c of contacts) {
            if (c.hashes.includes(matchHash)) {
              matchedKeys.add(contactKey(c))
              break
            }
          }
        }
      }

      // Invite list: contacts with phones, excluding already-matched ones
      const inviteContacts = contacts
        .filter(c => c.phones.length > 0)
        .filter(c => !matchedKeys.has(contactKey(c)))

      setMatched(matchedUsers)
      setUnmatched(inviteContacts)
      setScreen('results')
    } catch (err) {
      console.error('[FindFriends] runMatching threw:', err)
      setScreen('error')
    }
  }

  function toggleContact(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function sendBulkInvite() {
    try {
      await Share.share({
        title: 'Join me on Plaster',
        text: "Follow me on Plaster — Portland's music & events app:",
        url: APP_STORE_URL,
      })
      console.log('[FindFriends] share sheet opened for', selected.size, 'selected contacts')
      setSelected(new Set())
    } catch (err) {
      console.error('[FindFriends] share threw:', err)
    }
  }

  const filteredUnmatched = search.trim()
    ? unmatched.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : unmatched

  // ── Consent (Apple 5.1.2 — informed opt-in BEFORE any data leaves) ──────
  // Two doors: search your contacts (explicit tap = consent; the one-liner
  // below the button discloses that anonymous codes are sent + discarded), or
  // just hand a friend the QR — straight to the App Store, zero data involved.
  if (screen === 'consent') {
    return (
      <div style={containerStyle}>
        <div style={{ ...centeredStyle, gap: 10 }}>
          <h2 style={headingStyle}>Find your friends</h2>
          <button onClick={() => runMatching()} style={{ ...primaryBtn, marginTop: 4 }}>
            Search contacts
          </button>
          <p style={{ ...bodyStyle, fontSize: 12, maxWidth: 300 }}>
            We never save or sell your contacts. Matching uses anonymous encrypted
            codes of numbers &amp; emails — checked once, instantly deleted.
          </p>

          <div style={{ width: '100%', maxWidth: 300, height: 1, background: 'var(--fg-15)', margin: '14px 0' }} />

          <p style={{ margin: 0, fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--fg)' }}>
            Or hand them Plaster
          </p>
          <p style={{ ...bodyStyle, fontSize: 12, margin: 0 }}>
            Have your friends scan this — it takes them to the App&nbsp;Store.
          </p>
          {qrUrl && (
            <img src={qrUrl} alt="App Store QR code" style={{ width: 180, height: 180, borderRadius: 12, marginTop: 4 }} />
          )}

          <button onClick={onDone} style={{ ...skipBtn, marginTop: 10 }}>Skip for now</button>
        </div>
      </div>
    )
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  // Always offer a way out — the user must never be trapped on the spinner.
  if (screen === 'loading') {
    return (
      <div style={containerStyle}>
        <div style={centeredStyle}>
          <h2 style={headingStyle}>Finding your friends on Plaster</h2>
          <p style={bodyStyle}>Matching contacts…</p>
          <Spinner />
          <button onClick={onDone} style={{ ...skipBtn, marginTop: 16 }}>Skip for now</button>
        </div>
      </div>
    )
  }

  // ── Denied ────────────────────────────────────────────────────────────────
  if (screen === 'denied') {
    return (
      <div style={containerStyle}>
        <div style={centeredStyle}>
          <h2 style={headingStyle}>Contacts access is off</h2>
          <p style={bodyStyle}>Enable contacts access for Plaster in Settings, or invite someone directly by number.</p>
          <button onClick={() => openAppSettings()} style={primaryBtn}>Open Settings</button>
          <div style={{ width: '100%' }}><InviteByNumber /></div>
          <button onClick={onDone} style={skipBtn}>Skip</button>
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (screen === 'error') {
    return (
      <div style={containerStyle}>
        <div style={centeredStyle}>
          <h2 style={headingStyle}>Something went wrong</h2>
          <p style={bodyStyle}>We couldn't read your contacts. You can try again or skip.</p>
          <button onClick={() => runMatching()} style={primaryBtn}>Try again</button>
          <button onClick={onDone} style={skipBtn}>Skip</button>
        </div>
      </div>
    )
  }

  // ── Results ───────────────────────────────────────────────────────────────
  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--fg-08)', flexShrink: 0 }}>
        <h2 style={{ ...headingStyle, textAlign: 'left', fontSize: 18, margin: 0 }}>
          Find your friends
        </h2>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>

        {/* On Plaster */}
        <div style={sectionHeaderStyle}>On Plaster ({matched.length})</div>
        {matched.length === 0 ? (
          <p style={{ margin: 0, padding: '10px 16px 14px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)', lineHeight: 1.5 }}>
            No one from your contacts is on Plaster yet — invite friends below to get started.
          </p>
        ) : (
          matched.map(u => {
            const matchHash = u.matched_phone_hash ?? u.matched_email_hash ?? ''
            const contactName = contactNames.get(matchHash) ?? null
            return (
              <div key={u.id} style={rowStyle}>
                <Diamond diamondUrl={u.avatar_diamond_url} fallbackUrl={u.avatar_url} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {contactName && (
                    <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 13, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {contactName}
                    </div>
                  )}
                  <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: contactName ? 400 : 700, fontSize: contactName ? 12 : 14, color: contactName ? 'var(--fg-55)' : 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    @{u.username}
                  </div>
                </div>
                <FollowButton targetUserId={u.id} size="small" />
              </div>
            )
          })
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--fg-08)', margin: '4px 0' }} />

        {/* Invite section */}
        <div style={sectionHeaderStyle}>Invite to Plaster ({unmatched.length})</div>

        {/* Manual invite — works even with no matching contacts */}
        <InviteByNumber />

        {/* Sticky search */}
        <div style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2, padding: '8px 16px 6px' }}>
          <input
            type="search"
            inputMode="search"
            placeholder="Search contacts"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid var(--fg-15)',
              background: 'var(--fg-08)',
              color: 'var(--fg)',
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {filteredUnmatched.length === 0 && unmatched.length > 0 && (
          <p style={{ margin: 0, padding: '10px 16px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>
            No contacts match "{search}"
          </p>
        )}
        {unmatched.length === 0 && (
          <p style={{ margin: 0, padding: '10px 16px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>
            No contacts to invite.
          </p>
        )}

        {filteredUnmatched.map(c => {
          const key = contactKey(c)
          const isSelected = selected.has(key)
          return (
            <div
              key={key}
              onClick={() => toggleContact(key)}
              style={{ ...rowStyle, cursor: 'pointer', userSelect: 'none' }}
            >
              {/* Checkbox */}
              <div style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                border: `2px solid ${isSelected ? 'var(--fg)' : 'var(--fg-25)'}`,
                background: isSelected ? 'var(--fg)' : 'transparent',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 120ms ease, border-color 120ms ease',
              }}>
                {isSelected && (
                  <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                    <path d="M1.5 5L5 8.5L11.5 1.5" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 14, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </div>
                {c.phones[0] && (
                  <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, color: 'var(--fg-55)', marginTop: 1 }}>
                    {c.phones[0]}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Bottom padding so last row clears the fixed footer */}
        <div style={{ height: 80 }} />
      </div>

      {/* Fixed footer */}
      <div style={{
        flexShrink: 0,
        padding: '10px 16px 16px',
        borderTop: '1px solid var(--fg-08)',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {selected.size > 0 ? (
          <button onClick={sendBulkInvite} style={primaryBtn}>
            Invite {selected.size} friend{selected.size === 1 ? '' : 's'}
          </button>
        ) : (
          <button onClick={onDone} style={primaryBtn}>Done</button>
        )}
        <button onClick={onDone} style={skipBtn}>Skip for now</button>
      </div>
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{
      width: 28,
      height: 28,
      borderRadius: '50%',
      border: '2.5px solid var(--fg-15)',
      borderTopColor: 'var(--fg-55)',
      animation: 'spin 0.8s linear infinite',
      marginTop: 8,
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--bg)',
}

const centeredStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 28px',
  gap: 12,
}

const headingStyle: React.CSSProperties = {
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 700,
  fontSize: 22,
  color: 'var(--fg)',
  margin: 0,
  textAlign: 'center',
}

const bodyStyle: React.CSSProperties = {
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 14,
  color: 'var(--fg-55)',
  lineHeight: 1.6,
  textAlign: 'center',
  margin: 0,
}

const primaryBtn: React.CSSProperties = {
  width: '100%',
  padding: '14px 0',
  borderRadius: 14,
  border: 'none',
  background: 'var(--fg)',
  color: 'var(--bg)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
}

const skipBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--fg-55)',
  fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 14,
  padding: '4px',
  cursor: 'pointer',
  textAlign: 'center',
  width: '100%',
}

const sectionHeaderStyle: React.CSSProperties = {
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 700,
  fontSize: 11,
  color: 'var(--fg-40)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  padding: '14px 16px 6px',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 16px',
  borderBottom: '1px solid var(--fg-08)',
}
