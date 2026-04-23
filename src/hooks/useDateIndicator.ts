import { useEffect, useState } from 'react'

export interface DateIndicatorResult {
  mode: 'event-info' | 'blank-bar' | 'date-chip' | 'none'
  day: string | null
  eventId: string | null
  datePosterMonth: number | null
}

// Reads the DOM directly to determine what the date indicator should show.
// No state sync required — scroll position is the single source of truth.
export function useDateIndicator(
  containerRef: React.RefObject<HTMLDivElement | null>,
  cols: number,
  itemsLength?: number, // re-reads when item list changes (filter changes, initial load)
): DateIndicatorResult {
  const [result, setResult] = useState<DateIndicatorResult>({
    mode: 'none',
    day: null,
    eventId: null,
    datePosterMonth: null,
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const read = () => {
      const containerRect = container.getBoundingClientRect()
      const viewportTop = containerRect.top
      const viewportBottom = containerRect.bottom

      // ── All col counts: visibility-based row detection ────────────────────
      // 1-col: one card per row, naturally handled by the same logic.
      // 2-5 col: multiple cards per row grouped by rowTop.
      const allCards = Array.from(
        container.querySelectorAll<HTMLElement>('[data-event-id], [data-is-date-poster]')
      )

      type Row = { topY: number; height: number; visibleRatio: number; cards: HTMLElement[] }
      const rows: Row[] = []

      for (const card of allCards) {
        const rect = card.getBoundingClientRect()
        if (rect.bottom < viewportTop || rect.top > viewportBottom) continue

        const visibleTop = Math.max(rect.top, viewportTop)
        const visibleBottom = Math.min(rect.bottom, viewportBottom)
        const visibleHeight = Math.max(0, visibleBottom - visibleTop)
        const ratio = rect.height > 0 ? visibleHeight / rect.height : 0

        const rowTop = Math.round(rect.top)
        const existingRow = rows.find(r => Math.abs(r.topY - rowTop) < 2)
        if (existingRow) {
          existingRow.cards.push(card)
          if (ratio > existingRow.visibleRatio) existingRow.visibleRatio = ratio
        } else {
          rows.push({ topY: rowTop, height: rect.height, visibleRatio: ratio, cards: [card] })
        }
      }

      rows.sort((a, b) => a.topY - b.topY)

      const chosenRow = rows.find(r => r.visibleRatio > 0.3)
      if (!chosenRow) {
        setResult({ mode: 'none', day: null, eventId: null, datePosterMonth: null })
        return
      }

      const sortedCards = chosenRow.cards
        .slice()
        .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)

      const realPosters = sortedCards.filter(c => c.dataset.isDatePoster !== 'true')

      if (realPosters.length === 0) {
        // Row is entirely DatePosters
        const day = sortedCards[0]?.dataset.eventDay ?? null
        if (cols === 1) {
          const month = day ? parseInt(day.split('-')[1], 10) : null
          setResult({ mode: 'blank-bar', day, eventId: null, datePosterMonth: month })
        } else {
          setResult({ mode: 'date-chip', day, eventId: null, datePosterMonth: null })
        }
        return
      }

      if (cols === 1) {
        // 1-col: the single dominant card is the answer
        const chosenCard = realPosters[0]
        const day = chosenCard.dataset.eventDay ?? null
        const eventId = chosenCard.dataset.eventId ?? null
        setResult({ mode: 'event-info', day, eventId, datePosterMonth: null })
        return
      }

      // 2-5 col: scrollTop === 0 → leftmost (tonight row); otherwise → rightmost
      const chosenCard = container.scrollTop === 0
        ? realPosters[0]
        : realPosters[realPosters.length - 1]

      const day = chosenCard.dataset.eventDay ?? null
      const eventId = chosenCard.dataset.eventId ?? null
      setResult({ mode: 'date-chip', day, eventId, datePosterMonth: null })
    }

    read()

    container.addEventListener('scroll', read, { passive: true })
    window.addEventListener('resize', read)

    return () => {
      container.removeEventListener('scroll', read)
      window.removeEventListener('resize', read)
    }
  }, [containerRef, cols, itemsLength]) // eslint-disable-line react-hooks/exhaustive-deps

  return result
}
