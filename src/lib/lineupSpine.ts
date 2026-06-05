import { useState, useEffect } from 'react'

// Tiny pub/sub so LineUpScreen can publish spine state and BottomNav can read it
// without prop-drilling or a full context. Pattern mirrors useTheme.

type SpineState = { count: number; reachesBottom: boolean }

const _listeners = new Set<(s: SpineState) => void>()
let _state: SpineState = { count: 0, reachesBottom: false }

export function publishSpineState(count: number, reachesBottom: boolean) {
  _state = { count, reachesBottom }
  _listeners.forEach(l => l(_state))
}

export function useSpineState(): SpineState {
  const [state, setState] = useState<SpineState>(_state)
  useEffect(() => {
    _listeners.add(setState)
    return () => { _listeners.delete(setState) }
  }, [])
  return state
}
