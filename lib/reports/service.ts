import type { ReportsConfig } from './config'
import { hashIp } from './ip'
import { isReportSign, photoExtension, validatePhotoBytes, type PhotoType } from './validate'
import type {
  ReportLogEvent,
  ReportPhotoStorage,
  ReportStore,
  SubmitReportInput,
  SubmitReportResult,
  TurnstileVerifier,
} from './types'

export const FLAG_THRESHOLD = 2 // mirrors the view's `having`; used only to compute `flagged` in the response

export interface ReportServiceDeps {
  config: ReportsConfig
  verifier: TurnstileVerifier
  store: ReportStore
  storage: ReportPhotoStorage
  roster: ReadonlySet<string>
  now?: () => Date
  log?: (event: ReportLogEvent) => void
}

export interface ReportService {
  submit(input: SubmitReportInput): Promise<SubmitReportResult>
}

/** Object key inside the private bucket. Derived from the row id, so paths are never
 * guessable-before-insert and never collide. */
export function photoPathFor(beachId: string, reportId: number, type: PhotoType): string {
  return `${beachId}/${reportId}.${photoExtension(type)}`
}

export function createReportService(deps: ReportServiceDeps): ReportService {
  const log = deps.log ?? (() => {})

  return {
    async submit(input: SubmitReportInput): Promise<SubmitReportResult> {
      const config = deps.config

      if (!config.enabled) {
        log({ kind: 'rejected', reason: 'disabled', beachId: input.beachId })
        return { ok: false, reason: 'disabled' }
      }

      if (!deps.roster.has(input.beachId) || !isReportSign(input.sign)) {
        log({ kind: 'rejected', reason: 'invalid', beachId: input.beachId })
        return { ok: false, reason: 'invalid' }
      }

      if (input.clientIp === null) {
        log({ kind: 'rejected', reason: 'no-ip', beachId: input.beachId })
        return { ok: false, reason: 'no-ip' }
      }
      const ipHash = hashIp(input.clientIp, config.ipSalt)

      let photoType: PhotoType | null = null
      if (input.photo) {
        const validated = validatePhotoBytes(input.photo.bytes, input.photo.declaredType)
        if (!validated.ok) {
          log({ kind: 'rejected', reason: 'invalid', beachId: input.beachId, detail: validated.error })
          return { ok: false, reason: 'invalid' }
        }
        photoType = validated.type
      }

      const verdict = await deps.verifier.verify({ token: input.turnstileToken, remoteIp: input.clientIp })
      if (!verdict.success) {
        log({
          kind: 'rejected',
          reason: 'bot',
          beachId: input.beachId,
          detail: verdict.errorCodes.join(','),
        })
        return { ok: false, reason: 'bot' }
      }

      let outcome: Awaited<ReturnType<ReportStore['insert']>>
      try {
        outcome = await deps.store.insert({
          beachId: input.beachId,
          sign: input.sign,
          ipHash,
          throttleWindowSeconds: config.throttleWindowSeconds,
        })
      } catch {
        log({ kind: 'rejected', reason: 'error', beachId: input.beachId })
        return { ok: false, reason: 'error' }
      }

      if (outcome.outcome === 'throttled') {
        log({ kind: 'rejected', reason: 'throttled', beachId: input.beachId })
        return { ok: false, reason: 'throttled' }
      }

      const { id, people } = outcome

      if (input.photo && photoType) {
        const path = photoPathFor(input.beachId, id, photoType)
        let uploaded = false
        try {
          await deps.storage.upload({ path, bytes: input.photo.bytes, contentType: photoType })
          uploaded = true
        } catch (error) {
          log({
            kind: 'photo-detached',
            id,
            path,
            detail: error instanceof Error ? error.message : String(error),
          })
        }

        if (uploaded) {
          try {
            await deps.store.attachPhoto(id, path)
          } catch (error) {
            try {
              await deps.storage.remove(path)
            } catch {
              // best-effort cleanup; nothing more to do
            }
            log({
              kind: 'photo-detached',
              id,
              path,
              detail: error instanceof Error ? error.message : String(error),
            })
          }
        }
      }

      log({ kind: 'inserted', beachId: input.beachId, sign: input.sign, people, photo: Boolean(input.photo) })
      return { ok: true, sign: input.sign, people, flagged: people >= FLAG_THRESHOLD }
    },
  }
}
