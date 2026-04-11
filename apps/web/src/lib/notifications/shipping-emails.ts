import { env } from '@/lib/validators/env'

type ServiceClient = ReturnType<typeof import('@supabase/ssr').createServerClient>

const RESEND_API_URL = 'https://api.resend.com/emails'

interface EmailPayload {
  to: string
  subject: string
  html: string
}

/**
 * Send an email via Resend API.
 */
async function sendEmail({ to, subject, html }: EmailPayload): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY not configured, skipping email')
    return false
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Mad Krapow <orders@madkrapow.com>',
        to,
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      console.error('[Email] Resend API error:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('[Email] Failed to send:', error)
    return false
  }
}

/**
 * Send shipping status notification email to customer.
 */
export async function sendShippingNotification(
  supabase: ServiceClient,
  orderId: string,
  status: string
): Promise<void> {
  // Fetch order details
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (!order?.customer_phone) return

  // Fetch customer email
  const { data: customer } = await supabase
    .from('customers')
    .select('email')
    .eq('id', order.customer_id)
    .single()

  const customerEmail = customer?.email
  if (!customerEmail) return

  const orderNumber = order.order_number || orderId.slice(0, 8)

  // Customer-facing notifications
  const customerNotifications: Record<string, () => Promise<void>> = {
    driver_assigned: async () => { await sendEmail({
      to: customerEmail,
      subject: `Your Mad Krapow order #${orderNumber} is on the way!`,
      html: buildCustomerEmail('Driver Assigned', orderNumber, {
        body: 'A driver has been assigned to deliver your order.',
        details: `Driver: ${order.driver_name || 'Assigned'}\nPlate: ${order.driver_plate_number || 'N/A'}`,
      }),
    }) },

    in_transit: async () => { await sendEmail({
      to: customerEmail,
      subject: `Driver picked up your order #${orderNumber}`,
      html: buildCustomerEmail('Order Picked Up', orderNumber, {
        body: 'Your order has been picked up and is on the way to you.',
      }),
    }) },

    delivered: async () => { await sendEmail({
      to: customerEmail,
      subject: `Your Mad Krapow order #${orderNumber} has been delivered!`,
      html: buildCustomerEmail('Order Delivered', orderNumber, {
        body: 'Your order has been delivered. Enjoy your meal!',
      }),
    }) },

    failed: async () => { await sendEmail({
      to: customerEmail,
      subject: `Issue with your Mad Krapow order #${orderNumber}`,
      html: buildCustomerEmail('Delivery Issue', orderNumber, {
        body: 'We encountered an issue with your delivery. Our team is reviewing and will contact you shortly.',
      }),
    }) },

    cancelled: async () => { await sendEmail({
      to: customerEmail,
      subject: `Delivery cancelled for order #${orderNumber}`,
      html: buildCustomerEmail('Delivery Cancelled', orderNumber, {
        body: 'Your delivery has been cancelled. If you have questions, please contact us.',
      }),
    }) },
  }

  const handler = customerNotifications[status]
  if (handler) {
    await handler()
  }

  // Admin notifications for failed/error states
  const adminStatuses = ['failed', 'manual_review', 'cancelled']
  if (adminStatuses.includes(status)) {
    await sendAdminAlert(orderId, orderNumber, status)
  }
}

/**
 * Send admin alert email for delivery issues.
 */
async function sendAdminAlert(
  orderId: string,
  orderNumber: string,
  status: string
): Promise<void> {
  // Use admin email from env or skip
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) return

  await sendEmail({
    to: adminEmail,
    subject: `[Admin] Delivery ${status} for order #${orderNumber}`,
    html: `
      <h2>Delivery Alert</h2>
      <p>Order #${orderNumber} (ID: ${orderId})</p>
      <p>Status: <strong>${status}</strong></p>
      <p>Please review in the admin dashboard.</p>
    `,
  })
}

/**
 * Build a simple customer email template.
 */
function buildCustomerEmail(
  title: string,
  orderNumber: string,
  content: { body: string; details?: string }
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #d97706;">Mad Krapow</h1>
      <h2>${title}</h2>
      <p>Order #${orderNumber}</p>
      <p>${content.body}</p>
      ${content.details ? `<pre style="background: #f5f5f5; padding: 12px; border-radius: 4px;">${content.details}</pre>` : ''}
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="color: #666; font-size: 12px;">Thank you for ordering with Mad Krapow!</p>
    </body>
    </html>
  `
}
