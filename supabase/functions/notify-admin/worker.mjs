const OAUTH_URL = 'https://oauth2.googleapis.com/token'
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const FCM_ERROR_TYPE = 'type.googleapis.com/google.firebase.fcm.v1.FcmError'
const encoder = new TextEncoder()

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
const encodeJson = (value) => base64url(encoder.encode(JSON.stringify(value)))

/** No OAuth URLs or scopes are taken from the request or credentials JSON. */
export function createGoogleAccessTokenProvider(account, { fetchImpl = fetch, now = Date.now } = {}) {
  if (account?.type !== 'service_account' || typeof account.private_key !== 'string'
    || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(account.project_id ?? '')
    || !/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(account.client_email ?? '')) {
    throw new Error('Invalid FCM service account configuration')
  }
  const pem = account.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replaceAll(/\s/g, '')
  let keyPromise
  let cached
  let refreshing
  const privateKey = () => {
    keyPromise ??= crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
    return keyPromise
  }
  const refresh = async () => {
    const issuedAt = Math.floor(now() / 1000)
    const unsigned = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson({
      iss: account.client_email, scope: FCM_SCOPE, aud: OAUTH_URL, iat: issuedAt, exp: issuedAt + 3600,
    })}`
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await privateKey(), encoder.encode(unsigned))
    const response = await fetchImpl(OAUTH_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64url(new Uint8Array(signature))}` }).toString(),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error('FCM OAuth exchange failed')
    const result = await response.json()
    if (typeof result.access_token !== 'string' || !/^[\x21-\x7e]{1,8192}$/.test(result.access_token)
      || result.token_type?.toLowerCase() !== 'bearer'
      || !Number.isFinite(result.expires_in) || result.expires_in < 120 || result.expires_in > 3600) {
      throw new Error('Invalid FCM OAuth response')
    }
    cached = { token: result.access_token, expiresAt: now() + result.expires_in * 1000 }
    return cached.token
  }
  return async (forceRefresh = false) => {
    if (!forceRefresh && cached && cached.expiresAt - 60_000 > now()) return cached.token
    if (!refreshing) refreshing = refresh().finally(() => { refreshing = undefined })
    return refreshing
  }
}

async function secretMatches(expected, actual) {
  // Hash both inputs to fixed-size bytes, then compare all bytes without an early exit.
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
  ])
  const a = new Uint8Array(left)
  const b = new Uint8Array(right)
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i]
  return difference === 0
}

/** Alert sounds with dedicated channels in the app; anything else uses the default sound. */
const ALERT_SOUNDS = new Set(['krapow', 'bell', 'chime'])

/**
 * Channel names are part of the app contract. Missing preference columns (an
 * older claim function) keep the original sound-and-vibration channel. A known
 * alert_sound selects one of the per-sound channels the app creates; 'system'
 * or an unknown value falls back to the default-sound channels.
 */
export function channelFor(delivery) {
  const sound = delivery.sound_enabled !== false
  const vibration = delivery.vibration_enabled !== false
  if (sound && ALERT_SOUNDS.has(delivery.alert_sound)) {
    return vibration
      ? `merchant_orders_${delivery.alert_sound}`
      : `merchant_orders_${delivery.alert_sound}_quiet`
  }
  if (sound && vibration) return 'merchant_orders'
  if (sound) return 'merchant_orders_sound'
  if (vibration) return 'merchant_orders_vibrate'
  return 'merchant_orders_silent'
}

function messageFor(delivery) {
  const sound = delivery.sound_enabled !== false
  const repeat = Number.isInteger(Number(delivery.repeat_count)) && Number(delivery.repeat_count) > 0
    ? Math.min(90, Number(delivery.repeat_count))
    : 0
  return {
    token: delivery.token,
    notification: { title: 'New order', body: 'A new order needs your attention.' },
    data: {
      order_id: delivery.order_id,
      event_id: delivery.event_id,
      type: 'new_order',
      repeat: String(repeat),
    },
    // One tray entry per order: every repeat reuses the order's tag, so Android
    // replaces the visible notification instead of stacking a new one. The
    // system re-alerts on each replacement (no only-alert-once flag), which is
    // what makes the sound play every repeat interval.
    android: { priority: 'high', notification: { channel_id: channelFor(delivery), tag: `merchant-order-${delivery.event_id}` } },
    apns: { headers: { 'apns-collapse-id': delivery.event_id }, payload: { aps: sound ? { sound: 'default' } : {} } },
  }
}

async function isUnregistered(response) {
  if (response.status !== 404) return false
  try {
    const result = await response.json()
    return Array.isArray(result?.error?.details) && result.error.details.some((detail) =>
      detail?.['@type'] === FCM_ERROR_TYPE && detail.errorCode === 'UNREGISTERED')
  } catch {
    return false // A malformed or generic 404 never authorizes removing a token.
  }
}

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/** Requests only wake the durable queue. Their bodies cannot choose an order or recipient. */
export function createWorkerHandler({ supabase, workerSecret, getAccessToken, projectId, fetchImpl = fetch }) {
  return async (request) => {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    if (typeof workerSecret !== 'string' || workerSecret.length < 32) return json({ error: 'Worker unavailable' }, 503)
    const suppliedSecret = request.headers.get('x-merchant-worker-secret') ?? ''
    if (suppliedSecret.length > 512 || !await secretMatches(workerSecret, suppliedSecret)) return json({ error: 'Unauthorized' }, 401)
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId ?? '')) return json({ error: 'Worker unavailable' }, 503)

    const counts = { processed: 0, sent: 0, repeated: 0, retry: 0, unregistered: 0, stale: 0 }
    const startedAt = Date.now()
    try {
      for (let i = 0; i < 10 && Date.now() - startedAt < 70_000; i++) {
        // One recipient per claim minimizes the gap between current authorization and dispatch.
        // Initial alerts win over repeats; a repeat is claimed only when no initial delivery is due.
        const { data, error } = await supabase.rpc('claim_merchant_notification')
        if (error) return json({ error: 'Queue unavailable' }, 503)
        let delivery = data?.[0]
        let isRepeat = false
        if (!delivery) {
          const repeatClaim = await supabase.rpc('claim_merchant_notification_repeat')
          if (repeatClaim.error) return json({ error: 'Queue unavailable' }, 503)
          delivery = repeatClaim.data?.[0]
          isRepeat = true
        }
        if (!delivery) break
        let outcome = 'retry'
        try {
          const send = async (refresh = false) => fetchImpl(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
            method: 'POST', headers: { Authorization: `Bearer ${await getAccessToken(refresh)}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: messageFor(delivery) }), signal: AbortSignal.timeout(8000),
          })
          let response = await send()
          if (response.status === 401) response = await send(true)
          outcome = response.ok ? 'sent' : await isUnregistered(response) ? 'unregistered' : 'retry'
        } catch {
          // Persist a retry, never an exception body: provider errors can contain registration tokens.
          outcome = 'retry'
        }
        const result = isRepeat
          ? await supabase.rpc('complete_merchant_notification_repeat', {
            p_token_id: delivery.token_id, p_lease_id: delivery.lease_id, p_outcome: outcome,
          })
          : await supabase.rpc('complete_merchant_notification', {
            p_delivery_id: delivery.delivery_id, p_lease_id: delivery.lease_id, p_outcome: outcome,
          })
        if (result.error) return json({ error: 'Queue unavailable' }, 503)
        counts.processed++
        if (result.data === true) {
          if (isRepeat) counts.repeated++
          else counts[outcome]++
        } else {
          counts.stale++
        }
      }
      return json(counts)
    } catch {
      // Logs, responses and delivery rows contain no tokens, Google error bodies or secrets.
      return json({ error: 'Worker unavailable' }, 503)
    }
  }
}
