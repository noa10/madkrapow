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

const ciEnvVars = ['CI', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_GIT_PROVIDER', 'VERCEL_GIT_REPO_SLUG'];

function isCI() {
  return ciEnvVars.some(key => process.env[key]) || process.env.CI === 'true' || process.env.CI === '1';
}

function isVercelPreview() {
  return process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_URL;
}

console.log('🔍 Validating environment variables...\n');

if (isCI() && process.env.SKIP_ENV_VALIDATION === 'true') {
  console.log('⏭️  SKIP_ENV_VALIDATION is set - skipping validation');
  console.log('✅ Environment validation skipped for CI/Preview environment');
  process.exit(0);
}

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
  console.error('❌ Missing required environment variables:\n');
  missing.forEach(v => console.error(`   - ${v}`));
  
  if (isCI() || isVercelPreview()) {
    console.error('\n📦 Vercel/CI Environment Detected');
    console.error('   To skip validation in CI/Preview, set SKIP_ENV_VALIDATION=true');
    console.error('   In Vercel: Project Settings → Environment Variables → Add VAR_NAME=value');
    console.error('   Or add to vercel.json: { "env": { "SKIP_ENV_VALIDATION": "true" } }');
  } else {
    console.error('\n📝 To fix locally:');
    console.error('   1. Copy .env.local.example to .env.local');
    console.error('   2. Fill in your actual values');
    console.error('   3. Restart your development server');
  }
  
  process.exit(1);
}

if (invalid.length > 0) {
  console.error('❌ Invalid environment variables:\n');
  invalid.forEach(v => console.error(`   - ${v}`));
  
  const hints = {
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'Should start with "pk_"',
    STRIPE_SECRET_KEY: 'Should start with "sk_"',
    STRIPE_WEBHOOK_SECRET: 'Should start with "whsec_"',
    NEXT_PUBLIC_GOOGLE_MAPS_KEY: 'Should start with "AIza"',
    RESEND_API_KEY: 'Should start with "re_"',
    LALAMOVE_ENV: 'Should be "sandbox" or "production"',
    STORE_PHONE: 'Should start with "+60" (Malaysia)',
  };
  
  console.error('\n💡 Value hints:');
  invalid.forEach(v => {
    if (hints[v]) {
      console.error(`   - ${v}: ${hints[v]}`);
    }
  });
  
  console.error('\n📝 Please check your values in .env.local and try again.');
  process.exit(1);
}

console.log('✅ All required environment variables are set correctly!');
