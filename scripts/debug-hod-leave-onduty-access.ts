/**
 * Diagnostic Script: HOD Leave/OnDuty Access Issue
 *
 * This script helps diagnose why a HOD user with academic leave/onduty permissions
 * is not seeing the menu items or cannot access the pages.
 *
 * Run this with: npx tsx scripts/debug-hod-leave-onduty-access.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('\n=================================================');
  console.log('🔍 HOD Leave/OnDuty Access Diagnostic Tool');
  console.log('=================================================\n');

  // Get user email or ID
  const userIdentifier = await question('Enter HOD user email or user ID: ');

  if (!userIdentifier) {
    console.error('❌ User identifier is required');
    rl.close();
    return;
  }

  console.log('\n📊 Running diagnostics...\n');

  // Step 1: Find the user
  console.log('Step 1: Finding user in profiles table...');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .or(`email.eq.${userIdentifier},id.eq.${userIdentifier}`)
    .single();

  if (profileError || !profile) {
    console.error('❌ User not found:', profileError?.message);
    rl.close();
    return;
  }

  console.log('✅ User found:');
  console.log(`   - ID: ${profile.id}`);
  console.log(`   - Name: ${profile.full_name}`);
  console.log(`   - Email: ${profile.email}`);
  console.log(`   - Role (legacy): ${profile.role}`);
  console.log(`   - Institution ID: ${profile.institution_id}`);
  console.log(`   - Is Super Admin: ${profile.is_super_admin || false}`);

  // Step 2: Check user_roles assignments
  console.log('\n\nStep 2: Checking user_roles assignments...');
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select(`
      id,
      role_id,
      is_primary,
      assigned_at,
      custom_roles!inner (
        id,
        role_key,
        role_name,
        description,
        permissions
      )
    `)
    .eq('user_id', profile.id);

  if (rolesError) {
    console.error('❌ Error fetching user roles:', rolesError.message);
  } else if (!userRoles || userRoles.length === 0) {
    console.log('⚠️  No roles found in user_roles table');
    console.log('   This user is using legacy role system (profiles.role field)');
    console.log('   Legacy role:', profile.role);

    // Check if legacy role has a matching custom_role entry
    console.log('\n\nStep 3: Checking custom_roles for legacy role...');
    const { data: customRole, error: customRoleError } = await supabase
      .from('custom_roles')
      .select('*')
      .eq('role_key', profile.role)
      .single();

    if (customRoleError || !customRole) {
      console.error('❌ Custom role not found for legacy role:', profile.role);
      console.log('   The legacy role does not have permissions defined in custom_roles table');
    } else {
      console.log('✅ Custom role found for legacy role:');
      console.log(`   - Role Key: ${customRole.role_key}`);
      console.log(`   - Role Name: ${customRole.role_name}`);
      console.log(`   - Description: ${customRole.description}`);
      console.log(`   - Is Active: ${customRole.is_active}`);

      await checkPermissions(customRole.permissions);
    }
  } else {
    console.log(`✅ Found ${userRoles.length} role(s) assigned:`);
    userRoles.forEach((ur: any, index: number) => {
      const role = ur.custom_roles;
      console.log(`\n   Role ${index + 1}:`);
      console.log(`   - ID: ${role.id}`);
      console.log(`   - Key: ${role.role_key}`);
      console.log(`   - Name: ${role.role_name}`);
      console.log(`   - Is Primary: ${ur.is_primary}`);
      console.log(`   - Assigned At: ${ur.assigned_at}`);
    });

    // Step 3: Check permissions for all roles
    console.log('\n\nStep 3: Checking permissions for each role...');
    for (let i = 0; i < userRoles.length; i++) {
      const ur = userRoles[i] as any;
      const role = ur.custom_roles;
      console.log(`\n   Permissions for "${role.role_name}":`);
      await checkPermissions(role.permissions);
    }

    // Step 4: Get merged permissions
    console.log('\n\nStep 4: Getting merged permissions (using DB function)...');
    const { data: mergedPerms, error: mergedError } = await supabase
      .rpc('get_user_merged_permissions', { p_user_id: profile.id });

    if (mergedError) {
      console.error('❌ Error getting merged permissions:', mergedError.message);
    } else {
      console.log('✅ Merged permissions retrieved successfully');
      await checkPermissions(mergedPerms);
    }
  }

  // Step 5: Check sidebar menu configuration
  console.log('\n\nStep 5: Checking required permissions for Leave/OnDuty pages...');
  const requiredPermissions = {
    '/academic/leave-onduty/approvals': 'academic.leave_onduty.approve',
    '/academic/leave-onduty/settings': 'academic.leave_onduty.manage',
    '/academic/leave-onduty/reports': 'academic.leave_onduty.reports',
    '/learners/leave-onduty/apply': 'learners.leave_onduty.apply',
    '/learners/leave-onduty/my-applications': 'learners.leave_onduty.view',
  };

  console.log('\n   Required permissions by route:');
  for (const [route, perm] of Object.entries(requiredPermissions)) {
    console.log(`   - ${route} → ${perm}`);
  }

  // Step 6: Summary and recommendations
  console.log('\n\n=================================================');
  console.log('📋 DIAGNOSTIC SUMMARY');
  console.log('=================================================\n');

  if (profile.is_super_admin) {
    console.log('✅ User is a Super Admin - should have access to ALL pages');
  } else if (!userRoles || userRoles.length === 0) {
    console.log('⚠️  User is using LEGACY role system');
    console.log('\nRecommendations:');
    console.log('1. Check if custom_roles table has an entry for role:', profile.role);
    console.log('2. If not, create a custom role with the required permissions');
    console.log('3. Or migrate user to multi-role system using user_roles table');
  } else {
    console.log('✅ User is using MULTI-ROLE system');
    console.log('\nCheck the permissions listed above to ensure:');
    console.log('1. At least ONE of these permissions is granted:');
    console.log('   - academic.leave_onduty.approve');
    console.log('   - academic.leave_onduty.manage');
    console.log('   - academic.leave_onduty.reports');
    console.log('\n2. Permissions are stored as boolean true in JSONB');
    console.log('\n3. User has reloaded the application after permission changes');
  }

  console.log('\n=================================================\n');
  rl.close();
}

async function checkPermissions(permissions: any) {
  if (!permissions || typeof permissions !== 'object') {
    console.log('   ❌ No permissions found or invalid format');
    return;
  }

  const leaveOndutyPerms = [
    'academic.leave_onduty.approve',
    'academic.leave_onduty.manage',
    'academic.leave_onduty.reports',
    'learners.leave_onduty.apply',
    'learners.leave_onduty.view',
    'learners.leave_onduty.edit',
    'learners.leave_onduty.cancel',
  ];

  const foundPerms: string[] = [];
  const missingPerms: string[] = [];

  for (const perm of leaveOndutyPerms) {
    if (permissions[perm] === true) {
      foundPerms.push(perm);
    } else {
      missingPerms.push(perm);
    }
  }

  if (foundPerms.length > 0) {
    console.log('   ✅ Leave/OnDuty permissions found:');
    foundPerms.forEach(p => console.log(`      ✓ ${p}: true`));
  }

  if (missingPerms.length > 0) {
    console.log('   ⚠️  Missing Leave/OnDuty permissions:');
    missingPerms.forEach(p => {
      const value = permissions[p];
      if (value === undefined) {
        console.log(`      ✗ ${p}: NOT SET`);
      } else {
        console.log(`      ✗ ${p}: ${value} (should be true)`);
      }
    });
  }

  // Show total permission count
  const totalPerms = Object.keys(permissions).length;
  const truePerms = Object.values(permissions).filter(v => v === true).length;
  console.log(`\n   Total permissions: ${totalPerms} (${truePerms} granted)`);
}

main().catch(console.error);
