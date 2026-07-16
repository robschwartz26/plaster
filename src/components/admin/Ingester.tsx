import { useState } from 'react'
import { ImportForm } from '@/components/admin/ImportForm'
import { BatchImport } from '@/components/admin/BatchImport'
import { AutoIngest } from '@/components/admin/AutoIngest'

// Single = the default single-poster flow (untouched). Batch = many posters at
// once. Auto = the Firecrawl auto-ingester (admin only — the firecrawl-ingest
// edge fn gates is_admin). Single/Batch honour staffMode.
export function Ingester({ staffMode = false }: { staffMode?: boolean } = {}) {
  const [mode, setMode] = useState<'single' | 'batch' | 'auto'>('single')
  const tab = (m: 'single' | 'batch' | 'auto', label: string) => (
    <button onClick={() => setMode(m)} style={{ ...tabStyle, ...(mode === m ? tabActive : null) }}>{label}</button>
  )
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {tab('single', 'Single')}
        {tab('batch', 'Batch')}
        {!staffMode && tab('auto', 'Auto (URL)')}
      </div>
      {mode === 'single' ? <ImportForm staffMode={staffMode} />
        : mode === 'batch' ? <BatchImport staffMode={staffMode} />
        : <AutoIngest />}
    </div>
  )
}

const tabStyle: React.CSSProperties = { padding: '6px 16px', borderRadius: 6, border: '1px solid var(--fg-15)', background: 'transparent', color: 'var(--fg-40)', fontFamily: '"Space Grotesk", sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
const tabActive: React.CSSProperties = { border: '1px solid rgba(168,85,247,0.4)', background: 'rgba(168,85,247,0.1)', color: '#A855F7' }
