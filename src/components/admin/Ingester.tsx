import { useState } from 'react'
import { ImportForm } from '@/components/admin/ImportForm'
import { BatchImport } from '@/components/admin/BatchImport'

// Single is the default tab and the single-poster flow is untouched; Batch is the
// opt-in many-at-once mode. Both honour staffMode.
export function Ingester({ staffMode = false }: { staffMode?: boolean } = {}) {
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const tab = (m: 'single' | 'batch', label: string) => (
    <button onClick={() => setMode(m)} style={{ ...tabStyle, ...(mode === m ? tabActive : null) }}>{label}</button>
  )
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {tab('single', 'Single')}
        {tab('batch', 'Batch')}
      </div>
      {mode === 'single' ? <ImportForm staffMode={staffMode} /> : <BatchImport staffMode={staffMode} />}
    </div>
  )
}

const tabStyle: React.CSSProperties = { padding: '6px 16px', borderRadius: 6, border: '1px solid var(--fg-15)', background: 'transparent', color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
const tabActive: React.CSSProperties = { border: '1px solid rgba(168,85,247,0.4)', background: 'rgba(168,85,247,0.1)', color: '#A855F7' }
