const IS_ENABLED = new URLSearchParams(window.location.search).has('debug')

interface Props {
  logs: string[]
  open: boolean
  onToggle: () => void
}

export function DebugOverlay({ logs, open, onToggle }: Props) {
  if (!IS_ENABLED) return null

  if (!open) {
    return (
      <button
        onClick={onToggle}
        style={{
          position: 'absolute', top: 12, left: 12, zIndex: 40,
          background: 'rgba(0,0,0,0.65)', borderRadius: 4,
          padding: '3px 7px', border: 'none', cursor: 'pointer',
          fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 9, color: 'rgba(255,255,255,0.6)',
        }}
      >
        debug
      </button>
    )
  }

  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, zIndex: 40,
      background: 'rgba(0,0,0,0.75)', borderRadius: 4,
      maxWidth: 240, padding: '6px 8px',
      fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10, color: '#fff',
      lineHeight: 1.3, maxHeight: 180, overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ opacity: 0.5, fontSize: 9 }}>debug</span>
        <button onClick={onToggle} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
      </div>
      {logs.length === 0
        ? <div style={{ opacity: 0.4 }}>no logs yet</div>
        : logs.map((line, i) => <div key={i} style={{ wordBreak: 'break-all' }}>{line}</div>)
      }
    </div>
  )
}
