import { type ReactNode, useEffect, useState, useRef, useCallback } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  height?: string          // fixed sheet height (e.g. '50vh') instead of content-sized up to 85vh
  backdropOpacity?: number // 0-1 backdrop dim; default 0.4 (use ~0.1 when the content behind should stay watchable)
}

export function BottomSheet({ open, onClose, title, children, height, backdropOpacity = 0.4 }: Props) {
  // Keep children mounted during the slide-out animation, then unmount.
  // This prevents closed-sheet inputs from firing autoFocus on mount.
  const [renderChildren, setRenderChildren] = useState(open)

  // Always-visible scroll thumb — iOS hides native scrollbars until you
  // scroll, so overflowing sheets got no "there's more below" hint at all.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ h: number; t: number } | null>(null)
  const updateThumb = useCallback(() => {
    const el = scrollRef.current
    if (!el || el.scrollHeight <= el.clientHeight + 4) { setThumb(null); return }
    const h = Math.max(36, (el.clientHeight * el.clientHeight) / el.scrollHeight)
    const t = (el.scrollTop / (el.scrollHeight - el.clientHeight)) * (el.clientHeight - h)
    setThumb({ h, t })
  }, [])
  useEffect(() => {
    if (!renderChildren) { setThumb(null); return }
    const el = scrollRef.current
    if (!el) return
    updateThumb()
    const ro = new ResizeObserver(updateThumb)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [renderChildren, updateThumb])

  useEffect(() => {
    if (open) {
      setRenderChildren(true)
    } else {
      const t = setTimeout(() => setRenderChildren(false), 350)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: `rgba(0,0,0,${backdropOpacity})`,
          zIndex: 99,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          height: height,
          maxHeight: height ?? '85vh',
          background: 'var(--bg)',
          borderRadius: '16px 16px 0 0',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, paddingBottom: 4, flexShrink: 0 }}>
          <div style={{ width: 36, height: 3, borderRadius: 1.5, background: 'var(--fg-18)' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px 12px',
          flexShrink: 0,
          borderBottom: '1px solid var(--fg-08)',
        }}>
          <span style={{
            fontFamily: '"Playfair Display", serif',
            fontWeight: 900,
            fontSize: 18,
            color: 'var(--fg)',
          }}>
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--fg-55)',
              fontSize: 22,
              padding: '4px 8px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          <div ref={scrollRef} onScroll={updateThumb} style={{ height: '100%', overflowY: 'auto', padding: '12px 16px 16px' }}>
            {renderChildren ? children : null}
          </div>
          {thumb && (
            <div style={{
              position: 'absolute', right: 3, top: thumb.t,
              width: 3, height: thumb.h, borderRadius: 2,
              background: 'var(--fg-25)', pointerEvents: 'none',
            }} />
          )}
        </div>
      </div>
    </>
  )
}
