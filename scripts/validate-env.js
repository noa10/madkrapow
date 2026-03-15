require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');

const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'LALAMOVE_API_KEY',
  'LALAMOVE_API_SECRET',
  'LALAMOVE_ENV',
  'NEXT_PUBLIC_GOOGLE_MAPS_KEY',
  'NEXT_PUBLIC_URL',
  'RESEND_API_KEY',
  'STORE_LATITUDE',
  'STORE_LONGITUDE',
  'STORE_ADDRESS',
  'STORE_PHONE',
];

const envSchema = {
  NEXT_PUBLIC_SUPABASE_URL: (v) => v && v.startsWith('http'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: (v) => v && v.length > 0,
  SUPABASE_SERVICE_ROLE_KEY: (v) => v && v.length > 0,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: (v) => v && v.startsWith('pk_'),
  STRIPE_SECRET_KEY: (v) => v && v.startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: (v) => v && v.startsWith('whsec_'),
  LALAMOVE_API_KEY: (v) => v && v.length > 0,
  LALAMOVE_API_SECRET: (v) => v && v.length > 0,
  LALAMOVE_ENV: (v) => v === 'sandbox' || v === 'production',
  NEXT_PUBLIC_GOOGLE_MAPS_KEY: (v) => v && v.startsWith('AIza'),
  NEXT_PUBLIC_URL: (v) => v && v.startsWith('http'),
  RESEND_API_KEY: (v) => v && v.startsWith('re_'),
  STORE_LATITUDE: (v) => v && !isNaN(parseFloat(v)),
  STORE_LONGITUDE: (v) => v && !isNaN(parseFloat(v)),
  STORE_ADDRESS: (v) => v && v.length > 0,
  STORE_PHONE: (v) => v && v.startsWith('+60'),
};

console.log('🔍 Validating environment variables...');

const missing = [];
const invalid = [];

for (const envVar of requiredEnvVars) {
  const value = process.env[envVar];
  
  if (!value) {
    missing.push(envVar);
  } else if (envSchema[envVar] && !envSchema[envVar](value)) {
    invalid.push(envVar);
  }
}

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:');
  missing.forEach(v => console.error(`   - ${v}`));
  console.error('\nPlease copy .env.local.example to .env.local and fill in the values.');
  process.exit(1);
}

if (invalid.length > 0) {
  console.error('❌ Invalid environment variables:');
  invalid.forEach(v => console.error(`   - ${v}`));
  console.error('\nPlease check the values in .env.local.');
  process.exit(1);
}

console.log('✅ All required environment variables are set!');
