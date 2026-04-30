interface Props {
  url: string
  width?: number | null
  height?: number | null
  alt?: string
  maxWidth?: number
  borderRadius?: number | string
}

export function GifMessage({ url, width, height, alt = '', maxWidth = 200, borderRadius = 8 }: Props) {
  const aspectRatio = width && height && height > 0 ? width / height : undefined
  return (
    <div style={{
      position: 'relative',
      maxWidth,
      borderRadius,
      overflow: 'hidden',
      background: 'var(--fg-08)',
      display: 'inline-block',
      lineHeight: 0,
    }}>
      <img
        src={url}
        alt={alt}
        loading="lazy"
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          aspectRatio: aspectRatio ? String(aspectRatio) : undefined,
        }}
      />
      {/* KLIPY attribution watermark — required for production approval */}
      <img
        src="/klipy-watermark-white.svg"
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 6,
          bottom: 6,
          height: 12,
          width: 'auto',
          opacity: 0.7,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
