/**
 * Talent Portal Test Profiles Seed Script
 * ----------------------------------------
 * Creates test profiles for talent portals (Builder, Cohort, Production) linked to auth users.
 *
 * Usage: npx tsx scripts/seed-talent-test-profiles.ts
 *
 * This script:
 * 1. Checks for existing test users in auth.users
 * 2. Gets valid department IDs from departments table
 * 3. Creates/updates talent profiles linked to auth users
 * 4. Adds sample skills for builders
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(__dirname, '../.env.local') });

// Initialize Supabase client with service role key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ===== HELPER FUNCTIONS =====

async function getTestUsers() {
  console.log('\n--- Checking Auth Users ---');

  // Get users with test/demo emails
  const { data: authUsers, error } = await supabase.auth.admin.listUsers({
    perPage: 100,
  });

  if (error) {
    console.error('Error fetching auth users:', error.message);
    return [];
  }

  console.log(`Found ${authUsers.users.length} total auth users`);

  // Find test users (look for specific patterns)
  const testUsers = (authUsers.users as Array<{ id: string; email?: string }>).filter(
    (u) =>
      u.email?.includes('test') ||
      u.email?.includes('demo') ||
      u.email?.includes('builder') ||
      u.email?.includes('cohort') ||
      u.email?.includes('production') ||
      u.email?.includes('superadmin')
  );

  console.log(`Found ${testUsers.length} potential test users:`);
  testUsers.forEach((u) => {
    console.log(`  - ${u.email} (id: ${u.id})`);
  });

  return testUsers;
}

async function getOrCreateTestUser(email: string, password: string, fullName: string) {
  // Try to create user first (faster than listing all users)
  const { data: newUser, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (!error && newUser) {
    console.log(`  Created user: ${email} (id: ${newUser.user.id})`);
    return newUser.user;
  }

  // If user already exists, try to find them by listing users
  if (error?.message.includes('already been registered')) {
    // List users and find by email
    const { data: users } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });
    const existingUser = (users?.users as Array<{ id: string; email?: string }> | undefined)?.find((u) => u.email === email);
    if (existingUser) {
      console.log(`  User exists: ${email} (id: ${existingUser.id})`);
      return existingUser;
    }
    console.log(`  User exists but could not retrieve: ${email}`);
  } else {
    console.error(`  Error creating user ${email}:`, error?.message);
  }

  return null;
}

async function getDepartmentId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('departments')
    .select('id, department_name, department_code')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error || !data) {
    console.log('Warning: No active departments found');
    return null;
  }

  console.log(`Using department: ${data.department_name} (${data.department_code}) - id: ${data.id}`);
  return data.id;
}

async function getInstitutionId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('institutions')
    .select('id, institution_name, institution_code')
    .limit(1)
    .single();

  if (error || !data) {
    console.log('Warning: No institutions found');
    return null;
  }

  console.log(`Using institution: ${data.institution_name} (${data.institution_code}) - id: ${data.id}`);
  return data.id;
}

async function getOrCreateProfile(userId: string, fullName: string, email: string): Promise<string | null> {
  // Check if profile exists
  const { data: existing, error: checkError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (existing) {
    console.log(`  Profile exists for user ${userId}`);
    return existing.id;
  }

  // Create profile
  const { data: newProfile, error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      full_name: fullName,
      email: email,
      role: 'user',
    })
    .select('id')
    .single();

  if (error) {
    console.error(`  Error creating profile:`, error.message);
    return null;
  }

  console.log(`  Created profile for user ${userId}`);
  return newProfile.id;
}

async function createBuilderProfile(
  userId: string,
  profileId: string,
  name: string,
  email: string,
  departmentId: string | null,
  institutionId: string | null
) {
  console.log('\n--- Creating Builder Profile ---');

  // Check if builder already exists for this user
  const { data: existing } = await supabase
    .from('sh_builders')
    .select('id, builder_code')
    .eq('user_id', profileId)
    .maybeSingle();

  if (existing) {
    console.log(`  Builder profile already exists: ${existing.builder_code}`);
    return existing.id;
  }

  // Generate unique code
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('sh_builders')
    .select('*', { count: 'exact', head: true });
  const code = `JKKN-BLD-${year}-${String((count || 0) + 1).padStart(3, '0')}`;

  const builderData = {
    user_id: profileId,
    builder_code: code,
    name: name,
    email: email,
    department_id: departmentId,
    institution_id: institutionId,
    trained_date: '2025-01-01',
    specialization: 'Full Stack Development',
    bio: 'Test builder profile for talent portal testing',
    hourly_rate: 500,
    total_earnings: 0,
    projects_completed: 0,
    is_internal: true,
    is_active: true,
    availability_status: 'available',
    tags: ['test', 'fullstack', 'react'],
  };

  const { data, error } = await supabase.from('sh_builders').insert(builderData).select('id').single();

  if (error) {
    console.error(`  Error creating builder:`, error.message);
    return null;
  }

  console.log(`  Created builder: ${code}`);

  // Add skills
  await addBuilderSkills(data.id);

  return data.id;
}

async function addBuilderSkills(builderId: string) {
  console.log('  Adding builder skills...');

  const skills = [
    { builder_id: builderId, skill_name: 'React', skill_category: 'frontend', proficiency_level: 4, years_experience: 2 },
    { builder_id: builderId, skill_name: 'Next.js', skill_category: 'frontend', proficiency_level: 4, years_experience: 1.5 },
    { builder_id: builderId, skill_name: 'TypeScript', skill_category: 'language', proficiency_level: 4, years_experience: 2 },
  ];

  for (const skill of skills) {
    const { error } = await supabase.from('sh_builder_skills').insert(skill);
    if (error && !error.message.includes('duplicate')) {
      console.error(`    Error adding skill ${skill.skill_name}:`, error.message);
    } else {
      console.log(`    Added skill: ${skill.skill_name}`);
    }
  }
}

async function createCohortMemberProfile(
  userId: string,
  profileId: string,
  name: string,
  email: string,
  departmentId: string | null,
  institutionId: string | null
) {
  console.log('\n--- Creating Cohort Member Profile ---');

  // Check if cohort member already exists for this user
  const { data: existing } = await supabase
    .from('sh_cohort_members')
    .select('id, cohort_code')
    .eq('user_id', profileId)
    .maybeSingle();

  if (existing) {
    console.log(`  Cohort member profile already exists: ${existing.cohort_code}`);
    return existing.id;
  }

  // Generate unique code
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('sh_cohort_members')
    .select('*', { count: 'exact', head: true });
  const code = `JKKN-COH-${year}-${String((count || 0) + 1).padStart(3, '0')}`;

  const cohortData = {
    user_id: profileId,
    cohort_code: code,
    name: name,
    email: email,
    department_id: departmentId,
    institution_id: institutionId,
    level: 'co_lead',
    track: 'A',
    specializations: ['Web Development', 'Cloud Computing'],
    bio: 'Test cohort member profile for talent portal testing',
    sessions_observed: 5,
    sessions_co_led: 2,
    sessions_led: 0,
    sessions_master: 0,
    total_hours_trained: 30,
    total_participants_trained: 50,
    total_earnings: 15000,
    is_active: true,
    availability_status: 'available',
    tags: ['test', 'training', 'tech'],
  };

  const { data, error } = await supabase.from('sh_cohort_members').insert(cohortData).select('id').single();

  if (error) {
    console.error(`  Error creating cohort member:`, error.message);
    return null;
  }

  console.log(`  Created cohort member: ${code}`);
  return data.id;
}

async function createProductionLearnerProfile(
  userId: string,
  profileId: string,
  name: string,
  email: string,
  departmentId: string | null,
  institutionId: string | null
) {
  console.log('\n--- Creating Production Learner Profile ---');

  // Check if production learner already exists for this user
  const { data: existing } = await supabase
    .from('sh_production_learners')
    .select('id, learner_code')
    .eq('user_id', profileId)
    .maybeSingle();

  if (existing) {
    console.log(`  Production learner profile already exists: ${existing.learner_code}`);
    return existing.id;
  }

  // Generate unique code
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('sh_production_learners')
    .select('*', { count: 'exact', head: true });
  const code = `JKKN-PRD-${year}-${String((count || 0) + 1).padStart(3, '0')}`;

  const productionData = {
    user_id: profileId,
    learner_code: code,
    name: name,
    email: email,
    department_id: departmentId,
    institution_id: institutionId,
    division: 'video',
    skill_level: 'intermediate',
    specializations: ['Video Editing', 'Motion Graphics'],
    software_tools: ['Adobe Premiere Pro', 'After Effects'],
    bio: 'Test production learner profile for talent portal testing',
    orders_completed: 3,
    total_deliverables: 10,
    total_earnings: 25000,
    is_active: true,
    availability_status: 'available',
    tags: ['test', 'video', 'editing'],
  };

  const { data, error } = await supabase.from('sh_production_learners').insert(productionData).select('id').single();

  if (error) {
    console.error(`  Error creating production learner:`, error.message);
    return null;
  }

  console.log(`  Created production learner: ${code}`);
  return data.id;
}

// ===== MAIN FUNCTION =====

async function main() {
  console.log('========================================');
  console.log('  Talent Portal Test Profiles Seed');
  console.log('========================================');
  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);

  try {
    // Get existing test users
    await getTestUsers();

    // Get department and institution
    const departmentId = await getDepartmentId();
    const institutionId = await getInstitutionId();

    console.log('\n========================================');
    console.log('  Creating Test Users & Profiles');
    console.log('========================================');

    const TEST_PASSWORD = 'Demo@JKKN2026';

    // 1. Create Builder Test User
    console.log('\n=== BUILDER ===');
    const builderUser = await getOrCreateTestUser(
      'test.builder@jkkn.ac.in',
      TEST_PASSWORD,
      'Test Builder'
    );
    if (builderUser) {
      const profileId = await getOrCreateProfile(builderUser.id, 'Test Builder', 'test.builder@jkkn.ac.in');
      if (profileId) {
        await createBuilderProfile(
          builderUser.id,
          profileId,
          'Test Builder',
          'test.builder@jkkn.ac.in',
          departmentId,
          institutionId
        );
      }
    }

    // 2. Create Cohort Member Test User
    console.log('\n=== COHORT MEMBER ===');
    const cohortUser = await getOrCreateTestUser(
      'test.cohort@jkkn.ac.in',
      TEST_PASSWORD,
      'Test Cohort Member'
    );
    if (cohortUser) {
      const profileId = await getOrCreateProfile(cohortUser.id, 'Test Cohort Member', 'test.cohort@jkkn.ac.in');
      if (profileId) {
        await createCohortMemberProfile(
          cohortUser.id,
          profileId,
          'Test Cohort Member',
          'test.cohort@jkkn.ac.in',
          departmentId,
          institutionId
        );
      }
    }

    // 3. Create Production Learner Test User
    console.log('\n=== PRODUCTION LEARNER ===');
    const productionUser = await getOrCreateTestUser(
      'test.production@jkkn.ac.in',
      TEST_PASSWORD,
      'Test Production Learner'
    );
    if (productionUser) {
      const profileId = await getOrCreateProfile(productionUser.id, 'Test Production Learner', 'test.production@jkkn.ac.in');
      if (profileId) {
        await createProductionLearnerProfile(
          productionUser.id,
          profileId,
          'Test Production Learner',
          'test.production@jkkn.ac.in',
          departmentId,
          institutionId
        );
      }
    }

    // Verification queries
    console.log('\n========================================');
    console.log('  Verification');
    console.log('========================================');

    // Check builders
    const { data: builders, error: bErr } = await supabase
      .from('sh_builders')
      .select('id, builder_code, name, email, user_id, is_active')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!bErr && builders) {
      console.log('\n--- Builders (recent 5) ---');
      builders.forEach((b) => {
        console.log(`  ${b.builder_code}: ${b.name} (${b.email}) - user_id: ${b.user_id ? 'LINKED' : 'NOT LINKED'}`);
      });
    }

    // Check cohort members
    const { data: cohorts, error: cErr } = await supabase
      .from('sh_cohort_members')
      .select('id, cohort_code, name, email, user_id, is_active')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!cErr && cohorts) {
      console.log('\n--- Cohort Members (recent 5) ---');
      cohorts.forEach((c) => {
        console.log(`  ${c.cohort_code}: ${c.name} (${c.email}) - user_id: ${c.user_id ? 'LINKED' : 'NOT LINKED'}`);
      });
    }

    // Check production learners
    const { data: prods, error: pErr } = await supabase
      .from('sh_production_learners')
      .select('id, learner_code, name, email, user_id, is_active')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!pErr && prods) {
      console.log('\n--- Production Learners (recent 5) ---');
      prods.forEach((p) => {
        console.log(`  ${p.learner_code}: ${p.name} (${p.email}) - user_id: ${p.user_id ? 'LINKED' : 'NOT LINKED'}`);
      });
    }

    console.log('\n========================================');
    console.log('  Seed Complete!');
    console.log('========================================');
    console.log('\nTest Accounts Created:');
    console.log('  Password for all: Demo@JKKN2026');
    console.log('\n  Builder:');
    console.log('    Email: test.builder@jkkn.ac.in');
    console.log('    Portal: /builder');
    console.log('\n  Cohort Member:');
    console.log('    Email: test.cohort@jkkn.ac.in');
    console.log('    Portal: /cohort');
    console.log('\n  Production Learner:');
    console.log('    Email: test.production@jkkn.ac.in');
    console.log('    Portal: /production');

  } catch (error) {
    console.error('\nFatal error:', error);
    process.exit(1);
  }
}

main();
