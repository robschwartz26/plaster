import { createContext, useContext } from 'react'

// Lets any admin surface (e.g. Upload history rows) ask the StaffPreview panel to
// pop a specific event up in the live-app view. StaffScreen provides the impl
// (sets the focused id + opens the Preview panel); StaffPreview consumes
// focusEventId to render the popup. Default is a no-op so consumers rendered
// outside the provider are harmless.
interface StaffPreviewFocusValue {
  focusEventId: string | null
  requestFocus: (eventId: string) => void
  clearFocus: () => void
}

const StaffPreviewFocusContext = createContext<StaffPreviewFocusValue>({
  focusEventId: null,
  requestFocus: () => {},
  clearFocus: () => {},
})

export const StaffPreviewFocusProvider = StaffPreviewFocusContext.Provider
export function useStaffPreviewFocus() { return useContext(StaffPreviewFocusContext) }
