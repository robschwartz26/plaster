import { useState, useEffect, useRef } from 'react'
import { Share } from '@capacitor/share'
import { supabase } from '@/lib/supabase'
import { Diamond } from '@/components/Diamond'
import { FollowButton } from '@/components/FollowButton'
import { ensureContactsPermission, readDeviceContacts, type DeviceContact } from '@/lib/contactHash'
import { openAppSettings } from '@/lib/pickImage'

interface Props {
  onDone: () => void
}

type ScreenState = 'softening' | 'loading' | 'results' | 'denied' | 'error'

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

export function FindFriends({ onDone }: Props) {
  const [screen, setScreen] = useState<ScreenState>('softening')
  const [matched, setMatched] = useState<MatchedUser[]>([])
  const [unmatched, setUnmatched] = useState<DeviceContact[]>([])
  const [contactNames, setContactNames] = useState<Map<string, string>>(new Map())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const hasRun = useRef(false)

  // Build a map from key → DeviceContact for sendBulkInvite
  const contactById = useRef<Map<string, DeviceContact>>(new Map())

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    // Brief softener before triggering the permission prompt
    const timer = setTimeout(() => runMatching(), 700)
    return () => clearTimeout(timer)
  }, [])

  async function runMatching() {
    try {
      setScreen('loading')

      const perm = await ensureContactsPermission()
      if (perm === 'denied') {
        setScreen('denied')
        return
      }

      const contacts = await readDeviceContacts()
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
        url: 'https://plasterthewall.com',
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

  // ── Softening ─────────────────────────────────────────────────────────────
  if (screen === 'softening') {
    return (
      <div style={containerStyle}>
        <div style={centeredStyle}>
          <h2 style={headingStyle}>Finding your friends on Plaster</h2>
          <p style={bodyStyle}>Checking your contacts…</p>
          <Spinner />
        </div>
      </div>
    )
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <div style={containerStyle}>
        <div style={centeredStyle}>
          <h2 style={headingStyle}>Finding your friends on Plaster</h2>
          <p style={bodyStyle}>Matching contacts…</p>
          <Spinner />
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
          <p style={bodyStyle}>Enable contacts access for Plaster in Settings, or skip for now.</p>
          <button onClick={() => openAppSettings()} style={primaryBtn}>Open Settings</button>
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
          <button onClick={() => { hasRun.current = false; runMatching() }} style={primaryBtn}>Try again</button>
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
