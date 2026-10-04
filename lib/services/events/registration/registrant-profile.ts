// lib/services/events/registration/registrant-profile.ts
//
// Who is this signed-in MyJKKN user, for an event registration?
//
// One resolver, used by the public form PAGE (to prefill) and the public-
// register API (to stamp the registration), so both see the same person the
// same way. It reads the profile, the staff row (learning facilitators) and
// the learner row (learners) with the SERVICE client — a learner's own row is
// RLS-scoped and the public page runs as anon — and turns the ids into names.
//
// The snapshot is written to events_registrations.myjkkn_profile at the moment
// of registration. It is a record of who registered AS WHAT that day; it is
// not kept in sync afterwards (a learner who later graduates was still a
// learner at the Townhall).

import { buildRegistrationPrefill, type RegistrationPrefill } from './form-prefill';

/** What a registration remembers about a MyJKKN registrant. All optional: a
 *  profile with neither a staff nor a learner row still has the first three. */
export interface MyjkknRegistrantSnapshot {
  person_type: 'learner' | 'learning_facilitator' | 'staff_other' | 'user';
  profile_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  /** learners_profiles.id — the learner's MyJKKN record. */
  learner_id: string | null;
  roll_number: string | null;
  register_number: string | null;
  /** staff.id (row) and staff.staff_id (the employee number people quote). */
  staff_row_id: string | null;
  staff_id: string | null;
  designation: string | null;
  institution_id: string | null;
  institution_name: string | null;
  department_id: string | null;
  department_name: string | null;
  degree_id: string | null;
  degree_name: string | null;
  program_id: string | null;
  program_name: string | null;
  semester_id: string | null;
  semester_name: string | null;
}

export interface ResolvedRegistrant {
  profileId: string;
  /** For the built-in name / email inputs. */
  fullName: string | null;
  email: string | null;
  /** For "Prefill from profile" fields. */
  prefill: RegistrationPrefill;
  snapshot: MyjkknRegistrantSnapshot;
}

/** staff.role_key values that mean "teaches": the learning-facilitator set. */
export const FACILITATOR_ROLE_KEYS = ['faculty', 'hod', 'principal', 'vice_principal', 'dean'] as const;
export function isFacilitatorRoleKey(roleKey: string | null | undefined): boolean {
  return !!roleKey && (FACILITATOR_ROLE_KEYS as readonly string[]).includes(roleKey);
}

type Svc = {
  from: (table: string) => any;
};

const ids = (...vals: (string | null | undefined)[]) =>
  Array.from(new Set(vals.filter((v): v is string => !!v)));

async function namesFor(
  svc: Svc,
  table: string,
  col: string,
  list: string[],
): Promise<Record<string, string>> {
  if (!list.length) return {};
  const { data } = await svc.from(table).select(`id, ${col}`).in('id', list);
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as Record<string, string>[]) out[row.id] = row[col] ?? '';
  return out;
}

/**
 * Resolve a signed-in user. Returns null when there is no profile for the
 * auth user (nothing to link — treat as a guest).
 */
export async function resolveMyjkknRegistrant(
  svc: Svc,
  userId: string,
): Promise<ResolvedRegistrant | null> {
  const { data: profile } = await svc
    .from('profiles')
    .select(
      'id, full_name, email, phone_number, gender, date_of_birth, institution_id, department_id, learner_id, role',
    )
    .eq('id', userId)
    .maybeSingle();
  if (!profile) return null;

  const [{ data: staff }, { data: learner }] = await Promise.all([
    svc
      .from('staff')
      .select(
        'id, staff_id, first_name, last_name, email, phone, gender, date_of_birth, designation, institution_id, department_id, role_key',
      )
      .eq('profile_id', profile.id)
      .limit(1)
      .maybeSingle(),
    profile.learner_id
      ? svc
          .from('learners_profiles')
          .select(
            'id, first_name, last_name, student_email, college_email, student_mobile, gender, date_of_birth, roll_number, register_number, institution_id, department_id, degree_id, program_id, semester_id',
          )
          .eq('id', profile.learner_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const [institutions, departments, degrees, programs, semesters] = await Promise.all([
    namesFor(svc, 'institutions', 'name', ids(profile.institution_id, staff?.institution_id, learner?.institution_id)),
    namesFor(svc, 'departments', 'department_name', ids(profile.department_id, staff?.department_id, learner?.department_id)),
    namesFor(svc, 'degrees', 'degree_name', ids(learner?.degree_id)),
    namesFor(svc, 'programs', 'program_name', ids(learner?.program_id)),
    namesFor(svc, 'semesters', 'semester_name', ids(learner?.semester_id)),
  ]);

  const prefill = buildRegistrationPrefill({
    profile,
    staff: staff ?? null,
    learner: learner ?? null,
    names: { institutions, departments, degrees, programs },
  });

  // Learner wins when both rows exist (a learner who also holds a staff row is
  // registering as a learner). Teaching staff are told apart by staff.role_key
  // — role_type is 'teacher' on every row and says nothing — so faculty, HODs
  // and principals are learning facilitators; everyone else is "staff_other".
  const personType: MyjkknRegistrantSnapshot['person_type'] = learner
    ? 'learner'
    : staff
      ? isFacilitatorRoleKey(staff.role_key)
        ? 'learning_facilitator'
        : 'staff_other'
      : 'user';

  const institutionId = learner?.institution_id ?? staff?.institution_id ?? profile.institution_id ?? null;
  const departmentId = learner?.department_id ?? staff?.department_id ?? profile.department_id ?? null;

  const snapshot: MyjkknRegistrantSnapshot = {
    person_type: personType,
    profile_id: profile.id,
    full_name: prefill.full_name ?? profile.full_name ?? null,
    email: prefill.email ?? profile.email ?? null,
    phone: prefill.phone ?? null,
    learner_id: learner?.id ?? profile.learner_id ?? null,
    roll_number: learner?.roll_number ?? null,
    register_number: learner?.register_number ?? null,
    staff_row_id: staff?.id ?? null,
    staff_id: staff?.staff_id ?? null,
    designation: staff?.designation ?? null,
    institution_id: institutionId,
    institution_name: institutionId ? institutions[institutionId] ?? null : null,
    department_id: departmentId,
    department_name: departmentId ? departments[departmentId] ?? null : null,
    degree_id: learner?.degree_id ?? null,
    degree_name: learner?.degree_id ? degrees[learner.degree_id] ?? null : null,
    program_id: learner?.program_id ?? null,
    program_name: learner?.program_id ? programs[learner.program_id] ?? null : null,
    semester_id: learner?.semester_id ?? null,
    semester_name: learner?.semester_id ? semesters[learner.semester_id] ?? null : null,
  };

  return {
    profileId: profile.id,
    fullName: snapshot.full_name,
    email: snapshot.email,
    prefill,
    snapshot,
  };
}
