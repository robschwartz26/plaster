import { describe, it, expect } from 'vitest'
import { planRecurrence, type OrdinalKey } from '@/lib/recurrence'

// Tests run with TZ=America/Los_Angeles (see package.json), but planRecurrence's
// output is asserted as Portland wall clock, which is the contract.
const ords = (...o: OrdinalKey[]) => new Set<OrdinalKey>(o)
const days = (...d: number[]) => new Set<number>(d)   // 0=Mon … 6=Sun

describe('planRecurrence', () => {
  it('never returns the anchor event’s own date', () => {
    const out = planRecurrence('2026-12-01T19:00', 'weekly', ords(), days())
    expect(out.map(p => p.date)).not.toContain('2026-12-01')
  })

  it('weekly: 12 more Tuesdays over three months', () => {
    const out = planRecurrence('2026-12-01T19:00', 'weekly', ords(), days())
    expect(out).toHaveLength(12)
    expect(out[0].date).toBe('2026-12-08')
    expect(out[out.length - 1].date).toBe('2027-02-23')
  })

  it('biweekly and monthly step correctly', () => {
    const bi = planRecurrence('2026-12-01T19:00', 'biweekly', ords(), days())
    expect(bi.map(p => p.date).slice(0, 3)).toEqual(['2026-12-15', '2026-12-29', '2027-01-12'])
    const mo = planRecurrence('2026-12-01T19:00', 'monthly', ords(), days())
    expect(mo.map(p => p.date)).toEqual(['2027-01-01', '2027-02-01', '2027-03-01'])
  })

  it('keeps the show at the same Portland hour across the spring DST jump', () => {
    // Mar 8 2026 is the spring-forward Sunday: PST (-08) before, PDT (-07) after.
    const out = planRecurrence('2026-02-24T20:00', 'weekly', ords(), days())
    const before = out.find(p => p.date === '2026-03-03')!
    const after = out.find(p => p.date === '2026-03-10')!
    expect(before.starts_at).toBe('2026-03-04T04:00:00.000Z')  // 8pm PST
    expect(after.starts_at).toBe('2026-03-11T03:00:00.000Z')   // 8pm PDT — same wall clock
  })

  it('weekdays mode: first and third Thursday of each month', () => {
    const out = planRecurrence('2026-12-01T19:30', 'weekdays', ords('1st', '3rd'), days(3))
    // The window closes three months out (Mar 1), so March's Thursdays are out.
    expect(out.map(p => p.date)).toEqual([
      '2026-12-03', '2026-12-17',
      '2027-01-07', '2027-01-21',
      '2027-02-04', '2027-02-18',
    ])
  })

  it('weekdays mode with nothing picked plans nothing', () => {
    expect(planRecurrence('2026-12-01T19:30', 'weekdays', ords(), days(3))).toEqual([])
    expect(planRecurrence('2026-12-01T19:30', 'weekdays', ords('1st'), days())).toEqual([])
  })

  it('a date with no time of day falls back to the 8pm placeholder', () => {
    const [first] = planRecurrence('2026-12-01', 'weekly', ords(), days())
    expect(first.date).toBe('2026-12-08')
    expect(first.starts_at).toBe('2026-12-09T04:00:00.000Z')   // 8pm PST
  })

  it('an unreadable start plans nothing', () => {
    expect(planRecurrence('', 'weekly', ords(), days())).toEqual([])
    expect(planRecurrence('not a date', 'weekly', ords(), days())).toEqual([])
  })
})
