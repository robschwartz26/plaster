export const CATEGORIES = [
  'Live Music',
  'Dance',
  'Comedy',
  'Drag',
  'Jazz',
  'Trivia',
  'Karaoke',
  'Theater',
  'Burlesque',
  'Classical',
  'Film',
  'Art',
  'Literary',
  'Other',
] as const

export type CategoryName = typeof CATEGORIES[number]

export const CATEGORY_GRADIENTS: Record<CategoryName, [string, string]> = {
  'Live Music': ['#4c1d95', '#7c3aed'],
  'Dance':      ['#7c2d12', '#f97316'],
  'Comedy':     ['#1e3a5f', '#38bdf8'],
  'Drag':       ['#831843', '#ec4899'],
  'Jazz':       ['#422006', '#b45309'],
  'Trivia':     ['#7c2d12', '#fb923c'],
  'Karaoke':    ['#4a044e', '#d946ef'],
  'Theater':    ['#1c1917', '#a8a29e'],
  'Burlesque':  ['#500724', '#be123c'],
  'Classical':  ['#1e293b', '#cbd5e1'],
  'Film':       ['#0c4a6e', '#38bdf8'],
  'Art':        ['#365314', '#a3e635'],
  'Literary':   ['#3730a3', '#818cf8'],
  'Other':      ['#2e1065', '#a855f7'],
}

// TODO: remove 'Music' shim once all DB rows are migrated to 'Live Music'
export function getGradient(category: string | null | undefined): [string, string] {
  if (category === 'Music') return CATEGORY_GRADIENTS['Live Music']
  return CATEGORY_GRADIENTS[category as CategoryName] ?? CATEGORY_GRADIENTS['Other']
}
