import React from 'react'

interface State {
  hasError: boolean
  error: Error | null
}

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
    // TODO: wire up to a real error tracking service (Sentry, etc) when ready
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
          fontFamily: '"Space Grotesk", sans-serif',
          color: 'var(--fg)',
          background: 'var(--bg)',
        }}>
          <div style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: 32,
            fontWeight: 900,
            marginBottom: 8,
          }}>
            plaster
          </div>
          <p style={{ margin: '8px 0', fontSize: 15, maxWidth: 320 }}>
            Something went wrong on this screen.
          </p>
          <button
            onClick={this.reset}
            style={{
              marginTop: 16,
              padding: '10px 20px',
              border: 'none',
              borderRadius: 4,
              background: 'var(--fg)',
              color: 'var(--bg)',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <button
            onClick={() => { window.location.href = '/' }}
            style={{
              marginTop: 8,
              padding: '8px 16px',
              border: 'none',
              background: 'transparent',
              color: 'var(--fg-55)',
              fontFamily: 'inherit',
              fontSize: 13,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Go to wall
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
