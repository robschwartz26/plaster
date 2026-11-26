import { describe, it, expect } from 'vitest'
import {
  portlandToInstant, portlandDate, portlandTime,
  toPortlandInputValue, fromPortlandInputValue, addPortlandDays,
} from './portlandTime'

describe('portlandToInstant', () => {
  it('reads a winter evening as PST', () => {
    // 8pm PST = 04:00 UTC next day
    expect(portlandToInstant('2026-12-05', '20:00')?.toISOString()).toBe('2026-12-06T04:00:00.000Z')
  })

  it('reads a summer evening as PDT', () => {
    // 8pm PDT = 03:00 UTC next day
    expect(portlandToInstant('2027-07-05', '20:00')?.toISOString()).toBe('2027-07-06T03:00:00.000Z')
  })

  it('handles the morning of the spring-forward day', () => {
    // 2027-03-14 is the US DST switch; 10am that day is already PDT
    expect(portlandToInstant('2027-03-14', '10:00')?.toISOString()).toBe('2027-03-14T17:00:00.000Z')
  })

  it('handles the morning of the fall-back day', () => {
    // 2026-11-01, 10am is PST
    expect(portlandToInstant('2026-11-01', '10:00')?.toISOString()).toBe('2026-11-01T18:00:00.000Z')
  })

  it('refuses a missing or malformed time rather than inventing one', () => {
    expect(portlandToInstant('2026-12-05', '')).toBeNull()
    expect(portlandToInstant('2026-12-05', '8pm')).toBeNull()
    expect(portlandToInstant('not-a-date', '20:00')).toBeNull()
  })
})

describe('reading an instant back', () => {
  it('gives the Portland date, not the device date', () => {
    // 04:00 UTC on Dec 6 is still Dec 5 in Portland
    expect(portlandDate('2026-12-06T04:00:00Z')).toBe('2026-12-05')
    expect(portlandTime('2026-12-06T04:00:00Z')).toBe('20:00')
  })

  it('round-trips through a datetime-local field', () => {
    const iso = '2026-12-06T04:00:00.000Z'
    const v = toPortlandInputValue(iso)
    expect(v).toBe('2026-12-05T20:00')
    expect(fromPortlandInputValue(v)?.toISOString()).toBe(iso)
  })
})

describe('addPortlandDays', () => {
  it('keeps the wall clock across a DST boundary', () => {
    // Mar 7 2027 9pm PST → Mar 14 is PDT, and must still read 9pm locally
    const from = portlandToInstant('2027-03-07', '21:00')!
    const to = addPortlandDays(from, 7)!
    expect(portlandDate(to)).toBe('2027-03-14')
    expect(portlandTime(to)).toBe('21:00')
    // and the UTC instant shifts by 23h, not 24 — which is the point
    expect(to.getTime() - from.getTime()).toBe((7 * 24 - 1) * 3600_000)
  })

  it('crosses a month boundary', () => {
    const from = portlandToInstant('2026-11-28', '20:00')!
    expect(portlandDate(addPortlandDays(from, 7)!)).toBe('2026-12-05')
  })
})
