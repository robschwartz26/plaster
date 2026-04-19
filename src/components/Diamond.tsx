interface Props {
  diamondUrl: string | null
  fallbackUrl?: string | null
  size: number
  onClick?: () => void
  altText?: string
}

export function Diamond({ diamondUrl, fallbackUrl, size, onClick, altText }: Props) {
  const src = diamondUrl ?? fallbackUrl ?? null
  const half = size / 2
  const inset = size * 0.05
  const pts = `${half},${inset} ${size - inset},${half} ${half},${size - inset} ${inset},${half}`

  if (!src) {
    return (
      <svg
        width={size} height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        onClick={onClick}
        style={{ flexShrink: 0, cursor: onClick ? 'pointer' : 'default', display: 'block' }}
      >
        <polygon points={pts} fill="var(--bg)" stroke="var(--fg-25)" strokeWidth="1.5" strokeDasharray="4 3" />
      </svg>
    )
  }

  return (
    <div
      onClick={onClick}
      style={{
        width: size, height: size,
        clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        overflow: 'hidden',
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
      }}
    >
      {/* Blurred backdrop fills corner gaps for non-square images */}
      <img
        src={src}
        aria-hidden="true"
        draggable={false}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover',
          filter: 'blur(16px) brightness(0.7)',
          transform: 'scale(1.3)',
          pointerEvents: 'none',
        }}
      />
      {/* Main image */}
      <img
        src={src}
        alt={altText}
        draggable={false}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', display: 'block',
          pointerEvents: 'none',
        }}
        onError={e => { e.currentTarget.style.display = 'none' }}
      />
    </div>
  )
}
