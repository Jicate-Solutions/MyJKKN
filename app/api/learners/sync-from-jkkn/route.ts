import { createClient as createClient_ } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { JkknLearner } from '@/types/jkkn-api/learners';
import type { LifecycleStatus } from '@/types/learner-profile';

// Service-role client — bypasses RLS, used only server-side
const supabaseAdmin = createClient_(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const JKKN_API_BASE_URL =
  process.env.JKKN_API_BASE_URL ?? 'https://www.jkkn.ai/api';
const JKKN_API_KEY = process.env.JKKN_API_KEY;

/** Fetch one page of learners directly from JKKN (server-to-server). */
async function fetchJkknPage(page: number, limit: number) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const res = await fetch(
    `${JKKN_API_BASE_URL}/api-management/learners/profiles?${params}`,
    {
      headers: {
        Authorization: `Bearer ${JKKN_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `JKKN API error ${res.status} ${res.statusText}: ${body}`
    );
  }
  return res.json() as Promise<{
    data: JkknLearner[];
    pagination?: { page: number; totalPages: number; total: number; limit: number };
    metadata?: { page: number; totalPages: number; total: number; limit: number };
  }>;
}

// Runtime guard: JKKN's status vocabulary is not guaranteed to match our ENUM.
// Using a Set gives O(1) lookups when mapping thousands of learner records.
const VALID_LIFECYCLE_STATUSES = new Set<LifecycleStatus>([
  'enquiry', 'pending', 'approved', 'rejected', 'waitlisted',
  'active', 'inactive', 'exited', 'graduated', 'alumni',
]);

function toLifecycleStatus(raw?: string | null): LifecycleStatus {
  if (raw && VALID_LIFECYCLE_STATUSES.has(raw as LifecycleStatus)) {
    return raw as LifecycleStatus;
  }
  return 'active';
}

/** Map a JKKN learner record to a learners_profiles upsert row. */
function mapToRow(learner: JkknLearner) {
  return {
    // Conflict key — JKKN UUID
    original_student_id:  learner.id,
    application_id:       learner.application_id ?? null,

    // Identity
    first_name:           learner.first_name,
    last_name:            learner.last_name ?? null,
    gender:               learner.gender ?? '',
    date_of_birth:        learner.date_of_birth ?? '',
    student_email:        learner.student_email ?? '',
    student_mobile:       learner.student_mobile ?? '',
    college_email:        learner.college_email ?? null,
    roll_number:          learner.roll_number ?? null,
    register_number:      learner.register_number ?? null,

    // Org assignments
    institution_id:       learner.institution_id ?? null,
    degree_id:            learner.degree_id ?? null,
    department_id:        learner.department_id ?? null,
    program_id:           learner.program_id ?? null,
    semester_id:          learner.semester_id ?? null,
    section_id:           learner.section_id ?? null,
    academic_year_id:     learner.academic_year_id ?? null,
    regulation_id:        learner.regulation_id ?? null,
    batch_id:             learner.batch_id ?? null,

    // Status
    lifecycle_status:     toLifecycleStatus(learner.lifecycle_status),
    is_profile_complete:  learner.is_profile_complete ?? false,
    migration_source:     'direct' as const,

    // NOT NULL fields — skeleton defaults; admins complete personal details later
    religion:             '',
    community:            '',
    father_name:          '',
    father_mobile:        '',
    mother_name:          '',
    mother_mobile:        '',
    last_school:          '',
    board_of_study:       '',
    tenth_marks:          {},
    twelfth_marks:        {},
    entry_type:           'direct',
    permanent_address_street:   '',
    permanent_address_district: '',
    permanent_address_pin_code: '',
    permanent_address_state:    '',
    accommodation_type:         '',
  };
}

export async function POST() {
  try {
    // 1. Authenticate caller
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Guard: JKKN API key must be present
    // Permission is implicitly granted by authentication — JKKN API routes are
    // admin-only by design and JKKN_API_KEY is a server-only secret.
    if (!JKKN_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'JKKN_API_KEY is not configured on the server.' },
        { status: 500 }
      );
    }

    // 4. Fetch all pages from JKKN (server-to-server, limit 100/page)
    const PAGE_SIZE = 100;
    let allLearners: JkknLearner[] = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      const result = await fetchJkknPage(currentPage, PAGE_SIZE);
      allLearners = allLearners.concat(result.data ?? []);

      // Support both upstream { pagination } and already-normalised { metadata }
      if (result.pagination) {
        totalPages = result.pagination.totalPages;
      } else if (result.metadata) {
        totalPages = result.metadata.totalPages;
      }

      currentPage++;
    } while (currentPage <= totalPages);

    if (allLearners.length === 0) {
      return NextResponse.json({
        success: true,
        synced: 0,
        created: 0,
        updated: 0,
        errors: [],
        message: 'No learner records returned from JKKN.',
      });
    }

    // 5. Map and batch-upsert (onConflict uses the unique partial index)
    const rows = allLearners.map(mapToRow);
    const errors: string[] = [];

    // Supabase upsert in batches of 500 to avoid payload limits
    const BATCH_SIZE = 500;
    let totalUpserted = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error: upsertError } = await supabaseAdmin
        .from('learners_profiles')
        .upsert(batch, {
          onConflict: 'original_student_id',
          ignoreDuplicates: false, // update existing rows
        });

      if (upsertError) {
        errors.push(
          `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${upsertError.message}`
        );
      } else {
        totalUpserted += batch.length;
      }
    }

    return NextResponse.json({
      success: true,
      synced: totalUpserted,
      // Supabase upsert doesn't distinguish created vs updated at the row level
      // without additional queries; return total as synced, leave granular counts
      // to future enhancement with ON CONFLICT DO UPDATE RETURNING xmax.
      created: null,
      updated: null,
      errors,
      message: `Synced ${totalUpserted} learner records from JKKN.${errors.length ? ` ${errors.length} batch error(s).` : ''}`,
    });
  } catch (error) {
    console.error('[api/learners/sync-from-jkkn] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'An internal server error occurred.',
      },
      { status: 500 }
    );
  }
}
