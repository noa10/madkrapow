#!/usr/bin/env node

/**
 * Promote a user to admin role
 *
 * Usage:
 *   node scripts/update-admin-user.js <email>
 *   ADMIN_EMAIL=user@example.com node scripts/update-admin-user.js
 *
 * Environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key (required for admin operations)
 *   ADMIN_EMAIL - Email of user to promote (optional, can be passed as argument)
 *
 * Example:
 *   node scripts/update-admin-user.js admin@madkrapow.com
 */

const { createClient } = require('@supabase/supabase-js');

// Validate environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing required environment variables');
  console.error('  NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function updateUserRole() {
  // Get email from command line argument or environment variable
  const email = process.argv[2] || process.env.ADMIN_EMAIL;

  if (!email) {
    console.error('Error: No email provided');
    console.error('Usage: node scripts/update-admin-user.js <email>');
    console.error('Or set ADMIN_EMAIL environment variable');
    process.exit(1);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error(`Error: Invalid email format: ${email}`);
    process.exit(1);
  }

  console.log(`Promoting user: ${email}`);

  // First, find the user by email
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();

  if (listError) {
    console.error('Error listing users:', listError.message);
    process.exit(1);
  }

  const user = users.users.find(u => u.email === email);

  if (!user) {
    console.error(`Error: User with email "${email}" not found`);
    console.error('They may need to sign up first.');
    process.exit(1);
  }

  console.log(`Found user: ${user.id}`);

  // Update the user's app metadata so admin access is server-trusted
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      role: 'admin'
    }
  });

  if (error) {
    console.error('Error updating user:', error.message);
    process.exit(1);
  }

  console.log('✓ Successfully updated user app metadata');
  console.log('  Role:', data.user.app_metadata?.role);

  // Verify the update
  const { data: verifyData, error: verifyError } = await supabase.auth.admin.getUserById(user.id);

  if (verifyError) {
    console.error('Error verifying update:', verifyError.message);
    process.exit(1);
  }

  console.log('✓ Verification successful');
  console.log('  User ID:', verifyData.user.id);
  console.log('  Email:', verifyData.user.email);
  console.log('  Role:', verifyData.user.app_metadata?.role);
}

updateUserRole().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
