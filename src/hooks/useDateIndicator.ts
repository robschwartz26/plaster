import { useEffect, useState, useRef } from 'react'

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

  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const read = () => {
      rafRef.current = null
      const containerRect = container.getBoundingClientRect()
      const viewportTop = containerRect.top
      const viewportBottom = containerRect.bottom

      // ── 1-col: probe the element at the top of the container ──────────────
      if (cols === 1) {
        const probeY = viewportTop + 10
        const probeXCenter = containerRect.left + containerRect.width / 2
        const el = document.elementFromPoint(probeXCenter, probeY) as HTMLElement | null
        const card = el?.closest('[data-event-id], [data-is-date-poster]') as HTMLElement | null

        if (!card) {
          setResult({ mode: 'none', day: null, eventId: null, datePosterMonth: null })
          return
        }

        if (card.dataset.isDatePoster === 'true') {
          const day = card.dataset.eventDay ?? null
          const month = day ? parseInt(day.split('-')[1], 10) : null
          setResult({ mode: 'blank-bar', day, eventId: null, datePosterMonth: month })
          return
        }

        const day = card.dataset.eventDay ?? null
        const eventId = card.dataset.eventId ?? null
        setResult({ mode: 'event-info', day, eventId, datePosterMonth: null })
        return
      }

      // ── 2-5 col: topmost row >30% visible, rightmost real poster ──────────
      const allCards = Array.from(
        container.querySelectorAll<HTMLElement>('[data-event-id], [data-is-date-poster]')
      )

      type Row = { topY: number; height: number; visibleRatio: number; cards: HTMLElement[] }
      const rows: Row[] = []

      for (const card of allCards) {
        const rect = card.getBoundingClientRect()
        if (rect.bottom < viewportTop || rect.top > viewportBottom) continue

        const rowTop = Math.round(rect.top)
        const existingRow = rows.find(r => Math.abs(r.topY - rowTop) < 2)
        if (existingRow) {
          existingRow.cards.push(card)
        } else {
          const visibleTop = Math.max(rect.top, viewportTop)
          const visibleBottom = Math.min(rect.bottom, viewportBottom)
          const visibleHeight = Math.max(0, visibleBottom - visibleTop)
          const ratio = rect.height > 0 ? visibleHeight / rect.height : 0
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
        // Row is entirely DatePosters — use the first card's day
        const day = sortedCards[0]?.dataset.eventDay ?? null
        setResult({ mode: 'date-chip', day, eventId: null, datePosterMonth: null })
        return
      }

      // scrollTop === 0: leftmost real poster (tonight row); otherwise: rightmost
      const chosenCard = container.scrollTop === 0
        ? realPosters[0]
        : realPosters[realPosters.length - 1]

      const day = chosenCard.dataset.eventDay ?? null
      const eventId = chosenCard.dataset.eventId ?? null
      setResult({ mode: 'date-chip', day, eventId, datePosterMonth: null })
    }

    const onScroll = () => {
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(read)
    }

    read()

    container.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      container.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [containerRef, cols, itemsLength]) // eslint-disable-line react-hooks/exhaustive-deps

  return result
}
