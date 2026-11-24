// ── Chart palette ─────────────────────────────────────────────────────────────
// These are the validated default categorical steps, NOT Plaster's accent
// purple. #A855F7 stays on buttons and chrome: a brand colour used as a series
// colour stops meaning "the brand" and starts meaning "series 1", and the two
// readings fight every time both appear on screen.
//
// Validated with the skill's checker against Plaster's real surfaces — dark
// #0c0b0b and day #f0ece3 — not the reference surfaces:
//   dark  : all pass. worst adjacent CVD ΔE 8.4, normal-vision 19.8, contrast ≥3:1
//   light : all pass except contrast (orange 2.71, aqua 2.39, yellow 1.84 vs 3:1)
//
// That light-mode WARN is why every series carries a visible direct label. The
// relief rule is not optional: on the day theme, colour alone does not separate
// these lines, so the label is what makes the chart readable.

export interface ChartPalette {
  series: [string, string, string, string]
  grid: string
  axis: string
  text: string
  textMuted: string
  surface: string
}

const DARK: ChartPalette = {
  series: ['#3987e5', '#d95926', '#199e70', '#c98500'],
  grid: 'rgba(240,236,227,0.08)',
  axis: 'rgba(240,236,227,0.18)',
  text: 'var(--fg)',
  textMuted: 'var(--fg-40)',
  surface: '#0c0b0b',
}

const LIGHT: ChartPalette = {
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
  grid: 'rgba(12,11,11,0.08)',
  axis: 'rgba(12,11,11,0.18)',
  text: 'var(--fg)',
  textMuted: 'var(--fg-40)',
  surface: '#f0ece3',
}

export const paletteFor = (theme: 'night' | 'day'): ChartPalette =>
  theme === 'day' ? LIGHT : DARK
