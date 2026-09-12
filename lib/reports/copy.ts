import type { SubmitReportResult } from './types'
import { SIGN_LABEL } from './flags'

export const REPORT_FORM_COPY = {
  trigger: 'Report a sign at this beach',
  title: 'What does the sign say?',
  description:
    'Reports show beside the official status, never in place of it. Two people at different addresses have to report the same sign before it shows.',
  photoLabel: 'Add a photo of the sign (optional, JPEG/PNG/WebP up to 5 MB)',
  submit: 'Send report',
  localPhotoTooLarge: 'That photo is over 5 MB. Pick a smaller one.',
  localPhotoWrongType: 'Use a JPEG, PNG or WebP photo.',
} as const

const UNAVAILABLE_MESSAGE = 'Reports are not available right now.'

export function resultMessage(result: SubmitReportResult): string {
  if (result.ok) {
    if (result.flagged) {
      return `Thanks — a second person has reported a ${SIGN_LABEL[result.sign]} sign today, so it now shows on the pin.`
    }
    return 'Thanks. Your report is saved and will show on the pin once someone else reports the same sign today.'
  }

  switch (result.reason) {
    case 'throttled':
      return 'You already reported this beach in the last hour. Try again later.'
    case 'bot':
      return 'We could not confirm you are human. Try again.'
    case 'invalid':
      return 'Something in the report was not valid. Check the sign and the photo.'
    case 'disabled':
    case 'no-ip':
    case 'error':
      return UNAVAILABLE_MESSAGE
  }
}
