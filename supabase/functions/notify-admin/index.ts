import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { createGoogleAccessTokenProvider, createWorkerHandler } from './worker.mjs'

// This endpoint uses an independent high-entropy worker secret. Deploy with
// --no-verify-jwt; a bearer prefix (or a merchant JWT) grants no worker access.
// The service-role key stays inside this function and is never needed by a scheduler.
let handler: ((request: Request) => Promise<Response>) | undefined
Deno.serve(async (request: Request) => {
  try {
    if (!handler) {
      const url = Deno.env.get('SUPABASE_URL')
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      const workerSecret = Deno.env.get('MERCHANT_NOTIFICATION_WORKER_SECRET')
      const serviceAccount = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') ?? '{}')
      if (!url || !serviceKey || !workerSecret || workerSecret.length < 32) {
        return Response.json({ error: 'Worker unavailable' }, { status: 503 })
      }
      handler = createWorkerHandler({
        supabase: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
        workerSecret,
        getAccessToken: createGoogleAccessTokenProvider(serviceAccount),
        projectId: serviceAccount.project_id,
      })
    }
    return await handler!(request)
  } catch {
    // Do not serialize Supabase/FCM errors: they may include tokens or credentials.
    return Response.json({ error: 'Worker unavailable' }, { status: 503 })
  }
})
