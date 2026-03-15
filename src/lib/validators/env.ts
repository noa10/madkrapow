import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  LALAMOVE_API_KEY: z.string().min(1),
  LALAMOVE_API_SECRET: z.string().min(1),
  LALAMOVE_ENV: z.enum(['sandbox', 'production']),
  NEXT_PUBLIC_GOOGLE_MAPS_KEY: z.string().startsWith('AIza'),
  NEXT_PUBLIC_URL: z.string().url(),
  RESEND_API_KEY: z.string().startsWith('re_'),
  STORE_LATITUDE: z.string().transform(Number),
  STORE_LONGITUDE: z.string().transform(Number),
  STORE_ADDRESS: z.string().min(1),
  STORE_PHONE: z.string().regex(/^\+60/),
  SENTRY_DSN: z.string().url().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables. Check .env.local.example for required values.')
}

export const env = parsed.data
