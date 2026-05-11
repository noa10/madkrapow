import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { validateGeofenceJson } from '@/lib/bots/settings'
import { getServerClient } from '@/lib/supabase/server'

export async function GET(): Promise<NextResponse> {
  try {
    const authClient = await getServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    const role = user?.app_metadata?.role as string | undefined
    if (!user || role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() {
            return []
          },
          setAll() {},
        },
      }
    )

    const { data, error } = await supabase
      .from('store_settings')
      .select(
        'telegram_bot_enabled, whatsapp_bot_enabled, telegram_kitchen_group_chat_id, delivery_geofence_json, operating_hours, min_order_amount, store_name'
      )
      .limit(1)
      .single()

    if (error || !data) {
      console.error('[Admin Bot Settings] Failed to fetch:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch bot settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      telegramBotEnabled: data.telegram_bot_enabled ?? false,
      whatsappBotEnabled: data.whatsapp_bot_enabled ?? false,
      telegramKitchenGroupChatId: data.telegram_kitchen_group_chat_id ?? null,
      deliveryGeofenceJson: data.delivery_geofence_json ?? null,
      operatingHours: data.operating_hours ?? null,
      minOrderAmount: data.min_order_amount ?? 2000,
      storeName: data.store_name ?? 'Mad Krapow',
    })
  } catch (error) {
    console.error('[Admin Bot Settings] GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

interface BotSettingsUpdateRequest {
  telegramBotEnabled?: boolean
  whatsappBotEnabled?: boolean
  telegramKitchenGroupChatId?: string | null
  deliveryGeofenceJson?: unknown | null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const authClient = await getServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    const role = user?.app_metadata?.role as string | undefined
    if (!user || role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    let body: BotSettingsUpdateRequest
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    if (
      body.deliveryGeofenceJson !== undefined &&
      body.deliveryGeofenceJson !== null
    ) {
      const validation = validateGeofenceJson(body.deliveryGeofenceJson)
      if (!validation.valid) {
        return NextResponse.json(
          { success: false, error: validation.error },
          { status: 400 }
        )
      }
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() {
            return []
          },
          setAll() {},
        },
      }
    )

    const updatePayload: Record<string, unknown> = {}
    if (body.telegramBotEnabled !== undefined) {
      updatePayload.telegram_bot_enabled = body.telegramBotEnabled
    }
    if (body.whatsappBotEnabled !== undefined) {
      updatePayload.whatsapp_bot_enabled = body.whatsappBotEnabled
    }
    if (body.telegramKitchenGroupChatId !== undefined) {
      updatePayload.telegram_kitchen_group_chat_id = body.telegramKitchenGroupChatId
    }
    if (body.deliveryGeofenceJson !== undefined) {
      updatePayload.delivery_geofence_json = body.deliveryGeofenceJson
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('store_settings')
      .update(updatePayload)
      .eq('id', (await supabase.from('store_settings').select('id').limit(1).single()).data?.id)
      .select()
      .single()

    if (error) {
      console.error('[Admin Bot Settings] Update failed:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update bot settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      settings: data,
    })
  } catch (error) {
    console.error('[Admin Bot Settings] POST error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
