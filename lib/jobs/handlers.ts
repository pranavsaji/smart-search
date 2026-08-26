// Registration of every durable job handler. Imported for its side effects by
// the retry cron, which otherwise would have an empty registry and abandon
// everything it drained.

import { registerJob } from './runner'
import {
  sendBookingConfirmation,
  sendGenieConfirmation,
  sendGiftNotification,
  sendWeeklyInsights,
  sendOtpEmail,
  type BookingConfirmationData,
} from '@/lib/mail'

export function registerAllJobs(): void {
  registerJob<BookingConfirmationData>('email.bookingConfirmation', sendBookingConfirmation)
  registerJob<Parameters<typeof sendGenieConfirmation>[0]>('email.genieConfirmation', sendGenieConfirmation)
  registerJob<Parameters<typeof sendGiftNotification>[0]>('email.giftNotification', sendGiftNotification)
  registerJob<Parameters<typeof sendWeeklyInsights>[0]>('email.weeklyInsights', sendWeeklyInsights)
  registerJob<Parameters<typeof sendOtpEmail>[0]>('email.otp', sendOtpEmail)
}
