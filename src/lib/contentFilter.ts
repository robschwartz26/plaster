// ─────────────────────────────────────────────────────────────────────────
// Objectionable-content filter — Apple App Store Guideline 1.2 compliance.
//
// A single shared gate used at EVERY user-generated-content entry point:
// direct/group messages, event-wall (community) posts, usernames, and bios.
// Nothing objectionable should be able to be posted through the app UI.
//
// This is, by necessity, a blocklist: the slur/profanity strings below exist
// ONLY so we can detect and reject them. It is deliberately weighted toward
// hate speech, slurs, sexual/abusive content, and self-harm encouragement —
// the categories Apple cares about — and intentionally does NOT block ordinary
// casual profanity ("this set is fucking great"), which is part of the app's
// voice. Tune the lists below if that balance needs to shift.
//
// Evasion handling (normalize):
//   • case, accents/diacritics            → "FÜCK" == "fuck"
//   • leetspeak                           → "f4gg0t" == "faggot"
//   • padded repeats                      → "fuuuuck" == "fuck"
//   • separators (dots/spaces/dashes)     → "f.u.c.k" / "f u c k" == "fuck"
//
// False-positive handling (Scunthorpe problem):
//   • SLUR_SUBSTRINGS is a hand-verified set of terms with NO common innocent
//     host word — matched anywhere in the condensed text (beats spaced-out
//     evasion like "n i g g e r").
//   • Everything ambiguous (chink, coon, retard, cunt, spic, …) and all general
//     profanity is matched on WHOLE-WORD token boundaries only, so "class",
//     "assess", "suspicious", "raccoon", "fire-retardant", "Scunthorpe" pass.
// ─────────────────────────────────────────────────────────────────────────

export type ModerationCategory = 'slur' | 'hate' | 'sexual' | 'self_harm' | 'profanity'
export interface ModerationResult {
  ok: boolean
  category?: ModerationCategory
}

// Leetspeak / symbol → letter map, applied before matching.
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g',
  '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i',
  '|': 'i', '£': 'e', '€': 'e', '+': 't',
}

function deaccent(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '')
}

function mapLeet(s: string): string {
  return s.replace(/[013456789@$!|£€+]/g, c => LEET[c] ?? c)
}

// Collapse any run of 3+ identical chars down to one ("fuuuck" → "fuck").
// Doubles are left intact so real words keep their spelling.
function collapseRepeats(s: string): string {
  return s.replace(/(.)\1{2,}/g, '$1')
}

// Condensed form: lowercase, de-accented, leet-mapped, letters-only, repeats
// collapsed. "f.u.c.k y0u" → "fuckyou". Used for obfuscation-tolerant
// substring matching of unambiguous terms + multi-word phrases.
function condense(s: string): string {
  return collapseRepeats(mapLeet(deaccent(s.toLowerCase())).replace(/[^a-z]/g, ''))
}

// Whole-word tokens: lowercase, de-accented, leet-mapped, split on non-letters,
// each token's repeats collapsed. Used for boundary-safe matching.
function tokenize(s: string): string[] {
  return mapLeet(deaccent(s.toLowerCase()))
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(collapseRepeats)
}

// ── Term lists ────────────────────────────────────────────────────────────

// Verified to have no common innocent host word → safe to match as substrings
// (this is what defeats "n i g g e r" / "f a g g o t" spacing evasion).
const SLUR_SUBSTRINGS: Array<[string, ModerationCategory]> = [
  ['nigger', 'slur'], ['nigga', 'slur'], ['faggot', 'slur'], ['kike', 'slur'],
  ['jigaboo', 'slur'], ['wetback', 'slur'], ['towelhead', 'slur'],
  ['raghead', 'slur'], ['porchmonkey', 'slur'], ['sandnigger', 'slur'],
  ['chingchong', 'slur'], ['tranny', 'slur'], ['shemale', 'sexual'],
  ['fag', 'slur'], // no innocent English host word; catches "f.a.g" spacing evasion
]

// Objectionable phrases (self-harm encouragement, harassment) — condensed
// substring so spacing/punctuation can't slip them past.
const PHRASE_SUBSTRINGS: Array<[string, ModerationCategory]> = [
  ['killyourself', 'self_harm'], ['killurself', 'self_harm'],
  ['neckyourself', 'self_harm'], ['kysnow', 'self_harm'],
]

// Ambiguous slurs (have innocent homographs or hosts) + general hard/abusive
// and sexual profanity — matched ONLY on whole-word boundaries.
const WORD_TERMS: Array<[string, ModerationCategory]> = [
  // ambiguous slurs — boundary-only so hosts (raccoon, suspicious, retardant…) pass
  ['spic', 'slur'], ['coon', 'slur'], ['chink', 'slur'], ['gook', 'slur'],
  ['kaffir', 'slur'], ['dyke', 'slur'], ['retard', 'slur'], ['spaz', 'slur'],
  ['paki', 'slur'], ['wop', 'slur'], ['dago', 'slur'],
  ['injun', 'slur'], ['redskin', 'slur'], ['beaner', 'slur'], ['gyp', 'slur'],
  ['zipperhead', 'slur'], ['kys', 'self_harm'],
  // sexual / abusive (deliberately excludes mild/name-colliding words like
  // dick, cock, cum — Apple cares about explicit/abusive, not anatomy or names)
  ['cunt', 'sexual'], ['whore', 'sexual'], ['slut', 'sexual'], ['jizz', 'sexual'],
  ['twat', 'sexual'], ['rape', 'sexual'], ['molest', 'sexual'],
  ['pedo', 'sexual'], ['pedophile', 'sexual'],
  ['asshole', 'profanity'], ['motherfucker', 'profanity'], ['dickhead', 'profanity'],
  ['douchebag', 'profanity'],
]

// Whole-word suffixes we still treat as the same term (plurals, -er, -ing…).
const SUFFIXES = ['', 's', 'es', 'er', 'ers', 'ing', 'ed', 'in', 'y', 'a', 'as', 'az', 'z', 'ah']

// Precompute the exact token forms that trip each WORD_TERM.
const WORD_LOOKUP: Map<string, ModerationCategory> = (() => {
  const m = new Map<string, ModerationCategory>()
  for (const [root, cat] of WORD_TERMS) {
    for (const suf of SUFFIXES) m.set(root + suf, cat)
  }
  return m
})()

/**
 * Test a piece of user text for objectionable content.
 * Returns { ok: true } when clean, or { ok: false, category } when it should
 * be rejected. Safe on empty/undefined input.
 */
export function moderateText(input: string | null | undefined): ModerationResult {
  if (!input) return { ok: true }

  const condensed = condense(input)
  for (const [term, cat] of SLUR_SUBSTRINGS) {
    if (condensed.includes(term)) return { ok: false, category: cat }
  }
  for (const [phrase, cat] of PHRASE_SUBSTRINGS) {
    if (condensed.includes(phrase)) return { ok: false, category: cat }
  }
  for (const tok of tokenize(input)) {
    const cat = WORD_LOOKUP.get(tok)
    if (cat) return { ok: false, category: cat }
  }
  return { ok: true }
}

/** Convenience boolean. */
export function isObjectionable(input: string | null | undefined): boolean {
  return !moderateText(input).ok
}

// User-facing rejection copy per category (never echoes the flagged term).
const CATEGORY_MESSAGE: Record<ModerationCategory, string> = {
  slur: 'That looks like a slur — Plaster doesn’t allow hateful language.',
  hate: 'That looks like hate speech, which isn’t allowed on Plaster.',
  sexual: 'That contains explicit language that isn’t allowed here.',
  self_harm: 'We don’t allow content that encourages self-harm. If you’re struggling, please reach out to someone — you matter.',
  profanity: 'Please take out the abusive language before posting.',
}

/**
 * Friendly, non-echoing message to show when text is rejected. Pass a noun
 * ("message", "post", "bio", "username") for a slightly tailored fallback.
 */
export function moderationMessage(result: ModerationResult, noun = 'message'): string {
  if (result.ok) return ''
  if (result.category) return CATEGORY_MESSAGE[result.category]
  return `That ${noun} contains language that isn’t allowed on Plaster.`
}
