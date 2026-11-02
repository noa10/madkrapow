import { NextRequest, NextResponse } from 'next/server'
import { requireGrabFoodEnabled } from '@/lib/grabfood/guard'
import {
  issuePartnerToken,
  partnerScope,
  verifyClientCredentials,
} from '@/lib/grabfood/partner-auth'

/**
 * Partner OAuth token endpoint (Grab -> POS).
 *
 * Grab sends the documented JSON client_credentials request and uses the
 * returned bearer token on every partner callback. Client credentials are
 * POS-issued, separate from the Grab-issued client used for our outbound API
 * calls.
 */
export async function POST(req: NextRequest) {
  const disabled = requireGrabFoodEnabled()
  if (disabled) {
    return NextResponse.json({ error: disabled.error }, { status: disabled.status })
  }

  if (!req.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415 }
    )
  }

  let body: {
    client_id?: string
    client_secret?: string
    grant_type?: string
    scope?: string
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.grant_type !== 'client_credentials') {
    return NextResponse.json(
      { error: 'unsupported_grant_type', error_description: 'grant_type must be client_credentials' },
      { status: 400 }
    )
  }
  if (body.scope && body.scope !== partnerScope()) {
    return NextResponse.json(
      { error: 'invalid_scope', error_description: `scope must be ${partnerScope()}` },
      { status: 400 }
    )
  }
  if (!body.client_id || !body.client_secret) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'client_id and client_secret are required' },
      { status: 400 }
    )
  }
  if (!verifyClientCredentials(body.client_id, body.client_secret)) {
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Invalid client credentials' },
      { status: 401 }
    )
  }

  try {
    return NextResponse.json(issuePartnerToken())
  } catch (err) {
    console.error('[GrabFood] partner token issue failed:', err)
    return NextResponse.json({ error: 'temporarily_unavailable' }, { status: 503 })
  }
}
