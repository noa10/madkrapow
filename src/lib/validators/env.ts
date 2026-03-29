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

if (process.env.SKIP_ENV_VALIDATION === 'true') {
  env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_mock',
    STRIPE_SECRET_KEY: 'sk_test_mock',
    STRIPE_WEBHOOK_SECRET: 'whsec_mock',
    LALAMOVE_API_KEY: 'mock-api-key',
    LALAMOVE_API_SECRET: 'mock-api-secret',
    LALAMOVE_ENV: 'sandbox' as const,
    NEXT_PUBLIC_GOOGLE_MAPS_KEY: 'AIzaMockKey',
    NEXT_PUBLIC_URL: 'https://localhost:3000',
    RESEND_API_KEY: 're_mock',
    STORE_LATITUDE: 3.1390,
    STORE_LONGITUDE: 101.6869,
    STORE_ADDRESS: 'Mock Store Address',
    STORE_CITY: 'Kuala Lumpur',
    STORE_PHONE: '+60123456789',
    SENTRY_DSN: undefined,
  }
} else {
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

  const parsed = envSchema.safeParse(envData)

  if (!parsed.success) {
    // Only log on server to avoid console noise on client
    if (isServer) {
      console.error('❌ Environment validation failed:')
      console.error(parsed.error.flatten().fieldErrors)
    }
    
    // Only throw on server if critical variables are missing
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
