// NOTE: run via `npm test`, which sets TZ=America/Los_Angeles. The local-timezone
// date parsing in expandOccurrences (and the timezone-sanity assertion below) is
// deterministic only with TZ pinned to Portland — a bare `vitest` on another TZ may
// fail the timezone test. (TZ isn't set in this file because the production build's
// browser tsconfig has no Node `process` global.)

import { describe, it, expect } from 'vitest'
import { expandOccurrences, DEFAULT_SHOW_TIME } from './recurringDates'

// Format an ISO timestamp back into Portland wall-clock, e.g. "06/15/2026, 08:00 PM",
// to assert the stored UTC instant lands on the right local calendar date/time.
function inPortland(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

describe('expandOccurrences', () => {
  it('single date + time → one occurrence, no show_times list', () => {
    const out = expandOccurrences('2026-06-15', '20:00', [])
    expect(out).toHaveLength(1)
    expect(out[0].date).toBe('2026-06-15')
    expect(out[0].show_times).toBeNull()
    expect(typeof out[0].starts_at).toBe('string')
  })

  it('multi-date with one shared time → one occurrence per date, all at that time', () => {
    const out = expandOccurrences('2026-06-15', '19:00', [
      { date: '2026-06-22', time: '' },
      { date: '2026-06-29', time: '' },
    ])
    expect(out.map(o => o.date)).toEqual(['2026-06-15', '2026-06-22', '2026-06-29'])
    // Extra dates with no time inherit the primary time (19:00 = 7pm Portland).
    for (const o of out) {
      expect(o.show_times).toBeNull()
      expect(inPortland(o.starts_at)).toMatch(/07:00 PM$/)
    }
  })

  it('per-date time override via extraDates is honored', () => {
    const out = expandOccurrences('2026-06-15', '19:00', [
      { date: '2026-06-22', time: '21:30' },
    ])
    expect(out).toHaveLength(2)
    expect(inPortland(out[0].starts_at)).toMatch(/07:00 PM$/)
    expect(inPortland(out[1].starts_at)).toMatch(/09:30 PM$/)
  })

  it('duplicate calendar dates collapse to one occurrence with sorted show_times', () => {
    const out = expandOccurrences('2026-06-15', '19:00', [
      { date: '2026-06-15', time: '22:00' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].show_times).not.toBeNull()
    expect(out[0].show_times).toHaveLength(2)
    // starts_at is the EARLIEST show that day, and times are sorted ascending.
    expect(out[0].starts_at).toBe(out[0].show_times![0])
    expect(out[0].show_times![0] < out[0].show_times![1]).toBe(true)
    expect(inPortland(out[0].starts_at)).toMatch(/07:00 PM$/)
    expect(inPortland(out[0].show_times![1])).toMatch(/10:00 PM$/)
  })

  it('a date with no time falls back to the default show time (8pm)', () => {
    expect(DEFAULT_SHOW_TIME).toBe('20:00')
    const out = expandOccurrences('2026-06-15', '', [])
    expect(out).toHaveLength(1)
    expect(inPortland(out[0].starts_at)).toMatch(/08:00 PM$/)
  })

  it('timezone sanity: a 20:00 Portland show stays on its calendar date', () => {
    const out = expandOccurrences('2026-06-15', '20:00', [])
    // The calendar-date key is preserved...
    expect(out[0].date).toBe('2026-06-15')
    // ...and the stored UTC instant reads back as 8pm on June 15 in Portland
    // (not rolled to the 14th or 16th by a UTC mis-parse).
    expect(inPortland(out[0].starts_at)).toBe('06/15/2026, 08:00 PM')
  })

  it('output is chronological even when inputs are out of order', () => {
    const out = expandOccurrences('2026-06-29', '20:00', [
      { date: '2026-06-15', time: '20:00' },
      { date: '2026-06-22', time: '20:00' },
    ])
    expect(out.map(o => o.date)).toEqual(['2026-06-15', '2026-06-22', '2026-06-29'])
  })
})
