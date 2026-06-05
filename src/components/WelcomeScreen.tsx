interface Props {
  avatarUrl: string | null
  onEnter: () => void
}

export function WelcomeScreen({ avatarUrl, onEnter }: Props) {
  return (
    <div
      onClick={onEnter}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0c0b0b',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 'calc(env(safe-area-inset-top) + 32px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 40px)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <style>{`
        @keyframes fadeScale {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Wordmark */}
      <div style={{
        alignSelf: 'flex-start',
        paddingLeft: 40,
        fontFamily: 'Georgia, serif',
        fontSize: 26,
        fontWeight: 700,
        color: '#f0ece3',
        animation: 'fadeIn 500ms ease-out both',
        animationDelay: '0ms',
      }}>
        plaster
      </div>

      {/* Hero — diamond + caption */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 28,
      }}>
        {/* Diamond border layer behind, then avatar layer on top */}
        <div style={{
          position: 'relative',
          width: 208,
          height: 208,
          animation: 'fadeScale 500ms ease-out both',
          animationDelay: '0ms',
        }}>
          {/* Border diamond (slightly larger, behind) */}
          <div style={{
            position: 'absolute',
            inset: 0,
            clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
            background: 'rgba(240,236,227,0.30)',
          }} />
          {/* Avatar diamond (4px inset to let border show) */}
          <div style={{
            position: 'absolute',
            inset: 4,
            clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
            background: '#1a1918',
            overflow: 'hidden',
          }}>
            {avatarUrl && (
              <img
                src={avatarUrl}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                  animation: 'fadeIn 500ms ease-out both',
                  animationDelay: '250ms',
                }}
                alt=""
              />
            )}
          </div>
        </div>

        {/* Caption */}
        <p style={{
          margin: 0,
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 13,
          fontWeight: 500,
          color: 'rgba(240,236,227,0.7)',
          letterSpacing: '4px',
          textAlign: 'center',
          animation: 'fadeUp 500ms ease-out both',
          animationDelay: '600ms',
        }}>
          WELCOME TO THE WALL.
        </p>
      </div>

      {/* Button + hint */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          animation: 'fadeIn 500ms ease-out both',
          animationDelay: '900ms',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onEnter}
          style={{
            width: 260,
            height: 52,
            borderRadius: 8,
            border: 'none',
            background: '#f0ece3',
            color: '#0c0b0b',
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Enter Plaster
        </button>
        <span style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 13,
          color: 'rgba(240,236,227,0.35)',
        }}>
          tap anywhere to continue
        </span>
      </div>
    </div>
  )
}
