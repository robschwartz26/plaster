import type { CSSProperties } from 'react'
import { splitLinks, linkLabel } from '@/lib/linkify'

// One place that renders an event blurb, shared by the live info page and the
// staff preview so the preview can't drift from what publishes.
//
// Two behaviours the raw text cannot express on its own:
//   • breaks — opt-in per event (events.description_breaks). Off means newlines
//     collapse, which is how every blurb written before this read.
//   • links — http(s) URLs become real anchors. They open in a new tab, which
//     Capacitor hands to the system browser on a phone, the same way the venue
//     website link on a profile already does.
export function DescriptionText({ text, breaks, style }: {
  text: string
  breaks?: boolean | null
  style?: CSSProperties
}) {
  return (
    <p style={{ ...style, whiteSpace: breaks ? 'pre-line' : undefined }}>
      {splitLinks(text).map((part, i) =>
        part.kind === 'link' ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            // The info page sits on a card that responds to taps and swipes —
            // following a link must not also trigger the card underneath.
            onClick={e => e.stopPropagation()}
            style={{ color: '#A855F7', textDecoration: 'underline', wordBreak: 'break-word' }}
          >
            {linkLabel(part.value)}
          </a>
        ) : (
          part.value
        ),
      )}
    </p>
  )
}
