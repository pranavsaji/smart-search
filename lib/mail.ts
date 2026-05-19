import { Resend } from 'resend'

// Lazy init — avoids throwing at import time when RESEND_API_KEY is absent (tests, CI)
let _resend: Resend | undefined
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY ?? 'noop')
  return _resend
}
// Alias so call sites stay unchanged
const resend = new Proxy({} as Resend, { get: (_, prop) => getResend()[prop as keyof Resend] })

export interface BookingConfirmationData {
  to: string
  recipientName: string
  stageId: string
  items: Array<{
    type: string
    description: string
    confirmationCode: string
    amount: number
    currency: string
  }>
  totalAmount: number
  currency: string
}

export async function sendBookingConfirmation(data: BookingConfirmationData): Promise<void> {
  const itemsHtml = data.items
    .map(
      item => `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #1e293b;">
          <strong style="color: #f1f5f9;">${item.type}</strong><br/>
          <span style="color: #94a3b8; font-size: 13px;">${item.description}</span>
        </td>
        <td style="padding: 8px 0; border-bottom: 1px solid #1e293b; text-align: right;">
          <span style="color: #94a3b8; font-size: 12px;">Ref: ${item.confirmationCode}</span><br/>
          <strong style="color: #f1f5f9;">${formatAmount(item.amount, item.currency)}</strong>
        </td>
      </tr>`
    )
    .join('')

  await resend.emails.send({
    from: 'Smart Search <bookings@smartsearch.travel>',
    to: data.to,
    subject: `Booking Confirmed — ${data.items[0]?.description ?? 'Your trip'}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="background: #020817; font-family: system-ui, sans-serif; color: #f1f5f9; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #0f172a; border-radius: 12px; border: 1px solid #1e293b; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); padding: 32px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px; color: #f1f5f9;">Booking Confirmed</h1>
      <p style="margin: 8px 0 0; color: #94a3b8;">Hi ${data.recipientName}, your trip is all set.</p>
    </div>
    <div style="padding: 32px;">
      <table style="width: 100%; border-collapse: collapse;">
        ${itemsHtml}
        <tr>
          <td style="padding: 16px 0 0; font-size: 16px; font-weight: bold; color: #f1f5f9;">Total</td>
          <td style="padding: 16px 0 0; text-align: right; font-size: 16px; font-weight: bold; color: #38bdf8;">
            ${formatAmount(data.totalAmount, data.currency)}
          </td>
        </tr>
      </table>
      <div style="margin-top: 32px; padding: 16px; background: #1e293b; border-radius: 8px;">
        <p style="margin: 0; color: #94a3b8; font-size: 13px; text-align: center;">
          Manage your booking at
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/orders" style="color: #38bdf8;">smartsearch.travel/orders</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`,
  })
}

export async function sendGenieConfirmation(opts: {
  to: string
  recipientName: string
  serviceName: string
  slot?: string
  confirmationCode: string
  deepLinkUrl?: string
}): Promise<void> {
  const isLink = !!opts.deepLinkUrl
  await resend.emails.send({
    from: 'Smart Search Genie <genie@smartsearch.travel>',
    to: opts.to,
    subject: `Genie booked ${opts.serviceName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="background:#020817;font-family:system-ui,sans-serif;color:#f1f5f9;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#0f172a;border-radius:12px;border:1px solid #1e293b;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#1e3a5f 0%,#0f172a 100%);padding:32px;text-align:center;">
      <h1 style="margin:0;font-size:24px;color:#f1f5f9;">Genie Booked It</h1>
      <p style="margin:8px 0 0;color:#94a3b8;">Hi ${opts.recipientName}, your booking is confirmed.</p>
    </div>
    <div style="padding:32px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #1e293b;">
            <strong style="color:#f1f5f9;">${opts.serviceName}</strong>
            ${opts.slot ? `<br/><span style="color:#94a3b8;font-size:13px;">${opts.slot}</span>` : ''}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #1e293b;text-align:right;">
            ${isLink
              ? `<a href="${opts.deepLinkUrl}" style="background:#38bdf8;color:#020817;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:13px;">Complete Booking</a>`
              : `<span style="color:#94a3b8;font-size:12px;">Ref: ${opts.confirmationCode}</span>`
            }
          </td>
        </tr>
      </table>
      <div style="margin-top:32px;padding:16px;background:#1e293b;border-radius:8px;">
        <p style="margin:0;color:#94a3b8;font-size:13px;text-align:center;">
          View all bookings at
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/orders" style="color:#38bdf8;">smartsearch.travel/orders</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`,
  })
}

export async function sendGiftNotification(opts: {
  to: string
  senderName: string
  giftDescription: string
  redeemUrl: string
}): Promise<void> {
  await resend.emails.send({
    from: 'Smart Search <gifts@smartsearch.travel>',
    to: opts.to,
    subject: `${opts.senderName} sent you a travel gift`,
    html: `
<!DOCTYPE html>
<html>
<body style="background: #020817; font-family: system-ui, sans-serif; color: #f1f5f9; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #0f172a; border-radius: 12px; border: 1px solid #1e293b; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #4c1d95 0%, #0f172a 100%); padding: 32px; text-align: center;">
      <h1 style="margin: 0; font-size: 28px;">🎁</h1>
      <h2 style="margin: 8px 0 0; color: #f1f5f9;">${opts.senderName} sent you a gift</h2>
      <p style="margin: 8px 0 0; color: #c4b5fd;">${opts.giftDescription}</p>
    </div>
    <div style="padding: 32px; text-align: center;">
      <a href="${opts.redeemUrl}" style="display: inline-block; background: #7c3aed; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
        Claim Your Gift
      </a>
      <p style="margin: 24px 0 0; color: #64748b; font-size: 12px;">Link expires in 3 days.</p>
    </div>
  </div>
</body>
</html>`,
  })
}

// Phase 12.4 — weekly "Your iAM Insights" digest.
export async function sendWeeklyInsights(opts: {
  to: string
  recipientName: string
  headline: string
  narrative: string
  stats: Array<{ label: string; value: string }>
  periodLabel: string
}): Promise<void> {
  const statsHtml = opts.stats
    .map(
      s => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">${s.label}</td>
        <td style="padding:8px 0;border-bottom:1px solid #1e293b;text-align:right;color:#f1f5f9;font-weight:bold;">${s.value}</td>
      </tr>`
    )
    .join('')

  await resend.emails.send({
    from: 'Smart Search Insights <insights@smartsearch.travel>',
    to: opts.to,
    subject: `Your iAM Insights — ${opts.periodLabel}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="background:#020817;font-family:system-ui,sans-serif;color:#f1f5f9;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#0f172a;border-radius:12px;border:1px solid #1e293b;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#0e7490 0%,#0f172a 100%);padding:32px;text-align:center;">
      <h1 style="margin:0;font-size:24px;color:#f1f5f9;">Your iAM Insights</h1>
      <p style="margin:8px 0 0;color:#94a3b8;">Hi ${opts.recipientName} — ${opts.periodLabel}</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 24px;color:#cbd5e1;font-size:15px;line-height:1.6;">${opts.headline}</p>
      <table style="width:100%;border-collapse:collapse;">${statsHtml}</table>
      <div style="margin-top:24px;padding:16px;background:#1e293b;border-radius:8px;">
        <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">${opts.narrative}</p>
      </div>
      <div style="margin-top:24px;text-align:center;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/insights" style="color:#38bdf8;font-size:13px;">View full insights →</a>
      </div>
    </div>
  </div>
</body>
</html>`,
  })
}

function formatAmount(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(minor / 100)
}
