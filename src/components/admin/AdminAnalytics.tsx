import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/hooks/useTheme'
import {
  fetchMetrics, series, latest, total, trend, fmtNum, fmtPct, fmtDay,
  type MetricsDay, type MetricKey,
} from '@/lib/analytics'
import { paletteFor } from '@/components/admin/charts/chartTokens'
import { Spark } from '@/components/admin/charts/Spark'
import { TrendChart } from '@/components/admin/charts/TrendChart'

const RANGES = [30, 90, 365] as const

// ── Stat tile ─────────────────────────────────────────────────────────────────
// A single number is a stat tile, not a chart. The sparkline underneath is
// shape only — direction and steadiness — with the number carrying the value.
function Tile({ label, value, delta, note, spark, color }: {
  label: string
  value: string
  delta?: number | null
  note?: string
  spark?: (number | null)[]
  color: string
}) {
  const up = delta !== null && delta !== undefined && delta > 0
  const flat = delta === null || delta === undefined || Math.abs(delta) < 0.5
  return (
    <div style={{
      flex: '1 1 150px', minWidth: 150, padding: '12px 14px',
      border: '1px solid var(--fg-08)', borderRadius: 10, background: 'var(--fg-08)',
    }}>
      <div style={{
        fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 11,
        letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-40)',
      }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 3 }}>
        <span style={{
          fontFamily: '"Playfair Display", serif', fontWeight: 900, fontSize: 25,
          color: 'var(--fg)', lineHeight: 1.1,
        }}>{value}</span>
        {!flat && (
          <span style={{
            fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, fontWeight: 600,
            color: up ? '#199e70' : '#d95926',
          }}>{fmtPct(delta ?? null)}</span>
        )}
      </div>
      {note && (
        <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 10, color: 'var(--fg-40)', marginTop: 1 }}>
          {note}
        </div>
      )}
      {spark && <div style={{ marginTop: 7 }}><Spark values={spark} color={color} /></div>}
    </div>
  )
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{
        fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 12,
        letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-55)',
      }}>{title}</div>
      {sub && (
        <div style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-40)', marginTop: 2 }}>
          {sub}
        </div>
      )}
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  )
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
      {items.map(it => (
        <span key={it.label} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: '"Space Grotesk", sans-serif', fontSize: 11, color: 'var(--fg-55)',
        }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

export function AdminAnalytics() {
  const { theme } = useTheme()
  const pal = paletteFor(theme)
  const [range, setRange] = useState<(typeof RANGES)[number]>(90)
  const [rows, setRows] = useState<MetricsDay[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  useEffect(() => {
    let live = true
    setLoading(true); setErr('')
    fetchMetrics(range)
      .then(r => { if (live) { setRows(r); setLoading(false) } })
      .catch(e => { if (live) { setErr(e instanceof Error ? e.message : String(e)); setLoading(false) } })
    return () => { live = false }
  }, [range])

  const days = useMemo(() => rows.map(r => fmtDay(r.day)), [rows])
  const s = (k: MetricKey) => series(rows, k)

  // Pull Apple's reports on demand. Their data lags a day, so there is nothing
  // to poll for — a button the admin presses is the honest interface.
  async function syncDownloads() {
    setSyncing(true); setSyncMsg('')
    try {
      const { data, error } = await supabase.functions.invoke('appstore-metrics', {
        body: { days: range },
      })
      if (error) throw error
      const d = data as { written?: number; missing?: number; failed?: string | null }
      setSyncMsg(d.failed
        ? `Apple error: ${d.failed}`
        : `${d.written ?? 0} days updated${d.missing ? `, ${d.missing} with no report` : ''}`)
      setRows(await fetchMetrics(range))
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <P>Loading…</P>
  if (err) return <P>Could not load metrics — {err}</P>
  if (rows.length === 0) return <P>No metrics captured yet. The nightly job runs at 00:20.</P>

  const viewers = s('viewers')
  const downloads = s('downloads_ios')
  const signups = s('signups')
  const upcoming = s('events_upcoming')

  const btn = (on: boolean) => ({
    padding: '4px 11px', borderRadius: 20, cursor: 'pointer',
    fontFamily: '"Space Grotesk", sans-serif', fontSize: 11.5, fontWeight: 600,
    border: on ? '1px solid #A855F7' : '1px solid var(--fg-18)',
    background: on ? 'rgba(168,85,247,0.12)' : 'transparent',
    color: on ? '#A855F7' : 'var(--fg-55)',
  })

  return (
    <div style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
      {/* Filters in one row above the charts. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
        {RANGES.map(r => (
          <button key={r} onClick={() => setRange(r)} style={btn(range === r)}>
            {r === 365 ? '1 year' : `${r} days`}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={syncDownloads} disabled={syncing} style={{ ...btn(false), opacity: syncing ? 0.6 : 1 }}>
          {syncing ? 'Asking Apple…' : 'Sync downloads'}
        </button>
      </div>
      {syncMsg && (
        <div style={{ fontSize: 11, color: 'var(--fg-55)', marginBottom: 10 }}>{syncMsg}</div>
      )}

      {/* ── Headline ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Tile label="Downloads" value={fmtNum(total(downloads))} delta={trend(downloads, 7)}
          note={`iOS, last ${range}d`} spark={downloads} color={pal.series[0]} />
        <Tile label="Active users" value={fmtNum(latest(s('viewers_7d')))} delta={trend(viewers, 7)}
          note="distinct, last 7 days" spark={viewers} color={pal.series[2]} />
        <Tile label="Signups" value={fmtNum(total(signups))} delta={trend(signups, 7)}
          note={`last ${range}d`} spark={signups} color={pal.series[3]} />
        <Tile label="On the wall" value={fmtNum(latest(upcoming))}
          note="upcoming events" spark={upcoming} color={pal.series[1]} />
      </div>

      {/* ── Audience ─────────────────────────────────────────────────────── */}
      <Section title="Audience" sub="Downloads are installs; active users are people who opened a poster. Gaps mean no data, not zero.">
        <Legend items={[
          { label: 'Downloads', color: pal.series[0] },
          { label: 'Active users', color: pal.series[2] },
        ]} />
        <TrendChart pal={pal} days={days} valueFmt={n => n.toLocaleString()} series={[
          { label: 'Downloads', color: pal.series[0], values: downloads },
          { label: 'Active users', color: pal.series[2], values: viewers },
        ]} />
      </Section>

      {/* Updates are NOT downloads and get their own chart rather than a second
          y-axis on the one above. */}
      <Section title="Installs vs updates" sub="Apple counts an app update separately from a first-time install.">
        <Legend items={[
          { label: 'First-time', color: pal.series[0] },
          { label: 'Re-downloads', color: pal.series[3] },
          { label: 'Updates', color: pal.series[1] },
        ]} />
        <TrendChart pal={pal} days={days} height={150} series={[
          { label: 'First-time', color: pal.series[0], values: downloads },
          { label: 'Re-downloads', color: pal.series[3], values: s('redownloads_ios') },
          { label: 'Updates', color: pal.series[1], values: s('updates_ios') },
        ]} />
      </Section>

      {/* ── The wall ─────────────────────────────────────────────────────── */}
      <Section title="The wall" sub="What a visitor actually finds when they open it.">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <Tile label="Added" value={fmtNum(total(s('events_added')))} delta={trend(s('events_added'), 7)}
            note={`last ${range}d`} spark={s('events_added')} color={pal.series[1]} />
          <Tile label="Venues live" value={fmtNum(latest(s('venues_with_upcoming')))}
            note={`of ${fmtNum(latest(s('venues_total')))} total`} spark={s('venues_with_upcoming')} color={pal.series[2]} />
          <Tile label="Neighborhoods" value={fmtNum(latest(s('neighborhoods_covered')))}
            note="represented" spark={s('neighborhoods_covered')} color={pal.series[3]} />
          <Tile label="Poster coverage" value={`${Math.round(((latest(s('events_with_poster')) ?? 0) / Math.max(latest(s('events_published_total')) ?? 1, 1)) * 100)}%`}
            note="of published events" color={pal.series[0]} />
        </div>
        <Legend items={[
          { label: 'Upcoming events', color: pal.series[1] },
          { label: 'Venues with a show', color: pal.series[2] },
        ]} />
        <TrendChart pal={pal} days={days} height={150} series={[
          { label: 'Upcoming events', color: pal.series[1], values: upcoming },
          { label: 'Venues with a show', color: pal.series[2], values: s('venues_with_upcoming') },
        ]} />
      </Section>

      {/* ── Health ───────────────────────────────────────────────────────── */}
      <Section title="Health" sub="Queue depth and gaps. These should trend toward zero.">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Tile label="In review" value={fmtNum(latest(s('events_pending')))}
            note="waiting now" spark={s('events_pending')} color={pal.series[3]} />
          <Tile label="New venues" value={fmtNum(latest(s('orphans_open')))}
            note="unattributed" spark={s('orphans_open')} color={pal.series[1]} />
          <Tile label="Missing coords" value={fmtNum(latest(s('venues_missing_coords')))}
            note="holes in the map" spark={s('venues_missing_coords')} color={pal.series[1]} />
          <Tile label="Push devices" value={fmtNum(latest(s('devices_total')))}
            note={`${fmtNum(latest(s('devices_ios')))} iOS · ${fmtNum(latest(s('devices_android')))} Android`}
            color={pal.series[0]} />
        </div>
      </Section>

      {/* ── Community ────────────────────────────────────────────────────── */}
      <Section title="Community" sub="Kept small on purpose — a dashboard that foregrounds engagement starts steering for it.">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Tile label="RSVPs" value={fmtNum(total(s('rsvps')))} spark={s('rsvps')} color={pal.series[2]} note={`last ${range}d`} />
          <Tile label="Likes" value={fmtNum(total(s('likes')))} spark={s('likes')} color={pal.series[2]} note={`last ${range}d`} />
          <Tile label="Posts" value={fmtNum(total(s('posts')))} spark={s('posts')} color={pal.series[2]} note={`last ${range}d`} />
          <Tile label="Follows" value={fmtNum(total(s('follows')))} spark={s('follows')} color={pal.series[2]} note={`last ${range}d`} />
        </div>
      </Section>

      <p style={{ fontSize: 10.5, color: 'var(--fg-40)', lineHeight: 1.5, marginTop: 20 }}>
        Captured nightly at 00:20 Portland time. Active users counts signed-in people who opened an
        event — guests leave no trace, so it is a floor. Apple's download data lags about a day and
        only reaches back a year.
      </p>
    </div>
  )
}

const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 13, color: 'var(--fg-55)' }}>{children}</p>
)
