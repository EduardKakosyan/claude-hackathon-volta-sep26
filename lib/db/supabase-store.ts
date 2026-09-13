import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { BuoyReading, ConditionsRow } from '@/lib/conditions'
import type { Beach, BeachState } from '@/lib/seed/beaches'
import type {
  DayBasis,
  IngestSource,
  LiveStatus,
  SourceHealthView,
  StatusDayView,
  StatusSource,
} from '@/lib/status'

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

/** PostgREST serialises `numeric` as a string; the page wants numbers. */
function num(value: number | string): number {
  return typeof value === 'number' ? value : Number(value)
}

function fail(op: string, error: { message: string } | null): never {
  throw new Error(`supabase ${op}: ${error?.message ?? 'unknown error'}`)
}

/** The only Supabase client in the app. Server-only; the browser never holds a key. */
export class SupabaseStore implements PageStore, StatusWriter {
  readonly kind = 'supabase' as const
  private readonly db: SupabaseClient

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  async liveStatus(): Promise<LiveStatus[]> {
    const { data, error } = await this.db.from('beach_status').select('*')
    if (error) fail('beach_status select', error)
    return ((data ?? []) as BeachStatusRow[]).map((r) => ({
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
    const { data, error } = await this.db.from('status_day').select('*').eq('day', day)
    if (error) fail('status_day select', error)
    return ((data ?? []) as StatusDayRow[]).map(fromDayRow)
  }

  async history(fromDay: string, toDay: string): Promise<StatusDayView[]> {
    const { data, error } = await this.db
      .from('status_day')
      .select('*')
      .gte('day', fromDay)
      .lte('day', toDay)
    if (error) fail('status_day range', error)
    return ((data ?? []) as StatusDayRow[]).map(fromDayRow)
  }

  async health(): Promise<SourceHealthView[]> {
    const { data, error } = await this.db.from('source_health').select('*')
    if (error) fail('source_health select', error)
    return ((data ?? []) as SourceHealthRow[]).map((r) => ({
      source: r.source,
      lastAttemptAt: r.last_attempt_at,
      lastSuccessAt: r.last_success_at,
      lastError: r.last_error,
    }))
  }

  async days(): Promise<string[]> {
    const { data, error } = await this.db.from('status_day').select('day')
    if (error) fail('status_day days', error)
    const days = new Set(((data ?? []) as { day: string }[]).map((r) => r.day))
    return [...days].sort().reverse()
  }

  async conditions(): Promise<ConditionsRow[]> {
    const { data, error } = await this.db.from('beach_conditions').select('*')
    if (error) fail('beach_conditions select', error)
    return ((data ?? []) as BeachConditionsRow[]).map((r) => ({
      beachId: r.beach_id,
      windKmh: num(r.wind_kmh),
      windDirDeg: r.wind_dir_deg,
      airTempC: r.air_temp_c === null ? null : num(r.air_temp_c),
      observedAt: r.observed_at,
    }))
  }

  async buoy(): Promise<BuoyReading | null> {
    const { data, error } = await this.db.from('buoy_reading').select('*').limit(1).maybeSingle()
    if (error) fail('buoy_reading select', error)
    const r = data as BuoyReadingRow | null
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
    const { error } = await this.db.from('beaches').upsert(rows, { onConflict: 'id' })
    if (error) fail('beaches upsert', error)
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
    const { error } = await this.db.from('status_day').upsert(out, { onConflict: 'beach_id,day' })
    if (error) fail('status_day upsert', error)
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
    const { error } = await this.db.from('beach_status').upsert(out, { onConflict: 'beach_id' })
    if (error) fail('beach_status upsert', error)
    return out.length
  }

  async upsertSourceHealth(rows: SourceHealthView[]): Promise<number> {
    const out: SourceHealthRow[] = rows.map((r) => ({
      source: r.source,
      last_attempt_at: r.lastAttemptAt,
      last_success_at: r.lastSuccessAt,
      last_error: r.lastError,
    }))
    const { error } = await this.db.from('source_health').upsert(out, { onConflict: 'source' })
    if (error) fail('source_health upsert', error)
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
    const { error } = await this.db.from('beach_conditions').upsert(out, { onConflict: 'beach_id' })
    if (error) fail('beach_conditions upsert', error)
    return out.length
  }

  async upsertBuoy(reading: BuoyReading): Promise<void> {
    const row: BuoyReadingRow = {
      buoy: reading.buoy,
      water_temp_c: reading.waterTempC,
      observed_at: reading.observedAt,
    }
    const { error } = await this.db.from('buoy_reading').upsert(row, { onConflict: 'buoy' })
    if (error) fail('buoy_reading upsert', error)
  }
}

function fromDayRow(r: StatusDayRow): StatusDayView {
  return { beachId: r.beach_id, day: r.day, state: r.state, basis: r.basis, note: r.note }
}
