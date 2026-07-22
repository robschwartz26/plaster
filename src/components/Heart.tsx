import type { CSSProperties } from 'react'

/**
 * Heart — the shared heart glyph, as an inline SVG (fill: currentColor).
 *
 * Design rule: hearts are NEVER red, anywhere. The Unicode ♥ (U+2665) can't be
 * trusted for this: Android's system emoji font substitutes a RED emoji glyph
 * for U+2665 regardless of CSS color — even with the ︎ text-presentation
 * selector. An inline SVG takes its color purely from CSS `currentColor`, so the
 * heart is always the surrounding foreground color on every platform (iOS looks
 * the same: a solid fg-colored heart). Use this everywhere a ♥ is DISPLAYED.
 *
 * `size` defaults to 1em so it scales with the surrounding font-size; pass an
 * explicit px value to match a specific glyph's visual size.
 */
export function Heart({ size = '1em', style }: { size?: number | string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: '-0.125em', flexShrink: 0, ...style }}
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  )
}
