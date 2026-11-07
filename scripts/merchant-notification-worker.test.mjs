import { describe, expect, it, vi } from 'vitest'
import { channelFor, createGoogleAccessTokenProvider, createWorkerHandler } from '../supabase/functions/notify-admin/worker.mjs'

const secret = 'a'.repeat(48)
const delivery = { delivery_id: 'delivery', lease_id: 'lease', event_id: 'event', order_id: 'order', token: 'private-device-token', platform: 'android' }
const request = (workerSecret = secret) => new Request('https://worker.example', {
  method: 'POST', headers: { 'x-merchant-worker-secret': workerSecret },
  body: JSON.stringify({ order: { id: 'spoofed' } }),
})
function client(rows = [delivery], repeats = []) {
  let position = 0
  let repeatPosition = 0
  return { rpc: vi.fn(async (name) => {
    if (name === 'claim_merchant_notification') {
      return { data: position < rows.length ? [rows[position++]] : [], error: null }
    }
    if (name === 'claim_merchant_notification_repeat') {
      return { data: repeatPosition < repeats.length ? [repeats[repeatPosition++]] : [], error: null }
    }
    return { data: true, error: null }
  }) }
}

describe('authenticated bounded FCM worker', () => {
  it('rejects a bearer prefix, incorrect secret, and missing configuration before any DB work', async () => {
    const supabase = client()
    const handler = createWorkerHandler({ supabase, workerSecret: secret, getAccessToken: async () => 'oauth' })
    expect((await handler(new Request('https://worker.example', { method: 'POST', headers: { Authorization: 'Bearer anything' } }))).status).toBe(401)
    expect((await handler(request('wrong'))).status).toBe(401)
    expect(supabase.rpc).not.toHaveBeenCalled()
    const unavailable = createWorkerHandler({ supabase, workerSecret: '', getAccessToken: async () => 'oauth' })
    expect((await unavailable(request())).status).toBe(503)
  })

  it('uses queue identities, notification+data, Android channel and stable tag', async () => {
    const supabase = client()
    const send = vi.fn(async () => new Response('{}', { status: 200 }))
    const handler = createWorkerHandler({ supabase, workerSecret: secret, getAccessToken: async () => 'oauth', projectId: 'test-project', fetchImpl: send })
    const response = await handler(request())
    expect(response.status).toBe(200)
    const [url, options] = send.mock.calls[0]
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/test-project/messages:send')
    const { message } = JSON.parse(options.body)
    expect(message).toMatchObject({ token: delivery.token, data: { order_id: 'order', event_id: 'event' },
      notification: { title: expect.any(String), body: expect.any(String) },
      android: { notification: { channel_id: 'merchant_orders', tag: 'merchant-order-order' } } })
    expect(supabase.rpc).toHaveBeenCalledWith('complete_merchant_notification', {
      p_delivery_id: 'delivery', p_lease_id: 'lease', p_outcome: 'sent',
    })
    expect(await response.text()).not.toContain(delivery.token)
  })

  it.each([
    [404, { error: { message: 'invalid UNREGISTERED' } }, 'retry'],
    [400, { error: { status: 'INVALID_ARGUMENT' } }, 'retry'],
    [404, { error: { details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } }, 'unregistered'],
    [503, { error: { message: 'private-device-token' } }, 'retry'],
  ])('classifies HTTP %s without guessing invalid registrations', async (status, body, expected) => {
    const supabase = client()
    const handler = createWorkerHandler({ supabase, workerSecret: secret, projectId: 'test-project', getAccessToken: async () => 'oauth',
      fetchImpl: async () => Response.json(body, { status }) })
    const response = await handler(request())
    expect(supabase.rpc).toHaveBeenCalledWith('complete_merchant_notification', expect.objectContaining({ p_outcome: expected }))
    expect(await response.text()).not.toContain('private-device-token')
  })

  it('refreshes OAuth after unauthorized response and stops at the bounded batch', async () => {
    const supabase = client(Array.from({ length: 12 }, () => delivery))
    const getAccessToken = vi.fn(async () => 'oauth')
    let calls = 0
    const handler = createWorkerHandler({ supabase, workerSecret: secret, projectId: 'test-project', getAccessToken,
      fetchImpl: async () => new Response('{}', { status: ++calls === 1 ? 401 : 200 }) })
    const response = await handler(request())
    expect(getAccessToken).toHaveBeenCalledWith(true)
    expect((await response.json()).processed).toBe(10)
    expect(supabase.rpc.mock.calls.filter(([name]) => name === 'claim_merchant_notification')).toHaveLength(10)
  })
})

describe('service-account short-lived OAuth', () => {
  it('signs a valid RS256 assertion, caches it, and refreshes before expiration', async () => {
    const key = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
      publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign','verify'])
    const privateKey = Buffer.from(await crypto.subtle.exportKey('pkcs8', key.privateKey)).toString('base64')
    let now = 1_000_000
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url).toBe('https://oauth2.googleapis.com/token')
      const assertion = new URLSearchParams(options.body).get('assertion')
      const [header, payload, signature] = assertion.split('.')
      expect(JSON.parse(Buffer.from(header, 'base64url'))).toMatchObject({ alg: 'RS256' })
      expect(JSON.parse(Buffer.from(payload, 'base64url'))).toMatchObject({
        iss: 'merchant@test-project.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token', exp: Math.floor(now / 1000) + 3600,
      })
      expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key.publicKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${header}.${payload}`))).toBe(true)
      return Response.json({ access_token: `access-${fetchImpl.mock.calls.length}`, token_type: 'Bearer', expires_in: 3600 })
    })
    const getAccessToken = createGoogleAccessTokenProvider({ type: 'service_account', project_id: 'test-project',
      client_email: 'merchant@test-project.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----` },
    { fetchImpl, now: () => now })
    expect(await getAccessToken()).toBe('access-1')
    expect(await getAccessToken()).toBe('access-1')
    now += 3_550_000
    expect(await getAccessToken()).toBe('access-2')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('per-device notification preferences', () => {
  const withPreferences = (soundEnabled, vibrationEnabled) => ({
    ...delivery, sound_enabled: soundEnabled, vibration_enabled: vibrationEnabled,
  })

  it('keeps the original channel when the claim predates preferences', async () => {
    expect(channelFor({})).toBe('merchant_orders')
    const send = vi.fn(async () => new Response('{}', { status: 200 }))
    const handler = createWorkerHandler({
      supabase: client([delivery]), workerSecret: secret, projectId: 'test-project',
      getAccessToken: async () => 'oauth', fetchImpl: send,
    })
    expect((await handler(request())).status).toBe(200)
    const { message } = JSON.parse(send.mock.calls[0][1].body)
    expect(message.android.notification.channel_id).toBe('merchant_orders')
    expect(message.apns.payload.aps.sound).toBe('default')
  })

  it.each([
    [true, true, 'merchant_orders', 'default'],
    [true, false, 'merchant_orders_sound', 'default'],
    [false, true, 'merchant_orders_vibrate', undefined],
    [false, false, 'merchant_orders_silent', undefined],
  ])('routes sound=%s vibration=%s to %s', async (sound, vibration, channel, apnsSound) => {
    const send = vi.fn(async () => new Response('{}', { status: 200 }))
    const handler = createWorkerHandler({
      supabase: client([withPreferences(sound, vibration)]), workerSecret: secret,
      projectId: 'test-project', getAccessToken: async () => 'oauth', fetchImpl: send,
    })
    expect((await handler(request())).status).toBe(200)
    const { message } = JSON.parse(send.mock.calls[0][1].body)
    expect(message.android.notification.channel_id).toBe(channel)
    expect(message.apns.payload.aps.sound).toBe(apnsSound)
  })

  it.each([
    ['krapow', true, 'merchant_orders_krapow'],
    ['krapow', false, 'merchant_orders_krapow_quiet'],
    ['bell', true, 'merchant_orders_bell'],
    ['bell', false, 'merchant_orders_bell_quiet'],
    ['chime', true, 'merchant_orders_chime'],
    ['chime', false, 'merchant_orders_chime_quiet'],
    // 'system' and unknown values keep the default-sound channels.
    ['system', true, 'merchant_orders'],
    ['system', false, 'merchant_orders_sound'],
    ['mystery', true, 'merchant_orders'],
    ['mystery', false, 'merchant_orders_sound'],
  ])('routes alert_sound=%s with vibration=%s to %s', (alertSound, vibration, channel) => {
    expect(channelFor({ ...delivery, sound_enabled: true, vibration_enabled: vibration, alert_sound: alertSound })).toBe(channel)
  })

  it('keeps the silent channels when sound is off regardless of alert sound', () => {
    expect(channelFor({ ...delivery, sound_enabled: false, vibration_enabled: true, alert_sound: 'bell' })).toBe('merchant_orders_vibrate')
    expect(channelFor({ ...delivery, sound_enabled: false, vibration_enabled: false, alert_sound: 'krapow' })).toBe('merchant_orders_silent')
  })
})

describe('repeat order alerts', () => {
  const repeatDelivery = (repeatCount) => ({
    ...delivery,
    token_id: 'token-id',
    repeat_count: repeatCount,
  })

  it.each([1, 2, 90])('reuses the order notification for repeat %s so the tray holds one entry', async (repeatCount) => {
    const supabase = client([], [repeatDelivery(repeatCount)])
    const send = vi.fn(async () => new Response('{}', { status: 200 }))
    const handler = createWorkerHandler({
      supabase, workerSecret: secret, projectId: 'test-project',
      getAccessToken: async () => 'oauth', fetchImpl: send,
    })
    const response = await handler(request())
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ processed: 1, repeated: 1 })
    const { message } = JSON.parse(send.mock.calls[0][1].body)
    expect(message.data).toMatchObject({
      order_id: 'order', event_id: 'event', repeat: String(repeatCount),
    })
    // The same tag as the initial alert replaces the visible notification, and
    // Android re-alerts on replacement, so one entry sounds every repeat.
    expect(message.android.notification.tag).toBe('merchant-order-order')
    expect(message.apns.headers['apns-collapse-id']).toBe('order')
    expect(supabase.rpc).toHaveBeenCalledWith('complete_merchant_notification_repeat', {
      p_token_id: 'token-id', p_lease_id: 'lease', p_outcome: 'sent',
    })
    expect(supabase.rpc).not.toHaveBeenCalledWith('complete_merchant_notification', expect.anything())
  })

  it('keeps the initial alert tag stable and includes repeat zero', async () => {
    const send = vi.fn(async () => new Response('{}', { status: 200 }))
    const handler = createWorkerHandler({
      supabase: client([delivery]), workerSecret: secret, projectId: 'test-project',
      getAccessToken: async () => 'oauth', fetchImpl: send,
    })
    expect((await handler(request())).status).toBe(200)
    const { message } = JSON.parse(send.mock.calls[0][1].body)
    expect(message.data.repeat).toBe('0')
    expect(message.android.notification.tag).toBe('merchant-order-order')
    expect(message.apns.headers['apns-collapse-id']).toBe('order')
  })

  it('clamps an unexpected repeat sequence to the supported maximum', async () => {
    const send = vi.fn(async () => new Response('{}', { status: 200 }))
    const handler = createWorkerHandler({
      supabase: client([], [repeatDelivery(99)]), workerSecret: secret, projectId: 'test-project',
      getAccessToken: async () => 'oauth', fetchImpl: send,
    })
    expect((await handler(request())).status).toBe(200)
    const { message } = JSON.parse(send.mock.calls[0][1].body)
    expect(message.data.repeat).toBe('90')
    expect(message.android.notification.tag).toBe('merchant-order-order')
  })
})
