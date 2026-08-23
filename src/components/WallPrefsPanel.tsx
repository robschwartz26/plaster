import { useState, useEffect } from 'react'
import { BottomSheet } from '@/components/BottomSheet'
import { CATEGORIES } from '@/lib/categories'
import { loadWallPrefs, saveWallPrefs, WALL_PREFS_EVENT, type WallPrefs } from '@/lib/wallPrefs'

// Settings → Personalize the wall. Three device-level knobs: which kinds of
// events even appear, chip legibility, and how far the grid zooms out.
// Changes save instantly (no confirm step) and the wall picks them up live.

const label: React.CSSProperties = {
  margin: '0 0 2px', fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 14, fontWeight: 700, color: 'var(--fg)',
}
const hint: React.CSSProperties = {
  margin: '0 0 10px', fontFamily: '"Space Grotesk", sans-serif',
  fontSize: 11.5, color: 'var(--fg-55)', lineHeight: 1.4,
}

// The controls alone — shared by the Settings sheet and the wall's own
// preferences (sliders) sheet, so changes are visible live behind either.
export function WallPrefsControls() {
  const [prefs, setPrefs] = useState<WallPrefs>(loadWallPrefs)

  // Two entry points (Settings sheet + wall preferences sheet) can both be
  // mounted — track the shared change event so neither shows stale state.
  useEffect(() => {
    const onChange = () => setPrefs(loadWallPrefs())
    window.addEventListener(WALL_PREFS_EVENT, onChange)
    return () => window.removeEventListener(WALL_PREFS_EVENT, onChange)
  }, [])

  function update(next: WallPrefs) {
    setPrefs(next)
    saveWallPrefs(next)
  }

  function toggleCat(cat: string) {
    const hidden = prefs.hiddenCats.includes(cat)
    update({
      ...prefs,
      hiddenCats: hidden ? prefs.hiddenCats.filter(c => c !== cat) : [...prefs.hiddenCats, cat],
    })
  }

  return (
      <div style={{ padding: '0 4px 8px' }}>
        <p style={{ margin: '0 0 16px', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12.5, color: 'var(--fg-55)', lineHeight: 1.5 }}>
          Make the wall yours. These live on this device and apply instantly.
        </p>

        {/* ── Wall zoom ── */}
        <p style={label}>Wall size</p>
        <p style={hint}>How many posters across — your default and the furthest the wall zooms out. Fewer means bigger.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {([3, 4, 5] as const).map(n => (
            <button
              key={n}
              onClick={() => update({ ...prefs, maxCols: n })}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10,
                border: `1.5px solid ${prefs.maxCols === n ? 'var(--fg)' : 'var(--fg-25)'}`,
                background: prefs.maxCols === n ? 'var(--fg)' : 'transparent',
                color: prefs.maxCols === n ? 'var(--bg)' : 'var(--fg-65)',
                fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {n} across
            </button>
          ))}
        </div>

        {/* ── Chip size ── */}
        <p style={label}>Filter chip size</p>
        <p style={hint}>Bigger chips are easier to read and tap.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['standard', 'large'] as const).map(s => (
            <button
              key={s}
              onClick={() => update({ ...prefs, chipSize: s })}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10,
                border: `1.5px solid ${prefs.chipSize === s ? 'var(--fg)' : 'var(--fg-25)'}`,
                background: prefs.chipSize === s ? 'var(--fg)' : 'transparent',
                color: prefs.chipSize === s ? 'var(--bg)' : 'var(--fg-65)',
                fontFamily: '"Space Grotesk", sans-serif',
                fontSize: s === 'large' ? 14 : 12, fontWeight: 700,
                cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* ── Categories ── */}
        <p style={label}>Your kinds of nights</p>
        <p style={hint}>Tap to hide a category — its chip and its events leave your wall. Tap again to bring it back.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          {CATEGORIES.map(cat => {
            const hidden = prefs.hiddenCats.includes(cat)
            return (
              <button
                key={cat}
                onClick={() => toggleCat(cat)}
                style={{
                  padding: '7px 12px', borderRadius: 8,
                  border: `1px solid ${hidden ? 'var(--fg-15)' : 'var(--fg-40)'}`,
                  background: hidden ? 'transparent' : 'var(--fg-08)',
                  color: hidden ? 'var(--fg-30)' : 'var(--fg)',
                  fontFamily: '"Barlow Condensed", sans-serif', fontSize: 13, fontWeight: 700,
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                  textDecoration: hidden ? 'line-through' : 'none',
                  cursor: 'pointer', transition: 'all 150ms ease',
                }}
              >
                {cat}
              </button>
            )
          })}
        </div>
        {prefs.hiddenCats.length > 0 && (
          <p style={{ margin: '8px 0 0', fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)' }}>
            Hiding {prefs.hiddenCats.length} {prefs.hiddenCats.length === 1 ? 'category' : 'categories'} from your wall.
          </p>
        )}
      </div>
  )
}

export function WallPrefsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Personalize the wall">
      <WallPrefsControls />
    </BottomSheet>
  )
}
