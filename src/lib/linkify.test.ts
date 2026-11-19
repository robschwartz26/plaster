import { describe, it, expect } from 'vitest'
import { splitLinks, linkLabel } from './linkify'

const links = (s: string) => splitLinks(s).filter(p => p.kind === 'link').map(p => p.value)
const rejoin = (s: string) => splitLinks(s).map(p => p.value).join('')

describe('splitLinks', () => {
  it('finds a bare https link', () => {
    expect(links('See every drink: https://tinyurl.com/reh53d8p Presented by...'))
      .toEqual(['https://tinyurl.com/reh53d8p'])
  })

  it('leaves a sentence-ending period out of the href', () => {
    expect(links('Tickets at https://example.com/show.')).toEqual(['https://example.com/show'])
  })

  it('keeps a path that legitimately ends in parens', () => {
    expect(links('https://en.wikipedia.org/wiki/Elf_(film) is the one'))
      .toEqual(['https://en.wikipedia.org/wiki/Elf_(film)'])
  })

  it('drops an unbalanced closing paren', () => {
    expect(links('(details: https://example.com/a) and more'))
      .toEqual(['https://example.com/a'])
  })

  it('finds several links in one blurb', () => {
    expect(links('http://a.com and https://b.com/x?y=1 done'))
      .toEqual(['http://a.com', 'https://b.com/x?y=1'])
  })

  it('refuses schemes that are not http(s)', () => {
    expect(links('javascript:alert(1) data:text/html,x file:///etc/passwd ftp://h/x')).toEqual([])
  })

  it('does not guess at a bare domain', () => {
    expect(links('find us at tinyurl.com/abc or www.example.com')).toEqual([])
  })

  it('returns plain text untouched when there is no link', () => {
    const s = 'Seven days, 24 bars, and one very merry excuse to bar-hop.'
    expect(splitLinks(s)).toEqual([{ kind: 'text', value: s }])
  })

  it('loses no characters — the parts always rejoin to the original', () => {
    for (const s of [
      'See https://tinyurl.com/reh53d8p Presented by the Portland Mercury.',
      'a https://x.com/1, b https://y.com/2.',
      'https://only.com',
      '',
      'no links here at all',
      '(https://example.com/a)',
    ]) expect(rejoin(s)).toBe(s)
  })

  it('handles a link at the very start and very end', () => {
    expect(links('https://start.com middle https://end.com')).toEqual(['https://start.com', 'https://end.com'])
  })
})

describe('linkLabel', () => {
  it('strips the scheme for display', () => {
    expect(linkLabel('https://tinyurl.com/reh53d8p')).toBe('tinyurl.com/reh53d8p')
  })
  it('truncates something very long', () => {
    const out = linkLabel('https://example.com/' + 'a'.repeat(100))
    expect(out.length).toBeLessThanOrEqual(42)
    expect(out.endsWith('…')).toBe(true)
  })
})
