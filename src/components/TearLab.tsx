import { TEARLAB, TEAR_TOGGLES, TEAR_LABELS, tearOn, setTear } from '@/lib/tearlab'

// Fixed overlay of tear-isolation toggles. Renders only with ?tearlab. Flipping a
// toggle persists to sessionStorage and reloads (the repro is "fresh load → 1-col →
// swipe", so a reload is the clean way to re-enter the test).
export function TearLab() {
  if (!TEARLAB) return null
  return (
    <div style={{
      position: 'fixed', top: 'max(8px, env(safe-area-inset-top))', left: 8, zIndex: 99999,
      background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '8px 10px',
      fontFamily: 'monospace', fontSize: 11, color: '#f0ece3', maxWidth: 230,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, letterSpacing: '0.04em' }}>TEAR LAB</div>
      {TEAR_TOGGLES.map(t => (
        <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', cursor: 'pointer' }}>
          <input
            type="checkbox"
            defaultChecked={tearOn(t)}
            onChange={e => { setTear(t, e.target.checked); window.location.reload() }}
          />
          <span>{TEAR_LABELS[t]}</span>
        </label>
      ))}
      <div style={{ marginTop: 6, opacity: 0.6, fontSize: 10 }}>toggle → reloads</div>
    </div>
  )
}
