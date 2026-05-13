import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import crypto from 'crypto'
import { verifyWebhookSignature } from '@/lib/lalamove/auth'
import {
  handleStatusChange,
  handleOrderCreated,
  handleDriverAssigned,
  handleAmountChanged,
  handleOrderReplaced,
  handlePodStatusChanged,
} from './handlers'

function sanitizeForLog(value: string): string {
  return value.replace(/\n|\r/g, '')
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ success: true }, { status: 200 })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Diagnostic trace: single correlation id per request so we can follow a
  // webhook across every log line in Vercel. Log the very first thing before
  // any parsing, env reads, or DB work so we can prove HTTP arrives even if
  // we blow up later.
  const trace = crypto.randomUUID().slice(0, 8)
  const log = (stage: string, extra?: Record<string, unknown>) =>
    console.log(`[Lalamove Webhook] [${trace}] ${stage}`, extra ?? '')
  const logErr = (stage: string, extra?: Record<string, unknown>) =>
    console.error(`[Lalamove Webhook] [${trace}] ${stage}`, extra ?? '')

  log('received', {
    contentType: req.headers.get('content-type'),
    hasLalamoveSigHeader: !!req.headers.get('x-lalamove-signature'),
  })

  try {
    const body = await req.text()
    log('body-read', { bodyLength: body.length })
    const response = NextResponse.json({ success: true }, { status: 200 })

    // Parse payload
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(body)
    } catch {
      logErr('invalid-json', { bodyPreview: body.slice(0, 120) })
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
    }

    // Lalamove v3 webhook payload uses `eventType`, `eventId`, and nests order data under `data.order`.
    // Signature is sent in the JSON body, not as a header.
    const eventType = payload.eventType as string || payload.type as string
    const eventId = payload.eventId as string | undefined
    const eventTimestampRaw = payload.timestamp
    const signature = req.headers.get('x-lalamove-signature') || (payload.signature as string)
    const secret = process.env.LALAMOVE_API_SECRET

    log('parsed', {
      eventType: eventType ?? null,
      eventId: eventId ?? null,
      hasSignature: !!signature,
      hasSecret: !!secret,
      secretLen: secret ? secret.length : 0,
      timestampType: typeof eventTimestampRaw,
    })

    // Lalamove sends a signature-less POST probe (empty body `{}`) during webhook
    // URL validation in their portal. Return 200 so the URL is accepted.
    const trimmedBody = body.trim()
    if (!signature && (trimmedBody === '' || trimmedBody === '{}')) {
      log('validation-ping')
      return response
    }

    if (!secret) {
      logErr('missing-secret')
      return NextResponse.json({ success: false, error: 'Webhook secret not configured' }, { status: 500 })
    }

    // Signature verification. Always call the verifier (unconditional),
    // so permission to process the webhook does not branch on user-controlled
    // state. Per Lalamove v3 spec (v3_Webhook_v1.5.pdf p.8), the signed
    // string is `${timestamp}\r\nPOST\r\n${path}\r\n\r\n${JSON.stringify(data)}`
    // hashed with HMAC-SHA256 and lowercase hex-encoded.
    const requestPath = new URL(req.url).pathname
    let verified = false
    let verifyError: string | null = null
    try {
      verified = verifyWebhookSignature(
        signature ?? '',
        secret,
        eventTimestampRaw as string | number,
        requestPath,
        payload.data
      )
    } catch (e) {
      verified = false
      verifyError = e instanceof Error ? e.message : String(e)
    }
    if (!verified) {
      logErr('signature-failed', {
        signaturePreview: signature ? signature.slice(0, 12) + '…' : null,
        path: requestPath,
        timestamp: eventTimestampRaw,
        verifyError,
      })
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 })
    }
    log('signature-verified')

    if (!eventType) {
      logErr('missing-event-type')
      return NextResponse.json({ success: false, error: 'Missing eventType' }, { status: 400 })
    }

    // Lalamove sends timestamp as Unix seconds (number), not ISO string
    let createdAt: string
    if (typeof eventTimestampRaw === 'number') {
      createdAt = new Date(eventTimestampRaw * 1000).toISOString()
    } else if (typeof eventTimestampRaw === 'string') {
      createdAt = eventTimestampRaw
    } else {
      createdAt = new Date().toISOString()
    }

    const eventData = payload.data as Record<string, unknown> || {}

    // Order ID is nested under data.order.orderId in Lalamove v3 webhooks
    const orderData = (eventData as any)?.order as Record<string, unknown> | undefined
    const lalamoveOrderId = orderData?.orderId as string || payload.orderId as string

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceKey) {
      logErr('missing-supabase-env', {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey,
      })
      return NextResponse.json(
        { success: false, error: 'Supabase env not configured' },
        { status: 500 }
      )
    }

    const supabase = createServerClient(
      supabaseUrl,
      supabaseServiceKey,
      { cookies: { getAll() { return [] }, setAll() {} } }
    )

    // Log raw payload first so we always have a record to reference
    const insertData: Record<string, unknown> = {
      event_type: eventType,
      event_status: (orderData?.status as string) || (eventData.status as string) || null,
      raw_payload: payload,
      signature,
      created_at: createdAt,
    }
    if (lalamoveOrderId) {
      insertData.lalamove_order_id = lalamoveOrderId
    }

    const { data: insertedEvent, error: insertError } = await supabase
      .from('lalamove_webhook_events')
      .insert(insertData)
      .select('id')
      .single()

    if (insertError) {
      // 23505 = unique_violation. The idx_webhook_events_idempotency index on
      // (lalamove_order_id, event_type, created_at) already saw this event;
      // Lalamove is retrying. Acknowledge with 200 so retries stop and the
      // portal does not flag the URL as "not responsive".
      if (insertError.code === '23505') {
        log('duplicate-event-ignored', {
          eventId: eventId ?? null,
          eventType: sanitizeForLog(eventType ?? ''),
          lalamoveOrderId: lalamoveOrderId ? sanitizeForLog(lalamoveOrderId) : null,
        })
        return response
      }
      logErr('event-insert-failed', {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
      })
      return NextResponse.json(
        { success: false, error: 'DB insert failed' },
        { status: 500 }
      )
    }

    const eventRowId = insertedEvent?.id as string | undefined
    log('event-inserted', { eventRowId: eventRowId ?? null, lalamoveOrderId: lalamoveOrderId ?? null })

    // Events without an order ID (e.g., WALLET_BALANCE_CHANGED) don't need shipment lookup
    if (!lalamoveOrderId) {
      if (eventType === 'WALLET_BALANCE_CHANGED') {
        log('ignoring-wallet-balance')
      } else {
        log('event-without-order-id', { eventType: sanitizeForLog(eventType) })
      }
      if (eventRowId) {
        await supabase
          .from('lalamove_webhook_events')
          .update({ processed: true })
          .eq('id', eventRowId)
      }
      return response
    }

    // Find shipment by Lalamove order ID
    let shipment: Record<string, unknown> | null = null
    const { data: shipmentByLalamoveId } = await supabase
      .from('lalamove_shipments')
      .select('*')
      .eq('lalamove_order_id', lalamoveOrderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    shipment = shipmentByLalamoveId

    // Fallback: Lalamove occasionally fires ORDER_STATUS_CHANGED before
    // ORDER_CREATED (or before POST /orders commits lalamove_order_id).
    // Match the draft shipment via metadata.orderId for any event type, then
    // backfill lalamove_order_id so later webhooks hit the primary index.
    if (!shipment && orderData?.metadata) {
      const metadata = orderData.metadata as Record<string, unknown>
      const internalOrderId = metadata?.orderId as string | undefined
      if (internalOrderId) {
        const { data: shipmentByMeta } = await supabase
          .from('lalamove_shipments')
          .select('*')
          .eq('order_id', internalOrderId)
          .is('lalamove_order_id', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (shipmentByMeta) {
          if (eventType !== 'ORDER_CREATED') {
            await supabase
              .from('lalamove_shipments')
              .update({ lalamove_order_id: lalamoveOrderId })
              .eq('id', shipmentByMeta.id)
              .is('lalamove_order_id', null)
            shipmentByMeta.lalamove_order_id = lalamoveOrderId
          }
          shipment = shipmentByMeta
        }
      }
    }

    if (!shipment) {
      logErr('shipment-not-found', { lalamoveOrderId: sanitizeForLog(lalamoveOrderId) })
      if (eventRowId) {
        await supabase
          .from('lalamove_webhook_events')
          .update({ processed: true, processing_error: 'Shipment not found' })
          .eq('id', eventRowId)
      }
      return response
    }

    log('shipment-found', { shipmentId: shipment.id as string, dispatchStatus: shipment.dispatch_status as string })

    // Route by event type
    try {
      switch (eventType) {
        case 'ORDER_STATUS_CHANGED':
          await handleStatusChange(supabase, shipment, lalamoveOrderId, eventData)
          break

        case 'ORDER_CREATED':
          await handleOrderCreated(supabase, shipment, lalamoveOrderId, eventData)
          break

        case 'DRIVER_ASSIGNED':
          await handleDriverAssigned(supabase, shipment, lalamoveOrderId, eventData)
          break

        case 'ORDER_AMOUNT_CHANGED':
          await handleAmountChanged(supabase, shipment, eventData)
          break

        case 'ORDER_REPLACED':
          await handleOrderReplaced(supabase, shipment, lalamoveOrderId, eventData)
          break

        case 'POD_STATUS_CHANGED':
          await handlePodStatusChanged(supabase, shipment, eventData)
          break

        default:
          log('unknown-event-type', { eventType: sanitizeForLog(eventType) })
      }

      if (eventRowId) {
        await supabase
          .from('lalamove_webhook_events')
          .update({ processed: true })
          .eq('id', eventRowId)
      }
      log('done')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorStack = error instanceof Error ? error.stack : undefined
      logErr('handler-error', { message: errorMessage, stack: errorStack })

      if (eventRowId) {
        await supabase
          .from('lalamove_webhook_events')
          .update({ processing_error: errorMessage })
          .eq('id', eventRowId)
      }
    }

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    logErr('fatal', { message, stack })
    return NextResponse.json(
      { success: false, error: 'Internal error', trace },
      { status: 500 }
    )
  }
}
