import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { BuoyReading, ConditionsRow } from '@/lib/conditions'
import type { Beach, BeachState } from '@/lib/seed/beaches'
import type {
  DayBasis,
  DaySummary,
  IngestSource,
  LiveStatus,
  SourceHealthView,
  StatusDayView,
  StatusSource,
} from '@/lib/status'

import { withRetry } from './retry'
import type { PageStore, StatusWriter } from './store'

/**
 * Row shapes as the migration declares them. These are hand-written; once a
 * project exists, `supabase gen types typescript` output goes in `types.ts`
 * and the client below takes it as its generic.
 */
interface BeachStatusRow {
  beach_id: string
  state: BeachState
  source: StatusSource
  source_verbatim: string | null
  source_url: string
  source_posted_at: string | null
  last_confirmed_at: string
}

interface StatusDayRow {
  beach_id: string
  day: string
  state: BeachState
  basis: DayBasis
  note: string | null
}

interface SourceHealthRow {
  source: IngestSource
  last_attempt_at: string
  last_success_at: string | null
  last_error: string | null
}

interface BeachConditionsRow {
  beach_id: string
  wind_kmh: number | string
  wind_dir_deg: number
  air_temp_c: number | string | null
  observed_at: string
}

interface BuoyReadingRow {
  buoy: string
  water_temp_c: number | string | null
  observed_at: string
}

/** status_day_summary: PostgREST serialises the bigint counts as strings. */
interface DaySummaryRow {
  day: string
  open: number | string
  advisory: number | string
  closed: number | string
  offseason: number | string
}

/** PostgREST serialises `numeric` as a string; the page wants numbers. */
function num(value: number | string): number {
  return typeof value === 'number' ? value : Number(value)
}

/**
 * The only Supabase client in the app. Server-only; the browser never holds a
 * key. Every call goes through `withRetry` (lib/db/retry.ts): the gateway was
 * seen refusing one call at the top of the hour, and each write here is an
 * upsert on a natural key, so a repeat costs nothing.
 */
export class SupabaseStore implements PageStore, StatusWriter {
  readonly kind = 'supabase' as const
  private readonly db: SupabaseClient

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  async liveStatus(): Promise<LiveStatus[]> {
    const data = await withRetry<BeachStatusRow[]>('beach_status select', () => this.db.from('beach_status').select('*'))
    return (data ?? []).map((r) => ({
      kind: 'live',
      beachId: r.beach_id,
      state: r.state,
      source: r.source,
      verbatim: r.source_verbatim,
      sourceUrl: r.source_url,
      postedAt: r.source_posted_at,
      confirmedAt: r.last_confirmed_at,
    }))
  }

  async dayStatus(day: string): Promise<StatusDayView[]> {
    const data = await withRetry<StatusDayRow[]>('status_day select', () =>
      this.db.from('status_day').select('*').eq('day', day),
    )
    return (data ?? []).map(fromDayRow)
  }

  async beachHistory(beachId: string): Promise<StatusDayView[]> {
    const data = await withRetry<StatusDayRow[]>('status_day by beach', () =>
      this.db.from('status_day').select('*').eq('beach_id', beachId).order('day'),
    )
    return (data ?? []).map(fromDayRow)
  }

  async health(): Promise<SourceHealthView[]> {
    const data = await withRetry<SourceHealthRow[]>('source_health select', () => this.db.from('source_health').select('*'))
    return (data ?? []).map((r) => ({
      source: r.source,
      lastAttemptAt: r.last_attempt_at,
      lastSuccessAt: r.last_success_at,
      lastError: r.last_error,
    }))
  }

  async days(): Promise<DaySummary[]> {
    const data = await withRetry<DaySummaryRow[]>('status_day_summary select', () =>
      this.db.from('status_day_summary').select('*').order('day', { ascending: false }),
    )
    return (data ?? []).map((r) => ({
      day: r.day,
      open: num(r.open),
      advisory: num(r.advisory),
      closed: num(r.closed),
      offseason: num(r.offseason),
    }))
  }

  async conditions(): Promise<ConditionsRow[]> {
    const data = await withRetry<BeachConditionsRow[]>('beach_conditions select', () =>
      this.db.from('beach_conditions').select('*'),
    )
    return (data ?? []).map((r) => ({
      beachId: r.beach_id,
      windKmh: num(r.wind_kmh),
      windDirDeg: r.wind_dir_deg,
      airTempC: r.air_temp_c === null ? null : num(r.air_temp_c),
      observedAt: r.observed_at,
    }))
  }

  async buoy(): Promise<BuoyReading | null> {
    const r = await withRetry<BuoyReadingRow>('buoy_reading select', () =>
      this.db.from('buoy_reading').select('*').limit(1).maybeSingle(),
    )
    if (!r) return null
    return {
      buoy: r.buoy,
      waterTempC: r.water_temp_c === null ? null : num(r.water_temp_c),
      observedAt: r.observed_at,
    }
  }

  async upsertBeaches(beaches: Beach[]): Promise<number> {
    const rows = beaches.map((b) => ({
      id: b.id,
      name: b.name,
      authority: b.authority,
      lat: b.lat,
      lon: b.lon,
      water_body: b.waterBody,
      region: b.region,
      source_url: b.sourceUrl,
    }))
    await withRetry('beaches upsert', () => this.db.from('beaches').upsert(rows, { onConflict: 'id' }))
    return rows.length
  }

  async upsertStatusDays(rows: StatusDayView[]): Promise<number> {
    const out: StatusDayRow[] = rows.map((r) => ({
      beach_id: r.beachId,
      day: r.day,
      state: r.state,
      basis: r.basis,
      note: r.note,
    }))
    await withRetry('status_day upsert', () => this.db.from('status_day').upsert(out, { onConflict: 'beach_id,day' }))
    return out.length
  }

  async upsertLiveStatus(rows: LiveStatus[]): Promise<number> {
    const out: BeachStatusRow[] = rows.map((r) => ({
      beach_id: r.beachId,
      state: r.state,
      source: r.source,
      source_verbatim: r.verbatim,
      source_url: r.sourceUrl,
      source_posted_at: r.postedAt,
      last_confirmed_at: r.confirmedAt,
    }))
    await withRetry('beach_status upsert', () => this.db.from('beach_status').upsert(out, { onConflict: 'beach_id' }))
    return out.length
  }

  async upsertSourceHealth(rows: SourceHealthView[]): Promise<number> {
    const out: SourceHealthRow[] = rows.map((r) => ({
      source: r.source,
      last_attempt_at: r.lastAttemptAt,
      last_success_at: r.lastSuccessAt,
      last_error: r.lastError,
    }))
    await withRetry('source_health upsert', () => this.db.from('source_health').upsert(out, { onConflict: 'source' }))
    return out.length
  }

  async upsertConditions(rows: ConditionsRow[]): Promise<number> {
    const out: BeachConditionsRow[] = rows.map((r) => ({
      beach_id: r.beachId,
      wind_kmh: r.windKmh,
      wind_dir_deg: r.windDirDeg,
      air_temp_c: r.airTempC,
      observed_at: r.observedAt,
    }))
    await withRetry('beach_conditions upsert', () =>
      this.db.from('beach_conditions').upsert(out, { onConflict: 'beach_id' }),
    )
    return out.length
  }

  async upsertBuoy(reading: BuoyReading): Promise<void> {
    const row: BuoyReadingRow = {
      buoy: reading.buoy,
      water_temp_c: reading.waterTempC,
      observed_at: reading.observedAt,
    }
    await withRetry('buoy_reading upsert', () => this.db.from('buoy_reading').upsert(row, { onConflict: 'buoy' }))
  }
}

function fromDayRow(r: StatusDayRow): StatusDayView {
  return { beachId: r.beach_id, day: r.day, state: r.state, basis: r.basis, note: r.note }
}
