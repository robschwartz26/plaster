// Event descriptions arrive as plain text, and they routinely carry a URL — a
// tinyurl to the full drink list, a ticket link, an Instagram page. Rendered as
// text those are dead characters, and on a phone there is no way to follow one.
//
// This splits a blurb into text and link runs so the info page can render real
// anchors. It is deliberately conservative:
//
//   • only http:// and https:// — never javascript:, data:, file: or a bare
//     "www." guess. The description is written by an AI extractor reading someone
//     else's poster, so the text is untrusted; an anchor is the only thing we
//     ever build from it, and only for schemes that can't execute.
//   • trailing punctuation is left out of the link. A sentence ending
//     "...see tinyurl.com/abc." should not put the period inside the href, and a
//     link inside parens shouldn't swallow the closer.

export type LinkPart =
  | { kind: 'text'; value: string }
  | { kind: 'link'; value: string; href: string }

// http(s) only. Stop at whitespace or an angle bracket; trailing junk is trimmed
// below rather than excluded here, so the regex stays readable.
const URL_RE = /https?:\/\/[^\s<>]+/gi

// Punctuation that commonly follows a URL in prose and is virtually never part
// of it. Closing brackets are only trimmed when unbalanced, so a legitimate
// "…/wiki/Foo_(bar)" survives.
function trimTrailing(raw: string): string {
  let url = raw
  for (;;) {
    const last = url[url.length - 1]
    if (!last) break
    if ('.,;:!?\'"'.includes(last)) { url = url.slice(0, -1); continue }
    if (last === ')' || last === ']' || last === '}') {
      const open = last === ')' ? '(' : last === ']' ? '[' : '{'
      const opens = url.split(open).length - 1
      const closes = url.split(last).length - 1
      if (closes > opens) { url = url.slice(0, -1); continue }
    }
    break
  }
  return url
}

export function splitLinks(text: string): LinkPart[] {
  const parts: LinkPart[] = []
  let cursor = 0
  URL_RE.lastIndex = 0
  for (let m = URL_RE.exec(text); m; m = URL_RE.exec(text)) {
    const url = trimTrailing(m[0])
    if (!url) continue
    const start = m.index
    const end = start + url.length
    if (start > cursor) parts.push({ kind: 'text', value: text.slice(cursor, start) })
    parts.push({ kind: 'link', value: url, href: url })
    cursor = end
    // trimTrailing may have shortened the match; resume right after the link so
    // the trimmed punctuation is still emitted as text.
    URL_RE.lastIndex = end
  }
  if (cursor < text.length) parts.push({ kind: 'text', value: text.slice(cursor) })
  return parts
}

// Shorten a long URL for display without touching the href. "https://tinyurl.com/
// reh53d8p" reads better than the raw string wrapping across three lines.
export function linkLabel(url: string, max = 42): string {
  const bare = url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  return bare.length <= max ? bare : bare.slice(0, max - 1) + '…'
}
