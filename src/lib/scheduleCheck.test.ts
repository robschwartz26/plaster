import { describe, it, expect } from 'vitest'
import { claimedWeekdays, weekdayConflict } from './scheduleCheck'

// Portland-time instants. 2026-11-29 is a Sunday, 2026-11-30 a Monday.
const SUN = '2026-11-30T05:00:00Z'   // Sun Nov 29, 9pm PST
const MON = '2026-12-01T05:00:00Z'   // Mon Nov 30, 9pm PST

describe('claimedWeekdays', () => {
  it('finds a singular day', () => expect(claimedWeekdays('Every Monday at 9')).toEqual([1]))
  it('finds a plural day', () => expect(claimedWeekdays('Fridays at Dante\'s')).toEqual([5]))
  it('finds several', () => expect(claimedWeekdays('every Friday and Sunday at 9PM')).toEqual([0, 5]))
  it('returns nothing when no day is named', () => expect(claimedWeekdays('A great show')).toEqual([]))
  it('handles null', () => expect(claimedWeekdays(null)).toEqual([]))
  it('does not match a day inside another word', () =>
    expect(claimedWeekdays('Sundaes and cake')).toEqual([]))
})

describe('weekdayConflict', () => {
  it('flags the real Karaoke From Hell bug', () => {
    // "Every Monday" published on a Sunday — the actual 64-event incident
    expect(weekdayConflict('Every Monday, Dante\'s hosts Karaoke From Hell', SUN))
      .toEqual({ actual: 'Sun', claimed: ['Mon'] })
  })

  it('passes the same event once corrected', () => {
    expect(weekdayConflict('Every Monday, Dante\'s hosts Karaoke From Hell', MON)).toBeNull()
  })

  it('does NOT flag a genuine two-night run — the old check\'s false positive', () => {
    const d = 'Catch it on Saturday, January 16 at 7:30 PM or Sunday, January 17 at 2:00 PM'
    expect(weekdayConflict(d, '2026-11-29T22:00:00Z')).toBeNull()  // a Sunday
  })

  it('flags Stripparaoke on a Thursday', () => {
    const d = 'This wild karaoke experience happens every Friday and Sunday at 9PM'
    const THU = '2026-11-27T05:00:00Z'   // Thu Nov 26, 9pm PST
    expect(weekdayConflict(d, THU)).toEqual({ actual: 'Thu', claimed: ['Sun', 'Fri'] })
  })

  it('stays silent when the description names no day', () => {
    expect(weekdayConflict('An evening of jazz', SUN)).toBeNull()
  })

  it('stays silent with no description at all', () => {
    expect(weekdayConflict(null, SUN)).toBeNull()
    expect(weekdayConflict('Every Monday', null)).toBeNull()
  })

  it('stays silent on an unparseable date', () => {
    expect(weekdayConflict('Every Monday', 'not-a-date')).toBeNull()
  })

  it('uses Portland time, not UTC — the bug that caused all this', () => {
    // 2026-12-01T05:00Z is Tuesday in UTC but Monday evening in Portland.
    expect(weekdayConflict('Every Monday', '2026-12-01T05:00:00Z')).toBeNull()
  })
})
