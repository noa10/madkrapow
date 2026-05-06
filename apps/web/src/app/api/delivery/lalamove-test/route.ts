import { NextResponse } from 'next/server'
import { env } from '@/lib/validators/env'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function GET() {
  const apiKey = env.LALAMOVE_API_KEY ?? ''
  const apiSecret = env.LALAMOVE_API_SECRET ?? ''
  const lalamoveEnv = env.LALAMOVE_ENV
  const baseUrlOverride = env.LALAMOVE_BASE_URL ?? '(unset)'

  const baseUrl = baseUrlOverride === '(unset)'
    ? (lalamoveEnv === 'production' ? 'https://rest.lalamove.com' : 'https://rest.sandbox.lalamove.com')
    : baseUrlOverride

  const testPath = '/v3/cities?countryIso2=MY'
  const authPath = testPath.split('?')[0]
  const timestamp = Date.now().toString()

  const sigRaw = `${timestamp}\r\nGET\r\n${authPath}\r\n\r\n`
  const sig = crypto.createHmac('sha256', apiSecret).update(sigRaw).digest('hex')

  const authHeader = `hmac ${apiKey}:${timestamp}:${sig}`

  const diagnostics = {
    baseUrl,
    testPath,
    authPath,
    timestamp,
    sigInputEscaped: sigRaw.replace(/\r/g, '\\r').replace(/\n/g, '\\n'),
    signatureHex: sig,
    keyFull: apiKey,
    keyLength: apiKey.length,
    secretFull: apiSecret,
    secretLength: apiSecret.length,
    secretCharCodes: Array.from(apiSecret).map(c => c.charCodeAt(0)),
    secretHasPlus: apiSecret.includes('+'),
    secretHasSpace: apiSecret.includes(' '),
    lalamoveEnv,
    baseUrlOverride,
    market: env.LALAMOVE_MARKET || 'MY',
  }

  let rawResult: Record<string, unknown> = {}
  try {
    const resp = await fetch(`${baseUrl}${testPath}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Market': env.LALAMOVE_MARKET || 'MY',
        'Request-ID': crypto.randomUUID(),
        'Content-Type': 'application/json',
      },
    })

    const body = await resp.text()
    let parsedBody: unknown
    try { parsedBody = JSON.parse(body) } catch { parsedBody = body }

    rawResult = {
      status: resp.status,
      statusText: resp.statusText,
      headers: Object.fromEntries(resp.headers.entries()),
      body: parsedBody,
    }
  } catch (err) {
    rawResult = {
      fetchError: err instanceof Error ? err.message : String(err),
    }
  }

  return NextResponse.json({ diagnostics, rawResult })
}
