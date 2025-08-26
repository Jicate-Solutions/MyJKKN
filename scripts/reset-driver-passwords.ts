/**
 * Script to reset passwords for driver users
 * Run this script to set proper passwords for all driver accounts
 * 
 * Usage: npx tsx scripts/reset-driver-passwords.ts
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// List of driver emails
const driverEmails = [
  'arthanareswaran22@jkkn.ac.in',
  'rajesh18@jkkn.ac.in',
  'saravanan6@jkkn.ac.in',
  'thirumoorthy11@jkkn.ac.in',
  'kannan14@jkkn.ac.in',
  'ramachjandran16@jkkn.ac.in',
  'sakthivel32@jkkn.ac.in',
  'sivakumar36@jkkn.ac.in',
  'kathirvel5@jkkn.ac.in',
  'manojkumar12@jkkn.ac.in',
  'sathiyamoorthy7@jkkn.ac.in',
  'suthagar29@jkkn.ac.in',
  'devendran31@jkkn.ac.in',
  'gokul19@jkkn.ac.in',
  'muthukumar37@jkkn.ac.in',
  'arun24@jkkn.ac.in',
  'siva23@jkkn.ac.in',
  'selvaraj15@jkkn.ac.in',
  'ravi10@jkkn.ac.in',
  'thavasiayappan20@jkkn.ac.in'
];

async function resetDriverPasswords() {
  console.log('Starting password reset for driver users...\n');
  
  const results = {
    success: [],
    failed: []
  } as { success: string[]; failed: Array<{ email: string; error: string }> };

  for (const email of driverEmails) {
    try {
      console.log(`Processing ${email}...`);
      
      // Get the user first
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (listError) {
        throw listError;
      }
      
      const user = users.find(u => u.email === email);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      // Update the user's password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        {
          password: 'Driver@123',
          email_confirm: true
        }
      );
      
      if (updateError) {
        throw updateError;
      }
      
      console.log(`✓ Password reset for ${email}`);
      results.success.push(email);
      
    } catch (error) {
      console.error(`✗ Failed to reset password for ${email}:`, error);
      results.failed.push({
        email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  console.log('\n=== Summary ===');
  console.log(`Success: ${results.success.length} users`);
  console.log(`Failed: ${results.failed.length} users`);
  
  if (results.failed.length > 0) {
    console.log('\nFailed users:');
    results.failed.forEach(f => {
      console.log(`  - ${f.email}: ${f.error}`);
    });
  }
  
  console.log('\n=== Login Instructions ===');
  console.log('All driver users can now login with:');
  console.log('Email: [their email]');
  console.log('Password: Driver@123');
  console.log('\nUsers should change their password after first login.');
}

// Run the script
resetDriverPasswords().catch(console.error);