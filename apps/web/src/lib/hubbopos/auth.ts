import { env } from '@/lib/validators/env';
import { HubboPosTokenResponse } from './types';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: CachedToken | null = null;

export async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  const baseUrl = env.HUBBOPOS_API_BASE_URL;
  const clientId = env.HUBBOPOS_CLIENT_ID;
  const clientSecret = env.HUBBOPOS_CLIENT_SECRET;
  const scope = env.HUBBOPOS_SCOPE || 'mexpos.partner_api';

  if (!baseUrl || !clientId || !clientSecret) {
    throw new Error('HubboPOS credentials not configured. Check HUBBOPOS_API_BASE_URL, HUBBOPOS_CLIENT_ID, and HUBBOPOS_CLIENT_SECRET.');
  }

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    }),
    signal: AbortSignal.timeout(env.HUBBOPOS_REQUEST_TIMEOUT_MS || 10_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HubboPOS token request failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as HubboPosTokenResponse;

  if (!data.access_token) {
    throw new Error('HubboPOS token response missing access_token');
  }

  const expiresAt = Date.now() + (data.expires_in - 60) * 1000;

  tokenCache = {
    accessToken: data.access_token,
    expiresAt,
  };

  return data.access_token;
}

export function clearTokenCache(): void {
  tokenCache = null;
}

export function isTokenCached(): boolean {
  return tokenCache !== null && Date.now() < tokenCache.expiresAt;
}
