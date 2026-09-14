import type { SubmitReportResult } from './types'
import { SIGN_LABEL } from './flags'

export const REPORT_FORM_COPY = {
  trigger: 'Report a sign at this beach',
  title: 'What does the sign say?',
  description:
    'Tell us what the sign at the beach says. A report appears alongside the official status after two people on different internet connections report the same sign that day. It doesn’t replace the official update.',
  photoLabel: 'Add a photo of the sign (optional, JPEG/PNG/WebP up to 5 MB)',
  submit: 'Send report',
  localPhotoTooLarge: 'That photo is over 5 MB. Pick a smaller one.',
  localPhotoWrongType: 'Use a JPEG, PNG or WebP photo.',
} as const

const UNAVAILABLE_MESSAGE = 'Reports are not available right now.'

export function resultMessage(result: SubmitReportResult): string {
  if (result.ok) {
    if (result.flagged) {
      return `Thanks! Two people have now reported a sign saying “${SIGN_LABEL[result.sign]}” today. It’s shown on the map.`
    }
    return 'Thanks! We’ve saved your report. It will appear on the map once someone on a different internet connection reports the same sign today.'
  }

  switch (result.reason) {
    case 'throttled':
      return 'You already reported this beach in the last hour. Try again later.'
    case 'bot':
      return 'The security check didn’t go through. Please try again.'
    case 'invalid':
      return 'We couldn’t send your report. Check your sign selection and photo, then try again.'
    case 'disabled':
    case 'no-ip':
    case 'error':
      return UNAVAILABLE_MESSAGE
  }
}
