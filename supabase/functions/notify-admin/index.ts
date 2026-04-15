import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface FcmToken {
  token: string
  platform: string
  user_id: string
}

interface OrderPayload {
  id: string
  order_kind: string
  total_cents: number
  customer_id: string
  created_at: string
}

Deno.serve(async (req: Request) => {
  try {
    // Only accept POST
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Get the authorization header to verify this is a service_role call
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 })
    }

    const body = await req.json()
    const { order } = body as { order: OrderPayload }

    if (!order?.id) {
      return new Response('Missing order data', { status: 400 })
    }

    // Find all admin FCM tokens
    const { data: adminUsers, error: adminError } = await supabase
      .from('auth.users')
      .select('id')
      .eq('raw_app_meta_data->>role', 'admin')

    if (adminError || !adminUsers?.length) {
      return new Response('No admin users found', { status: 200 })
    }

    const adminIds = adminUsers.map((u: { id: string }) => u.id)

    // Get FCM tokens for all admin users
    const { data: tokens, error: tokenError } = await supabase
      .from('fcm_tokens')
      .select('token, platform, user_id')
      .in('user_id', adminIds)

    if (tokenError || !tokens?.length) {
      return new Response('No FCM tokens registered', { status: 200 })
    }

    // Send FCM notification to each admin device
    const fcmResults = await Promise.allSettled(
      (tokens as FcmToken[]).map(async (t) => {
        const message = {
          token: t.token,
          notification: {
            title: 'New Order!',
            body: `Order #${order.id.slice(0, 8)} — RM ${(order.total_cents / 100).toFixed(2)}`,
          },
          data: {
            orderId: order.id,
            type: 'new_order',
          },
          android: {
            priority: 'high' as const,
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
              },
            },
          },
        }

        // Use FCM HTTP v1 API
        const fcmResponse = await fetch(
          `https://fcm.googleapis.com/v1/projects/${Deno.env.get('FCM_PROJECT_ID')}/messages:send`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${Deno.env.get('FCM_ACCESS_TOKEN')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message }),
          }
        )

        if (!fcmResponse.ok) {
          const errorBody = await fcmResponse.text()
          // If token is invalid, delete it
          if (fcmResponse.status === 404 || errorBody.includes('UNREGISTERED') || errorBody.includes('invalid')) {
            await supabase.from('fcm_tokens').delete().eq('token', t.token)
          }
          throw new Error(`FCM error: ${fcmResponse.status} ${errorBody}`)
        }

        return { tokenId: t.token, success: true }
      })
    )

    const succeeded = fcmResults.filter((r) => r.status === 'fulfilled').length
    const failed = fcmResults.filter((r) => r.status === 'rejected').length

    return new Response(
      JSON.stringify({ sent: succeeded, failed }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[notify-admin] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
