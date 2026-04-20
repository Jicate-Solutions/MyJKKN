/**
 * Create MathWorks LTI Test Accounts (Email + Password, bypasses Google OAuth / Workspace MFA)
 *
 * WHY THIS EXISTS
 * ---------------
 * MathWorks integration testing needs MyJKKN accounts on @jkkn.ac.in domain but cannot
 * use Google OAuth because the Google Workspace policy enforces phone-based MFA for
 * external-network logins. Supabase email+password auth is independent of Google
 * Workspace, so these accounts let MathWorks log in without triggering MFA.
 *
 * WHAT GETS CREATED (idempotent — safe to re-run)
 * ----------------------------------------------
 *   lti.student@jkkn.ac.in   → role: student  (for MATLAB Grader launch testing)
 *   lti.faculty@jkkn.ac.in   → role: faculty  (for gradebook / NRPS testing)
 *
 * For each account:
 *   1. auth.users row (email_confirm = true, password set)
 *   2. profiles row (profile_completed = true)
 *   3. user_roles assignment (is_primary = true)
 *   4. user_institution_access grant
 *   5. learners_profiles row (student only, lifecycle_status = 'active')
 *
 * RUN
 * ---
 *   # Password injected via env, NOT hardcoded:
 *   export LTI_TEST_PASSWORD='MathWorks@LTI-2026'
 *   source .env.local
 *   npx tsx scripts/create-lti-test-accounts.ts
 *
 * OPTIONAL OVERRIDES
 * ------------------
 *   LTI_TEST_INSTITUTION_ID   — pin to a specific institution (default: first active)
 *   LTI_TEST_PROGRAM_ID       — pin student to a specific program (default: first active)
 *
 * OPTIONAL: REGISTER MATHWORKS LTI TOOL
 * -------------------------------------
 * If ALL of the following env vars are set, the script also registers a MathWorks
 * tool in `lti_tools` so the LTI launch button has something to POST to. If NONE
 * are set, tool registration is skipped (accounts-only mode). Mixed state errors.
 *
 *   MATHWORKS_CLIENT_ID         (MathWorks-assigned, used as LTI 1.3 client_id)
 *   MATHWORKS_DEPLOYMENT_ID     (MathWorks-assigned deployment identifier)
 *   MATHWORKS_LAUNCH_URL        (where MyJKKN POSTs signed JWT)
 *   MATHWORKS_PUBLIC_KEYSET_URL (MathWorks JWKS — we verify their callbacks with it)
 *   MATHWORKS_OIDC_AUTH_URL     (MathWorks OIDC auth endpoint)
 *   MATHWORKS_REDIRECT_URI      (post-launch redirect back into MyJKKN or MathWorks)
 *
 * Optional tool-registration tunables (sensible defaults provided):
 *   MATHWORKS_TOOL_TYPE   — matlab_grader (default) | matlab_online | matlab_academy | matlab_production_server
 *   MATHWORKS_TOOL_NAME   — display name (default: "MathWorks — <tool_type>")
 *
 * CLEANUP
 * -------
 *   npx tsx scripts/cleanup-lti-test-accounts.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = process.env.LTI_TEST_PASSWORD;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Fix: source .env.local && npx tsx scripts/create-lti-test-accounts.ts');
  process.exit(1);
}

if (!PASSWORD || PASSWORD.length < 12) {
  console.error('❌ Missing or weak LTI_TEST_PASSWORD env var (must be ≥12 chars)');
  console.error('   Fix: export LTI_TEST_PASSWORD=\'MathWorks@LTI-2026\'');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type LtiAccount = {
  email: string;
  fullName: string;
  roleKey: 'student' | 'faculty';
  isStudent: boolean;
};

const ACCOUNTS: LtiAccount[] = [
  {
    email: 'lti.student@jkkn.ac.in',
    fullName: 'LTI Test Student (MathWorks)',
    roleKey: 'student',
    isStudent: true,
  },
  {
    email: 'lti.faculty@jkkn.ac.in',
    fullName: 'LTI Test Faculty (MathWorks)',
    roleKey: 'faculty',
    isStudent: false,
  },
];

async function pickInstitution(): Promise<string> {
  const override = process.env.LTI_TEST_INSTITUTION_ID;
  if (override) return override;

  const { data, error } = await supabase
    .from('institutions')
    .select('id, name')
    .eq('is_active', true)
    .eq('entity_type', 'institution')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error || !data) throw new Error(`No active institution found: ${error?.message}`);
  console.log(`  ↳ Institution: ${data.name} (${data.id})`);
  return data.id;
}

async function pickStudentAcademicContext(institutionId: string) {
  const overrideProgram = process.env.LTI_TEST_PROGRAM_ID;

  const programQuery = supabase
    .from('programs')
    .select('id, program_name, department_id, degree_id, academic_year_id')
    .eq('institution_id', institutionId)
    .limit(1);

  const { data: program } = overrideProgram
    ? await programQuery.eq('id', overrideProgram).single()
    : await programQuery.order('created_at', { ascending: true }).single();

  if (!program) {
    console.warn('  ⚠ No program found for institution — student LTI context will be partial');
    return null;
  }

  const { data: semester } = await supabase
    .from('semesters')
    .select('id')
    .eq('program_id', program.id)
    .order('semester_number', { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: section } = await supabase
    .from('sections')
    .select('id')
    .eq('program_id', program.id)
    .limit(1)
    .maybeSingle();

  return {
    program_id: program.id,
    department_id: program.department_id,
    degree_id: program.degree_id,
    academic_year_id: program.academic_year_id,
    semester_id: semester?.id ?? null,
    section_id: section?.id ?? null,
  };
}

// Supabase admin listUsers returns up to 1000 per page. For tenants with
// more users (this project has ~5,400), we must paginate until we find the
// email or exhaust pages.
async function findUserIdByEmail(email: string): Promise<string | null> {
  const PER_PAGE = 1000;
  const MAX_PAGES = 50; // safety cap at 50k users
  const needle = email.toLowerCase();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw error;

    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === needle);
    if (hit) return hit.id;

    if (users.length < PER_PAGE) return null; // last page reached
  }
  throw new Error(`Exceeded ${MAX_PAGES * PER_PAGE}-user scan while searching for ${email}`);
}

async function upsertAuthUser(email: string, fullName: string): Promise<string> {
  // Try create first
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, lti_test_account: true },
  });

  if (created?.user) {
    console.log(`  ✓ auth.users created: ${email}`);
    return created.user.id;
  }

  // Already exists — find and rotate password
  if (createErr && /already been registered|already exists/i.test(createErr.message)) {
    const existingId = await findUserIdByEmail(email);
    if (!existingId) throw new Error(`Conflict but user not found after full scan: ${email}`);

    await supabase.auth.admin.updateUserById(existingId, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, lti_test_account: true },
      ban_duration: 'none', // unban if previously banned by cleanup script
    });
    console.log(`  ↻ auth.users updated (password rotated): ${email}`);
    return existingId;
  }

  throw createErr ?? new Error(`Unknown failure creating ${email}`);
}

async function upsertProfile(
  userId: string,
  account: LtiAccount,
  institutionId: string,
  departmentId: string | null
) {
  // NOTE: `is_super_admin` is a GENERATED ALWAYS column (derived from role).
  // Passing it explicitly — even as `false` — triggers
  // "cannot insert a non-DEFAULT value into column is_super_admin". Omit it.
  const { error } = await supabase.from('profiles').upsert(
    {
      id: userId,
      email: account.email,
      full_name: account.fullName,
      role: account.roleKey,
      institution_id: institutionId,
      department_id: departmentId,
      is_active: true,
      profile_completed: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(`profiles upsert failed for ${account.email}: ${error.message}`);
}

async function assignRole(userId: string, roleKey: string) {
  const { data: role, error: roleErr } = await supabase
    .from('custom_roles')
    .select('id')
    .eq('role_key', roleKey)
    .eq('is_active', true)
    .single();

  if (roleErr || !role) {
    throw new Error(`custom_roles row missing for role_key='${roleKey}': ${roleErr?.message}`);
  }

  // Clear any existing primary role to respect the partial unique index
  await supabase
    .from('user_roles')
    .update({ is_primary: false })
    .eq('user_id', userId)
    .eq('is_primary', true);

  const { error } = await supabase.from('user_roles').upsert(
    { user_id: userId, role_id: role.id, is_primary: true },
    { onConflict: 'user_id,role_id' }
  );
  if (error) throw new Error(`user_roles upsert failed: ${error.message}`);
}

async function grantInstitutionAccess(userId: string, institutionId: string) {
  const { error } = await supabase.from('user_institution_access').upsert(
    {
      user_id: userId,
      institution_id: institutionId,
      access_type: 'full',
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,institution_id' }
  );
  // If the table has no composite unique constraint, insert once and ignore duplicate
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(`user_institution_access upsert failed: ${error.message}`);
  }
}

async function upsertLearnerProfile(
  userId: string,
  account: LtiAccount,
  institutionId: string,
  ctx: Awaited<ReturnType<typeof pickStudentAcademicContext>>
) {
  // Synthetic test data for NOT NULL columns (clearly marked TEST- to prevent real-data confusion)
  const payload: Record<string, any> = {
    lifecycle_status: 'active',
    activated_at: new Date().toISOString(),

    first_name: 'LTI-Test',
    last_name: 'Student',
    date_of_birth: '2000-01-01',
    gender: 'Male',
    religion: 'Hindu',
    community: 'BC',
    entry_type: 'regular',

    father_name: 'TEST-FATHER',
    father_mobile: '9999999999',
    mother_name: 'TEST-MOTHER',
    mother_mobile: '9999999999',

    last_school: 'TEST-SCHOOL',
    board_of_study: 'State Board',
    tenth_marks: {},
    twelfth_marks: {},

    student_mobile: '9999999999',
    student_email: account.email,
    college_email: account.email,

    permanent_address_street: 'TEST ADDRESS',
    permanent_address_district: 'Namakkal',
    permanent_address_pin_code: '637301',
    permanent_address_state: 'Tamil Nadu',

    accommodation_type: 'dayscholar',

    institution_id: institutionId,
    ...(ctx ?? {}),

    is_profile_complete: true,
    updated_at: new Date().toISOString(),
  };

  // Link profile.learner_id back to the learners_profiles row.
  // Idempotent flow: find-or-create by student_email.
  const { data: existing } = await supabase
    .from('learners_profiles')
    .select('id')
    .eq('student_email', account.email)
    .maybeSingle();

  let learnerId: string;

  if (existing) {
    const { error } = await supabase
      .from('learners_profiles')
      .update(payload)
      .eq('id', existing.id);
    if (error) throw new Error(`learners_profiles update failed: ${error.message}`);
    learnerId = existing.id;
  } else {
    const { data: inserted, error } = await supabase
      .from('learners_profiles')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw new Error(`learners_profiles insert failed: ${error.message}`);
    learnerId = inserted.id;
  }

  await supabase.from('profiles').update({ learner_id: learnerId }).eq('id', userId);
  console.log(`  ✓ learners_profiles: ${learnerId}`);
}

const TOOL_ENV_KEYS = [
  'MATHWORKS_CLIENT_ID',
  'MATHWORKS_DEPLOYMENT_ID',
  'MATHWORKS_LAUNCH_URL',
  'MATHWORKS_PUBLIC_KEYSET_URL',
  'MATHWORKS_OIDC_AUTH_URL',
  'MATHWORKS_REDIRECT_URI',
] as const;

const VALID_TOOL_TYPES = [
  'matlab_grader',
  'matlab_online',
  'matlab_academy',
  'matlab_production_server',
] as const;

async function maybeRegisterMathWorksTool(): Promise<'skipped' | 'created' | 'updated'> {
  const set = TOOL_ENV_KEYS.filter((k) => !!process.env[k]);
  const unset = TOOL_ENV_KEYS.filter((k) => !process.env[k]);

  if (set.length === 0) {
    console.log('\nℹ  Tool registration: skipped (no MATHWORKS_* env vars set)');
    return 'skipped';
  }

  if (unset.length > 0) {
    throw new Error(
      `Partial MathWorks env config. Set ALL or NONE of these:\n` +
        `  set:   ${set.join(', ')}\n` +
        `  unset: ${unset.join(', ')}`
    );
  }

  const toolType = (process.env.MATHWORKS_TOOL_TYPE ?? 'matlab_grader') as
    (typeof VALID_TOOL_TYPES)[number];

  if (!VALID_TOOL_TYPES.includes(toolType)) {
    throw new Error(
      `Invalid MATHWORKS_TOOL_TYPE='${toolType}'. Allowed: ${VALID_TOOL_TYPES.join(', ')}`
    );
  }

  const clientId = process.env.MATHWORKS_CLIENT_ID!;
  const name = process.env.MATHWORKS_TOOL_NAME ?? `MathWorks — ${toolType}`;

  // capabilities default ON for matlab_grader (grade passback + roster), OFF for academy
  const defaults = {
    matlab_grader:             { dl: false, gp: true,  nr: true  },
    matlab_online:             { dl: true,  gp: false, nr: false },
    matlab_academy:            { dl: false, gp: false, nr: false },
    matlab_production_server:  { dl: false, gp: false, nr: false },
  }[toolType];

  const payload = {
    name,
    tool_type: toolType,
    client_id: clientId,
    deployment_id: process.env.MATHWORKS_DEPLOYMENT_ID!,
    launch_url: process.env.MATHWORKS_LAUNCH_URL!,
    public_keyset_url: process.env.MATHWORKS_PUBLIC_KEYSET_URL!,
    oidc_auth_url: process.env.MATHWORKS_OIDC_AUTH_URL!,
    redirect_uri: process.env.MATHWORKS_REDIRECT_URI!,
    supports_deep_linking: defaults.dl,
    supports_grade_passback: defaults.gp,
    supports_names_roles: defaults.nr,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from('lti_tools')
    .select('id, name')
    .eq('client_id', clientId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from('lti_tools').update(payload).eq('id', existing.id);
    if (error) throw new Error(`lti_tools update failed: ${error.message}`);
    console.log(`\n✓ LTI tool updated: ${name} (client_id=${clientId})`);
    return 'updated';
  }

  const { error } = await supabase.from('lti_tools').insert(payload);
  if (error) throw new Error(`lti_tools insert failed: ${error.message}`);
  console.log(`\n✓ LTI tool registered: ${name} (client_id=${clientId})`);
  return 'created';
}

async function main() {
  console.log('\n🔐 Creating LTI test accounts for MathWorks integration testing\n');
  console.log(`   Supabase URL: ${SUPABASE_URL}`);
  console.log(`   Password length: ${PASSWORD.length} chars\n`);

  const institutionId = await pickInstitution();

  let created = 0;
  let failed = 0;

  for (const account of ACCOUNTS) {
    console.log(`\n▶ ${account.email} (${account.roleKey})`);
    try {
      const userId = await upsertAuthUser(account.email, account.fullName);

      const studentCtx = account.isStudent ? await pickStudentAcademicContext(institutionId) : null;
      const departmentId = studentCtx?.department_id ?? null;

      await upsertProfile(userId, account, institutionId, departmentId);
      console.log(`  ✓ profiles upserted`);

      await assignRole(userId, account.roleKey);
      console.log(`  ✓ user_roles assigned (primary)`);

      await grantInstitutionAccess(userId, institutionId);
      console.log(`  ✓ user_institution_access granted`);

      if (account.isStudent) {
        await upsertLearnerProfile(userId, account, institutionId, studentCtx);
      }

      created++;
    } catch (err: any) {
      console.error(`  ✗ FAILED: ${err.message}`);
      failed++;
    }
  }

  const toolStatus = await maybeRegisterMathWorksTool();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`✅ Done — Accounts processed: ${created}, Failed: ${failed}`);
  console.log(`   LTI tool: ${toolStatus}`);
  console.log(`\n📋 MathWorks handoff details:`);
  console.log(`   URL:       <your-prod-or-staging-url>/auth/lti-login`);
  console.log(`   Password:  (shared via secure channel — NOT printed here)`);
  console.log(`   Accounts:`);
  for (const a of ACCOUNTS) console.log(`     • ${a.email}  (${a.roleKey})`);
  if (toolStatus === 'skipped') {
    console.log(`\n⚠  No LTI tool registered. MathWorks cannot launch until one is added.`);
    console.log(`   To register: set MATHWORKS_* env vars (see script header) and re-run.`);
  }
  console.log(`\n⚠  Reminder: set NEXT_PUBLIC_ENABLE_LTI_TEST_LOGIN=true on the target`);
  console.log(`   environment so /auth/lti-login is active. Rebuild/redeploy to pick up the flag.\n`);
}

main().catch((e) => {
  console.error('\n💥 Fatal:', e);
  process.exit(1);
});
