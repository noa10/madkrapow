import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
  LALAMOVE_API_KEY: z.string().min(1).optional(),
  LALAMOVE_API_SECRET: z.string().min(1).optional(),
  LALAMOVE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  LALAMOVE_BASE_URL: z.string().url().optional(),
  LALAMOVE_MARKET: z.string().default('MY'),
  LALAMOVE_CITY_NAME: z.string().default('Shah Alam'),
  LALAMOVE_WEBHOOK_URL: z.string().url().optional(),
  LALAMOVE_ENABLED: z.union([z.string(), z.boolean()]).transform(v =>
    typeof v === 'string' ? v === 'true' : v
  ).default(true),
  LALAMOVE_DEFAULT_STANDARD_SERVICE_TYPE: z.string().default('MOTORCYCLE'),
  LALAMOVE_DEFAULT_BULK_SERVICE_TYPE: z.string().default('CAR'),
  LALAMOVE_POLLING_INTERVAL_MS: z.union([z.string(), z.number()]).transform(v =>
    typeof v === 'string' ? parseInt(v) : v
  ).default(30000),
  HUBBOPOS_ENABLED: z.union([z.string(), z.boolean()]).transform(v =>
    typeof v === 'string' ? v === 'true' : v
  ).default(false),
  HUBBOPOS_API_BASE_URL: z.string().url().optional(),
  HUBBOPOS_CLIENT_ID: z.string().min(1).optional(),
  HUBBOPOS_CLIENT_SECRET: z.string().min(1).optional(),
  HUBBOPOS_SCOPE: z.string().default('mexpos.partner_api'),
  HUBBOPOS_MERCHANT_ID: z.string().min(1).optional(),
  HUBBOPOS_LOCATION_ID: z.string().optional(),
  HUBBOPOS_SYNC_INTERVAL_MINUTES: z.union([z.string(), z.number()]).transform(v =>
    typeof v === 'string' ? parseInt(v) : v
  ).default(5),
  HUBBOPOS_REQUEST_TIMEOUT_MS: z.union([z.string(), z.number()]).transform(v =>
    typeof v === 'string' ? parseInt(v) : v
  ).default(10000),
  HUBBOPOS_MAX_RETRIES: z.union([z.string(), z.number()]).transform(v =>
    typeof v === 'string' ? parseInt(v) : v
  ).default(3),
  HUBBOPOS_CIRCUIT_BREAKER_THRESHOLD: z.union([z.string(), z.number()]).transform(v =>
    typeof v === 'string' ? parseInt(v) : v
  ).default(5),
  HUBBOPOS_CIRCUIT_BREAKER_RESET_MS: z.union([z.string(), z.number()]).transform(v =>
    typeof v === 'string' ? parseInt(v) : v
  ).default(60000),
  CRON_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_GOOGLE_MAPS_KEY: z.string().startsWith('AIza'),
  NEXT_PUBLIC_URL: z.string().url(),
  RESEND_API_KEY: z.string().startsWith('re_').optional(),
  STORE_LATITUDE: z.union([z.string(), z.number()]).transform(v => typeof v === 'string' ? parseFloat(v) : v),
  STORE_LONGITUDE: z.union([z.string(), z.number()]).transform(v => typeof v === 'string' ? parseFloat(v) : v),
  STORE_ADDRESS: z.string().min(1),
  STORE_CITY: z.string().min(1).default('Kuala Lumpur'),
  STORE_PHONE: z.string().regex(/^\+60/),
  SENTRY_DSN: z.string().url().optional(),
})

type Env = z.infer<typeof envSchema>

let env: Env

const isServer = typeof window === 'undefined'

const envData = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  LALAMOVE_API_KEY: process.env.LALAMOVE_API_KEY,
  LALAMOVE_API_SECRET: process.env.LALAMOVE_API_SECRET,
  LALAMOVE_ENV: process.env.LALAMOVE_ENV,
  LALAMOVE_BASE_URL: process.env.LALAMOVE_BASE_URL,
  LALAMOVE_MARKET: process.env.LALAMOVE_MARKET,
  LALAMOVE_CITY_NAME: process.env.LALAMOVE_CITY_NAME,
  LALAMOVE_WEBHOOK_URL: process.env.LALAMOVE_WEBHOOK_URL,
  LALAMOVE_ENABLED: process.env.LALAMOVE_ENABLED,
  LALAMOVE_DEFAULT_STANDARD_SERVICE_TYPE: process.env.LALAMOVE_DEFAULT_STANDARD_SERVICE_TYPE,
  LALAMOVE_DEFAULT_BULK_SERVICE_TYPE: process.env.LALAMOVE_DEFAULT_BULK_SERVICE_TYPE,
  LALAMOVE_POLLING_INTERVAL_MS: process.env.LALAMOVE_POLLING_INTERVAL_MS,
  HUBBOPOS_ENABLED: process.env.HUBBOPOS_ENABLED,
  HUBBOPOS_API_BASE_URL: process.env.HUBBOPOS_API_BASE_URL,
  HUBBOPOS_CLIENT_ID: process.env.HUBBOPOS_CLIENT_ID,
  HUBBOPOS_CLIENT_SECRET: process.env.HUBBOPOS_CLIENT_SECRET,
  HUBBOPOS_SCOPE: process.env.HUBBOPOS_SCOPE,
  HUBBOPOS_MERCHANT_ID: process.env.HUBBOPOS_MERCHANT_ID,
  HUBBOPOS_LOCATION_ID: process.env.HUBBOPOS_LOCATION_ID,
  HUBBOPOS_SYNC_INTERVAL_MINUTES: process.env.HUBBOPOS_SYNC_INTERVAL_MS,
  HUBBOPOS_REQUEST_TIMEOUT_MS: process.env.HUBBOPOS_REQUEST_TIMEOUT_MS,
  HUBBOPOS_MAX_RETRIES: process.env.HUBBOPOS_MAX_RETRIES,
  HUBBOPOS_CIRCUIT_BREAKER_THRESHOLD: process.env.HUBBOPOS_CIRCUIT_BREAKER_THRESHOLD,
  HUBBOPOS_CIRCUIT_BREAKER_RESET_MS: process.env.HUBBOPOS_CIRCUIT_BREAKER_RESET_MS,
  CRON_SECRET: process.env.CRON_SECRET,
  NEXT_PUBLIC_GOOGLE_MAPS_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY,
  NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  STORE_LATITUDE: process.env.STORE_LATITUDE || '3.1390',
  STORE_LONGITUDE: process.env.STORE_LONGITUDE || '101.6869',
  STORE_ADDRESS: process.env.STORE_ADDRESS || 'Mock Store Address',
  STORE_CITY: process.env.STORE_CITY || 'Kuala Lumpur',
  STORE_PHONE: process.env.STORE_PHONE || '+60123456789',
  SENTRY_DSN: process.env.SENTRY_DSN,
}

if (process.env.SKIP_ENV_VALIDATION === 'true') {
  env = envData as unknown as Env
} else {
  const parsed = envSchema.safeParse(envData)

  if (!parsed.success) {
    if (isServer) {
      console.error('❌ Environment validation failed:')
      console.error(parsed.error.flatten().fieldErrors)
    }

    if (isServer) {
      const criticalServerVars = ['STRIPE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
      const missingCritical = parsed.error.issues.some(issue => criticalServerVars.includes(issue.path[0] as string))
      if (missingCritical) {
        throw new Error('Missing critical server environment variables.')
      }
    }
  }

  env = (parsed.data || envData) as unknown as Env
}

export { env }
