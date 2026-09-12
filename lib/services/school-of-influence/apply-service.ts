// lib/services/school-of-influence/apply-service.ts
//
// School of Influence — the APPLY flow (spec §7 S4). SERVER-ONLY.
// Spec: specs/school-of-influence-batches-2026-07-30.md
//
// The event is the programme's front door (spec §1): the cohort spine has no
// public apply path, but the events side already has a form builder
// (event_registration_forms / _sections / _fields) and a registration carrier
// (events_registrations). This module drives that existing machinery. It
// introduces NO new form system and NO new application table.
//
// ── THE SECURITY CRUX (spec §7 S4 item 2) ────────────────────────────────────
// SF100's 23 fabricated roster rows came from a team leader TYPING other
// people's names and email addresses into event_team_members (audit 2026-07-27).
// The structural answer here is that an application is never ABOUT anybody:
//   • identity is read from auth.uid() on the server and nowhere else;
//   • the request body carries answers and at most a batch choice — it has no
//     name, no email, no profile id, no learner id, and any such key is ignored
//     because it is never read;
//   • one application is one person applying for themselves.
// This matters more than usual because events_registrations' own RLS is
// `events_reg_public_insert … WITH CHECK (true)` — the table accepts anything
// from anyone. Identity therefore CANNOT be delegated to RLS on this path; it
// has to be established here, before the write, which is what this module does.
//
// ── WHY SERVICE-ROLE FOR THE READS ───────────────────────────────────────────
// Batch rows and their occupancy are read with the service-role client AFTER the
// caller has been authenticated. Under the applicant's own RLS the cohort spine
// requires cohort.view, which an applicant does not hold — the reads would
// return zero rows, and the flow would compute occupancy 0 and report every
// batch as empty. That is a WRONG number, not a safe one: it would admit past a
// full batch. Every decision derived from those reads is refusal-shaped, and the
// only write is the applicant's own row.
//
// ── NO HARDCODED THRESHOLDS ──────────────────────────────────────────────────
// Capacity, full-behaviour, audiences, batch-choice mode and approval are all
// read at request time through the shared fn_get_policy_* readers, with the
// spec §4 locked defaults as the fallback (SOI_POLICY_DEFAULTS).
// Programme-level keys are read with p_scope_id = NULL, which fn_get_policy
// resolves to the programme-wide cohort default seeded by S1 (precedence 5 in
// 20260731180000_platform_policies_cohort_scope.sql). Per-batch keys are read
// with that batch's cohorts.id, so a per-batch row shadows the default.
//
// ── NO INSTITUTION GATE, ON PURPOSE ──────────────────────────────────────────
// Eligibility is audience-only (D4: JKKN learners and team members, no external
// applicants). A learner or team member of ANY JKKN institution may apply to a
// programme hosted by another, and the application records the APPLICANT's
// institution so the reviewer can see where they came from.
// That is deliberate, not an oversight: all JKKN colleges are one walkable
// campus, institutions are an organisational grouping rather than a boundary,
// and none of the 14 locked decisions asks for a same-institution restriction.
// Adding one unasked would silently refuse cross-college applicants — the
// opposite of what a campus-wide influence programme is for.
// If the Director does want it scoped, the change is one comparison here
// (events.institution_id vs the applicant's) plus a refusal code; it should be
// a decision, not a default.

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  SOI_COHORT_KIND,
  SOI_OCCUPYING_STATUSES,
  SOI_POLICY_DEFAULTS,
  isWithinSoiIntakeWindow,
  normaliseSoiAudience,
  soiDisplayName,
  type SoiBatchChoiceMode,
  type SoiBatchFullBehaviour,
  type SoiMemberType,
} from '@/lib/services/school-of-influence/constants';
import {
  deriveSoiYearFromSemesterName,
  isSoiServerDerivedField,
  soiKnownAnswersFor,
  soiOnRecordAnswerKey,
  soiPrefillMismatches,
  type SoiApplicantRecord,
  type SoiKnownAnswer,
} from '@/lib/services/school-of-influence/known-answers';
import { validateCustomFields } from '@/lib/services/events/tournament/event-registration-form-service';
import type { Cohort } from '@/lib/types/cohort-core';
import type {
  EventRegistrationFormField,
  EventRegistrationFormSection,
} from '@/types/tournament';
import type {
  SoiApplyBatchView,
  SoiApplyContext,
  SoiApplyResult,
  SoiApplySubmission,
  SoiRefusal,
  SoiSubmitOutcome,
} from '@/lib/services/school-of-influence/apply-types';

// The wire contract lives in ./apply-types (types only, no server imports) so
// the apply page and its form can share it without risking server code in the
// browser bundle. Re-exported here so a server caller has one import to make.
export type * from '@/lib/services/school-of-influence/apply-types';

/** events_registrations.source for an application made through this flow. */
export const SOI_APPLICATION_SOURCE = 'soi_apply';

/**
 * A DECIDED application no longer blocks a fresh attempt. Every other status
 * means "there is already a live application, awaiting or accepted".
 *
 * Director decision, 2026-08-01: being turned down once must not bar a person
 * from the programme forever. Before that ruling this list held 'cancelled'
 * alone, so a turned-down applicant was blocked permanently — nobody chose
 * that; it fell out of the list being written before there was any way to turn
 * an application down.
 *
 * ── READ THIS BEFORE EDITING THE LIST ────────────────────────────────────────
 * There is NO 'rejected' status. events_registrations.status is a CHECK shared
 * with the marathon and tournament surfaces, and it admits exactly:
 *
 *   pending · registered · confirmed · checked_in · cancelled · disqualified ·
 *   no_show · waitlisted
 *
 * School of Influence stores its own outcomes inside that vocabulary rather
 * than widening a constraint four modules depend on: accepted is 'confirmed',
 * and a decided no is 'disqualified' (fn_soi_reject_application, S5). The word
 * "rejected" exists only inside custom_data.soi.review.decision — never as a
 * row status. Putting 'rejected' in this list would therefore match nothing and
 * silently restore the permanent bar, with every test still green.
 *
 * The list stays a NEGATIVE one (statuses that do NOT block) on purpose. A typo
 * in a negative list fails safe — the unknown token simply is not excluded, so
 * the person stays blocked and complains. In a positive list ("these block") a
 * typo would fail open, letting somebody with a live application submit a
 * second one. Blocked-and-audible beats admitted-and-silent.
 *
 * Deliberately NOT re-appliable: 'confirmed' (they were accepted — and a
 * membership normally trips the already_member refusal first), and
 * 'registered' / 'checked_in' / 'no_show', which are the events module's own
 * lifecycle values that this flow never writes. Whether somebody dropped from a
 * batch may apply again is a separate question nobody has been asked.
 */
const REAPPLIABLE_APPLICATION_STATUSES = ['cancelled', 'disqualified'];

// ─── policy reads ────────────────────────────────────────────────────────────

type PolicyReader = 'fn_get_policy_int' | 'fn_get_policy_bool' | 'fn_get_policy_text';

/**
 * Read one policy through the shared typed readers, as the SIGNED-IN caller
 * (they are granted to `authenticated`). A failure never throws: the spec §4
 * locked default is returned, so the flow degrades to the decided behaviour
 * rather than breaking. The error is still surfaced in the server log, because
 * a silent fallback nobody can see is the failure mode spec §5 forbids.
 */
async function readPolicy<T>(
  authed: Awaited<ReturnType<typeof createClient>>,
  fn: PolicyReader,
  key: string,
  fallback: T,
  scopeId: string | null
): Promise<T> {
  try {
    const { data, error } = await (authed as any).rpc(fn, {
      p_key: key,
      p_default: fallback,
      p_scope_id: scopeId,
    });
    if (error) throw error;
    return (data ?? fallback) as T;
  } catch (error) {
    console.error(
      `SoI apply: policy read failed for "${key}" (scope ${scopeId ?? 'programme default'}) — using the spec default`,
      error
    );
    return fallback;
  }
}

/** D4 — soi.eligible_audiences, programme-wide. */
async function readEligibleAudiences(
  authed: Awaited<ReturnType<typeof createClient>>
): Promise<SoiMemberType[]> {
  const { key, value } = SOI_POLICY_DEFAULTS.eligibleAudiences;
  const fallback = [...value];
  let raw: unknown;
  try {
    const { data, error } = await (authed as any).rpc('fn_get_policy_json', {
      p_key: key,
      p_default: fallback,
      p_scope_id: null,
    });
    if (error) throw error;
    raw = data;
  } catch (error) {
    console.error(`SoI apply: policy read failed for "${key}" — using the spec default`, error);
    raw = fallback;
  }

  const list = Array.isArray(raw) ? raw : fallback;
  const audiences = list
    .map(normaliseSoiAudience)
    .filter((a): a is SoiMemberType => a !== null);

  // An empty or entirely unrecognised list would lock EVERY applicant out with a
  // refusal no coordinator could explain. Falling back to the locked default is
  // the honest reading of "this row is not usable".
  return audiences.length > 0 ? Array.from(new Set(audiences)) : fallback;
}

/** D2 — soi.batch_choice_mode, programme-wide. */
async function readBatchChoiceMode(
  authed: Awaited<ReturnType<typeof createClient>>
): Promise<SoiBatchChoiceMode> {
  const { key, value } = SOI_POLICY_DEFAULTS.batchChoiceMode;
  const raw = await readPolicy<string>(authed, 'fn_get_policy_text', key, value, null);
  // An unrecognised value must not silently hand batch selection to the
  // applicant — fall back to the locked default (a coordinator assigns).
  return raw === 'participant_choose' || raw === 'staff_assign' ? raw : value;
}

/** D5 — soi.batch_full_behaviour for ONE batch. */
async function readBatchFullBehaviour(
  authed: Awaited<ReturnType<typeof createClient>>,
  cohortId: string
): Promise<SoiBatchFullBehaviour> {
  const { key, value } = SOI_POLICY_DEFAULTS.batchFullBehaviour;
  const raw = await readPolicy<string>(authed, 'fn_get_policy_text', key, value, cohortId);
  return raw === 'waitlist' || raw === 'offer_another_batch' ? raw : value;
}

// ─── identity ────────────────────────────────────────────────────────────────

export interface SoiApplicant {
  profileId: string;
  fullName: string | null;
  email: string | null;
  learnerId: string | null;
  institutionId: string | null;
  audiences: SoiMemberType[];
}

/**
 * Resolve WHO is applying, entirely from the session cookie. Returns null when
 * nobody is signed in.
 *
 * Audience membership is a fact about the person, read from their own records:
 *   • 'learner' — profiles.learner_id is set (the canonical learner link;
 *     auth.users.id == profiles.id, profiles.learner_id → learners_profiles.id)
 *   • 'staff'   — an ACTIVE staff row points back at this profile
 *     (staff.profile_id = auth.uid(), the linkage the HR RLS policies use)
 * A person can legitimately be both; the eligibility test is an intersection, so
 * either one being permitted is enough.
 */
export async function resolveSoiApplicant(): Promise<SoiApplicant | null> {
  const authed = await createClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) return null;

  const svc = createServiceRoleClient();
  const { data: profile } = await (svc as any)
    .from('profiles')
    .select('id, full_name, email, learner_id, institution_id')
    .eq('id', user.id)
    .maybeSingle();

  const audiences: SoiMemberType[] = [];
  if (profile?.learner_id) audiences.push('learner');

  const { data: staffRow } = await (svc as any)
    .from('staff')
    .select('id')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (staffRow) audiences.push('staff');

  return {
    profileId: user.id,
    fullName: profile?.full_name ?? null,
    // Fall back to the auth identity so an application always carries a
    // reachable address for the coordinator, even on a thin profile row.
    email: profile?.email ?? user.email ?? null,
    learnerId: profile?.learner_id ?? null,
    institutionId: profile?.institution_id ?? null,
    audiences,
  };
}

// ─── batches ─────────────────────────────────────────────────────────────────

/**
 * Every batch of this programme, with its own window (D13) and its occupancy
 * against soi.batch_capacity (D5). A batch IS a cohorts row pointing at the
 * event through config.source_event_id — the same shape S3 writes and the live
 * sf100 cohort already uses.
 */
async function loadBatches(
  authed: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  now: Date
): Promise<{ views: SoiApplyBatchView[]; rows: Cohort[] }> {
  const svc = createServiceRoleClient();
  const { data, error } = await (svc as any)
    .from('cohorts')
    .select('*')
    .eq('kind', SOI_COHORT_KIND)
    .is('archived_at', null)
    .order('name', { ascending: true });
  if (error) throw error;

  const rows = ((data ?? []) as Cohort[]).filter(
    (c) => (c.config as { source_event_id?: string })?.source_event_id === eventId
  );

  const views: SoiApplyBatchView[] = [];
  for (const batch of rows) {
    const [capacity, fullBehaviour, perBatchDates, occupancy] = await Promise.all([
      readPolicy<number>(
        authed,
        'fn_get_policy_int',
        SOI_POLICY_DEFAULTS.batchCapacity.key,
        SOI_POLICY_DEFAULTS.batchCapacity.value,
        batch.id
      ),
      readBatchFullBehaviour(authed, batch.id),
      readPolicy<boolean>(
        authed,
        'fn_get_policy_bool',
        SOI_POLICY_DEFAULTS.intakeDatesPerBatch.key,
        SOI_POLICY_DEFAULTS.intakeDatesPerBatch.value,
        batch.id
      ),
      countOccupancy(batch.id),
    ]);

    // D13 off = one set of dates covers the whole programme, so an individual
    // batch stops gating on its own window and the event's registration window
    // (checked separately, below) is the only date gate.
    const intakeOpen = perBatchDates ? isWithinSoiIntakeWindow(batch, now) : true;
    const isFull = occupancy >= capacity;

    views.push({
      id: batch.id,
      // The three live rows still read "School of Influence — Batch A/B/C". The
      // programme's name changed, the rows have not (that is a data decision the
      // Director has not been asked for), so the swap happens on the way out.
      name: soiDisplayName(batch.name),
      opensAt: batch.opens_at,
      closesAt: batch.closes_at,
      intakeOpen,
      occupancy,
      capacity,
      isFull,
      fullBehaviour,
      acceptingNow: intakeOpen && !isFull,
    });
  }

  return { views, rows };
}

/** Seats occupied: memberships in a non-terminal status (the S3 predicate). */
async function countOccupancy(cohortId: string): Promise<number> {
  const svc = createServiceRoleClient();
  const { count, error } = await (svc as any)
    .from('cohort_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('cohort_id', cohortId)
    .in('status', SOI_OCCUPYING_STATUSES);
  if (error) throw error;
  return count ?? 0;
}

// ─── the form (reused, not reinvented) ───────────────────────────────────────

/**
 * The event's existing registration form. Read-only on purpose: the sibling
 * service LAZILY CREATES the form row on first read, and materialising a row
 * merely because somebody opened the apply page would be a write from a read
 * path. An event with no form yet simply collects no extra questions.
 *
 * ── ONE QUESTION IS DROPPED HERE, AND ONLY HERE (Director decision 2026-08-13)
 * A field the SERVER already answers for itself — today "Learner or Senior
 * Learner" — is filtered out of both returned lists. Both, because the same
 * pair drives two different things: `sections` is what the applicant sees, and
 * `fields` is what validateCustomFields enforces. Dropping it from one alone
 * would either show a box nothing validates or, far worse, demand an answer to
 * a question the form no longer asks — an application nobody could submit.
 *
 * Filtering in code rather than deleting the row keeps the change to THIS flow:
 * the events form builder still shows the field, no data is destroyed, and a
 * coordinator can put the question back by removing this filter rather than by
 * recreating a row. The row's own answer is not lost either — the server writes
 * what it derived onto the application instead (see submitSoiApplication).
 */
async function loadFormSections(
  eventId: string
): Promise<{ sections: EventRegistrationFormSection[]; fields: EventRegistrationFormField[] }> {
  const svc = createServiceRoleClient();
  const { data: form } = await (svc as any)
    .from('event_registration_forms')
    .select('id, is_enabled')
    .eq('event_id', eventId)
    .maybeSingle();
  if (!form || form.is_enabled === false) return { sections: [], fields: [] };

  const [{ data: sections }, { data: fields }] = await Promise.all([
    (svc as any)
      .from('event_registration_form_sections')
      .select('*')
      .eq('form_id', form.id)
      .order('display_order', { ascending: true }),
    (svc as any)
      .from('event_registration_form_fields')
      .select('*')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true }),
  ]);

  const allFields = ((fields ?? []) as EventRegistrationFormField[]).filter(
    (field) => !isSoiServerDerivedField(field)
  );
  const withFields = ((sections ?? []) as EventRegistrationFormSection[]).map((section) => ({
    ...section,
    fields: allFields.filter((f) => f.section_id === section.id),
  }));
  return { sections: withFields, fields: allFields };
}

// ─── what the platform already knows about the applicant ─────────────────────

/**
 * The applicant's own record, read for the four questions the form asks that
 * the platform can already answer: name, college, department, year.
 *
 * FAILS SOFT, ALWAYS. Every read is wrapped, and anything unreadable becomes a
 * null — which renders as an empty, editable box. A person must never be unable
 * to apply because a lookup for a convenience failed, and a spinner that never
 * resolves would be worse than no prefill at all.
 *
 * The chain is the canonical one: auth.users.id == profiles.id, and
 * profiles.learner_id → learners_profiles.id. Service-role, exactly as the rest
 * of this module reads: an applicant holds no permission over `departments` or
 * `semesters`, so their own RLS would return nothing and every box would be
 * blank for everybody. The reads are scoped to the caller's OWN row and the
 * lookups it points at, and none of them decides anything.
 */
async function readSoiApplicantRecord(applicant: SoiApplicant): Promise<SoiApplicantRecord> {
  const empty: SoiApplicantRecord = {
    name: applicant.fullName,
    college: null,
    department: null,
    year: null,
  };

  try {
    const svc = createServiceRoleClient();

    let name = applicant.fullName;
    let institutionId = applicant.institutionId;
    let departmentId: string | null = null;
    let semesterId: string | null = null;

    if (applicant.learnerId) {
      const { data: learner } = await (svc as any)
        .from('learners_profiles')
        .select('first_name, last_name, institution_id, department_id, semester_id')
        .eq('id', applicant.learnerId)
        .maybeSingle();
      if (learner) {
        const composed = [learner.first_name, learner.last_name]
          .map((part: string | null) => String(part ?? '').trim())
          .filter(Boolean)
          .join(' ');
        // The learner record is the more specific one, but a blank field on it
        // must not erase a name the profile does have.
        if (composed) name = composed;
        institutionId = learner.institution_id ?? institutionId;
        departmentId = learner.department_id ?? null;
        semesterId = learner.semester_id ?? null;
      }
    }

    const [institution, department, semester] = await Promise.all([
      institutionId
        ? (svc as any).from('institutions').select('name').eq('id', institutionId).maybeSingle()
        : Promise.resolve({ data: null }),
      departmentId
        ? (svc as any)
            .from('departments')
            .select('department_name')
            .eq('id', departmentId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      semesterId
        ? (svc as any).from('semesters').select('semester_name').eq('id', semesterId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return {
      name: String(name ?? '').trim() || null,
      college: String(institution?.data?.name ?? '').trim() || null,
      department: String(department?.data?.department_name ?? '').trim() || null,
      year: deriveSoiYearFromSemesterName(semester?.data?.semester_name ?? null),
    };
  } catch (error) {
    console.error(
      'SoI apply: could not read the applicant record for the prefilled boxes — showing them empty',
      error
    );
    return empty;
  }
}

// ─── the context ─────────────────────────────────────────────────────────────

/**
 * Everything the apply surface needs, decided on the server. The page renders
 * `refusal` verbatim when it is set and the form when it is not, so the reason
 * an application is impossible is always on screen.
 */
export async function buildSoiApplyContext(
  eventId: string,
  now: Date = new Date()
): Promise<SoiApplyContext> {
  const authed = await createClient();
  const svc = createServiceRoleClient();
  const applicant = await resolveSoiApplicant();

  const { data: event } = await (svc as any)
    .from('events')
    .select('id, name, status, registration_open_date, registration_close_date')
    .eq('id', eventId)
    .maybeSingle();

  const base = {
    eventId,
    eventName: soiDisplayName((event?.name as string) ?? null),
    registrationOpensAt: (event?.registration_open_date as string) ?? null,
    registrationClosesAt: (event?.registration_close_date as string) ?? null,
    batches: [] as SoiApplyBatchView[],
    existingApplication: null,
    existingMembership: null,
    formSections: [] as EventRegistrationFormSection[],
    knownAnswers: {} as Record<string, SoiKnownAnswer>,
  };

  // Read the programme-level policy even on refusal paths: the surface says
  // "learners and staff may apply" while explaining why THIS person cannot, and
  // that sentence has to come from config rather than from a hardcoded list.
  const [eligibleAudiences, batchChoiceMode, requireApproval] = await Promise.all([
    readEligibleAudiences(authed),
    readBatchChoiceMode(authed),
    readPolicy<boolean>(
      authed,
      'fn_get_policy_bool',
      SOI_POLICY_DEFAULTS.requireApproval.key,
      SOI_POLICY_DEFAULTS.requireApproval.value,
      null
    ),
  ]);
  const policy = { eligibleAudiences, batchChoiceMode, requireApproval };

  const refuse = (refusal: SoiRefusal): SoiApplyContext => ({
    ...base,
    applicant: applicant
      ? { fullName: applicant.fullName, email: applicant.email, audiences: applicant.audiences }
      : null,
    policy,
    refusal,
  });

  if (!applicant) {
    return refuse({
      code: 'not_signed_in',
      status: 401,
      message:
        'Sign in with your JKKN account to apply. Applications are tied to the ' +
        'account you sign in with — nobody can apply on somebody else’s behalf.',
    });
  }

  // Is this event actually a School of Influence front door? The honest test is
  // whether any batch points at it, not what event_type happens to say.
  const { views: batches, rows: batchRows } = await loadBatches(authed, eventId, now);
  if (!event || batchRows.length === 0) {
    return refuse({
      code: 'not_a_programme',
      status: 404,
      message:
        'This event is not open as a School of Influencer programme yet. No batch ' +
        'has been set up for it, so there is nothing to apply to. Please check ' +
        'back, or ask the programme coordinator when applications open.',
    });
  }

  // From here on the batch list is known, so every refusal can still show the
  // applicant what the programme's batches look like while explaining the no.
  const refuseWithBatches = (
    refusal: SoiRefusal,
    extra: Partial<Pick<SoiApplyContext, 'existingApplication' | 'existingMembership'>> = {}
  ): SoiApplyContext => ({
    ...base,
    batches,
    policy,
    applicant: publicApplicant(applicant),
    existingApplication: extra.existingApplication ?? null,
    existingMembership: extra.existingMembership ?? null,
    refusal,
  });

  if (['draft', 'cancelled'].includes(String(event.status))) {
    return refuseWithBatches({
      code: 'programme_not_open',
      status: 422,
      message:
        'Applications for this programme are not open. The organisers have not ' +
        'published it yet — please check back later.',
    });
  }

  const at = now.getTime();
  if (event.registration_open_date && at < new Date(event.registration_open_date).getTime()) {
    return refuseWithBatches({
      code: 'intake_closed',
      status: 422,
      message: `Applications have not opened yet. They open on ${formatDay(
        event.registration_open_date
      )}.`,
    });
  }
  if (event.registration_close_date && at > new Date(event.registration_close_date).getTime()) {
    return refuseWithBatches({
      code: 'intake_closed',
      status: 422,
      message: `Applications closed on ${formatDay(
        event.registration_close_date
      )}. Contact the programme coordinator if you believe this is wrong.`,
    });
  }

  // D4 — eligibility from config, at runtime.
  const matched = applicant.audiences.filter((a) => eligibleAudiences.includes(a));
  if (matched.length === 0) {
    return refuseWithBatches({
      code: 'not_eligible',
      status: 403,
      message:
        `This programme is open to ${describeAudiences(eligibleAudiences)} only, and ` +
        'your JKKN account is not currently recognised as one of those. If that is ' +
        'wrong, ask your department office to check your profile record, then try again.',
    });
  }

  // D10 — already holding a place in this programme.
  const existingMembership = await findLiveMembership(applicant.profileId, batchRows);
  if (existingMembership) {
    return refuseWithBatches(
      {
        code: 'already_member',
        status: 409,
        message:
          `You already have a place in ${existingMembership.batchName}, so there is ` +
          'nothing more to apply for. A person can be in only one batch of this ' +
          'programme at a time — ask a coordinator if you need to move to another batch.',
      },
      { existingMembership }
    );
  }

  const existingApplication = await findLiveApplication(eventId, applicant.profileId);
  if (existingApplication) {
    // Only claim a review is under way when the record actually says so. S5 owns
    // the status vocabulary from here, and asserting "a coordinator is reviewing
    // your application" over a decided one would be a comforting sentence that
    // is simply untrue.
    const stillUnderReview = ['pending', 'waitlisted'].includes(
      String(existingApplication.status)
    );
    return refuseWithBatches(
      {
        code: 'already_applied',
        status: 409,
        message: stillUnderReview
          ? 'You have already applied to this programme. A coordinator is reviewing ' +
            'your application — you will be told the outcome, and you do not need to ' +
            'apply again.'
          : 'You have already applied to this programme and your application has been ' +
            'dealt with, so it cannot be submitted again. Contact the programme ' +
            'coordinator if you think it should be looked at afresh.',
      },
      { existingApplication }
    );
  }

  // D13 — the calendar, checked BEFORE capacity and independently of it. A shut
  // intake window is not a full batch, and soi.batch_full_behaviour has nothing
  // to say about a closed window: it answers "what do we do when there are no
  // seats", not "what do we do when the round is over". Collapsing the two let a
  // programme that keeps a waiting list tell people a place might open up when
  // the real obstacle was the date — on 2026-08-21 all three batches shut at
  // midnight holding 0 of 50 seats and six applicants were waitlisted against
  // empty batches.
  //
  // An empty `batches` array lands here too, and deliberately so: every() is
  // vacuously true, and "no batches exist" must read as closed rather than fall
  // through to a capacity question about batches that are not there.
  const everyWindowShut = batches.every((b) => !b.intakeOpen);
  if (everyWindowShut) {
    return refuseWithBatches({
      code: 'no_open_batch',
      status: 422,
      message: batches.length
        ? 'Every batch of this programme has closed its applications. Contact the ' +
          'programme coordinator to ask about the next round.'
        : 'This programme is not taking applications yet — no batch has been opened. ' +
          'Contact the programme coordinator to ask when the next round starts.',
    });
  }

  // D5 — capacity. At least one window is open by now, so what is left is a
  // genuine seat question and full-behaviour is the right policy to consult.
  const noBatchAcceptingNow = batches.every((b) => !b.acceptingNow);
  const anyWaitlists = batches.some((b) => b.fullBehaviour === 'waitlist');
  if (noBatchAcceptingNow && !anyWaitlists) {
    return refuseWithBatches({
      code: 'no_open_batch',
      status: 422,
      message:
        'Every batch of this programme is full, and this programme does not keep ' +
        'a waiting list. Contact the programme coordinator to ask about the next round.',
    });
  }

  // Only now — after every refusal has been cleared — is it worth reading the
  // applicant's record for the boxes the platform can fill in itself. Somebody
  // who cannot apply costs no lookup.
  const { sections, fields } = await loadFormSections(eventId);
  const record = await readSoiApplicantRecord(applicant);
  return {
    ...base,
    batches,
    policy,
    applicant: publicApplicant(applicant),
    existingApplication: null,
    existingMembership: null,
    formSections: sections,
    knownAnswers: soiKnownAnswersFor(fields, record),
    refusal: null,
  };
}

function publicApplicant(a: SoiApplicant) {
  return { fullName: a.fullName, email: a.email, audiences: a.audiences };
}

function describeAudiences(audiences: SoiMemberType[]): string {
  // The config token is 'staff'; the words shown to a person are JKKN's own
  // vocabulary for the same group (.claude/skills/jkkn-terminologies).
  const labels = audiences.map((a) =>
    a === 'learner' ? 'JKKN learners' : 'JKKN team members'
  );
  if (labels.length <= 1) return labels[0] ?? 'nobody';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function formatDay(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * A non-terminal membership in any batch of this programme (the D10 predicate).
 *
 * `member_ref` is matched against the PROFILE id, not a learner id, and that is
 * load-bearing rather than incidental. Other cohort domains key a learner
 * membership by learners_profiles.id, but S3 chose profiles.id for School of
 * Influence deliberately: the spine accepts either, and allowing both would let
 * one human hold two different member_ref values and therefore two seats in the
 * same programme, defeating D10 (see SoiBatchService.addMember). Matching on a
 * learner id here would silently fail to spot a learner who already has a
 * place. Whoever implements S5 must write memberships with profiles.id for the
 * same reason.
 */
async function findLiveMembership(
  profileId: string,
  batchRows: Cohort[]
): Promise<{ cohortId: string; batchName: string; status: string } | null> {
  if (batchRows.length === 0) return null;
  const svc = createServiceRoleClient();
  const { data, error } = await (svc as any)
    .from('cohort_memberships')
    .select('cohort_id, status')
    .eq('member_ref', profileId)
    .in(
      'cohort_id',
      batchRows.map((b) => b.id)
    )
    .in('status', SOI_OCCUPYING_STATUSES)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const batch = batchRows.find((b) => b.id === data.cohort_id);
  return {
    cohortId: data.cohort_id,
    batchName: batch?.name ? soiDisplayName(batch.name) : 'a batch of this programme',
    status: data.status,
  };
}

/** This person's live application to this event, if one exists. */
async function findLiveApplication(
  eventId: string,
  profileId: string
): Promise<{ id: string; status: string } | null> {
  const svc = createServiceRoleClient();
  const { data, error } = await (svc as any)
    .from('events_registrations')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .eq('source', SOI_APPLICATION_SOURCE)
    .not('status', 'in', `(${REAPPLIABLE_APPLICATION_STATUSES.join(',')})`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, status: data.status } : null;
}

/**
 * This person's earlier applications to this event — how many, and the most
 * recent one. Used ONLY to label a re-application; it never refuses anybody.
 *
 * Allowing a turned-down person to apply again (see
 * REAPPLIABLE_APPLICATION_STATUSES) means a coordinator can be handed what
 * looks like a brand-new application from somebody they already decided on. If
 * nothing recorded that, the repeat would be invisible: two identical-looking
 * rows, with the fact connecting them buried in a status the queue does not
 * group by. Stamping the link onto the new row is the explicit half of the
 * Director's decision — the re-application is allowed AND it says what it is.
 *
 * A POINTER is recorded, never a copy of the coordinator's words. The reason
 * text lives on the row it was written about and stays readable there under
 * events_reg_self_read; duplicating it here would create a second copy that a
 * later correction or redaction would not reach.
 */
async function findPriorApplications(
  eventId: string,
  profileId: string
): Promise<{
  count: number;
  latest: { id: string; status: string; decision: string | null; decidedAt: string | null } | null;
}> {
  const svc = createServiceRoleClient();
  const { data, count, error } = await (svc as any)
    .from('events_registrations')
    .select('id, status, custom_data', { count: 'exact' })
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .eq('source', SOI_APPLICATION_SOURCE)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;

  const row = (data ?? [])[0];
  if (!row) return { count: 0, latest: null };

  const review = (row.custom_data?.soi?.review ?? {}) as {
    decision?: string | null;
    decided_at?: string | null;
  };
  return {
    count: count ?? 0,
    latest: {
      id: row.id,
      status: row.status,
      decision: review.decision ?? null,
      decidedAt: review.decided_at ?? null,
    },
  };
}

// ─── submit ──────────────────────────────────────────────────────────────────

/**
 * Record ONE application, for the signed-in person, on the event's existing
 * registration carrier.
 *
 * This NEVER creates a cohort membership. Membership is the access gate (D6) and
 * granting it is S5's job after a coordinator has accepted — spec §7 S4 item 6.
 * soi.require_approval is read and stored on the application so the review queue
 * can act on it, but even with approval switched off this path grants nothing:
 * a flow that quietly admitted people while the surface said "application" would
 * be the exact failure spec §5 forbids.
 */
export async function submitSoiApplication(
  eventId: string,
  submission: SoiApplySubmission,
  now: Date = new Date()
): Promise<SoiSubmitOutcome> {
  // Re-derive everything. The context the browser was shown is a rendering hint;
  // it is never evidence. Eligibility, the window, capacity and identity are all
  // decided again here, at write time.
  const context = await buildSoiApplyContext(eventId, now);
  if (context.refusal) return { result: null, refusal: context.refusal };

  const applicant = await resolveSoiApplicant();
  if (!applicant) {
    return {
      result: null,
      refusal: {
        code: 'not_signed_in',
        status: 401,
        message: 'Your session has expired. Sign in again and resubmit your application.',
      },
    };
  }

  const { batchChoiceMode, requireApproval } = context.policy;
  let requestedBatch: SoiApplyBatchView | null = null;

  if (batchChoiceMode === 'participant_choose') {
    const chosenId = (submission.batchCohortId ?? '').trim();
    if (!chosenId) {
      return {
        result: null,
        refusal: {
          code: 'batch_required',
          status: 400,
          message: 'Choose which batch you want to join before submitting.',
        },
      };
    }
    const chosen = context.batches.find((b) => b.id === chosenId);
    if (!chosen) {
      return {
        result: null,
        refusal: {
          code: 'batch_required',
          status: 400,
          message:
            'That batch is not part of this programme. Reload the page and choose ' +
            'one of the batches listed.',
        },
      };
    }
    if (!chosen.intakeOpen) {
      return {
        result: null,
        refusal: {
          code: 'batch_not_open',
          status: 422,
          message: `${chosen.name} is not accepting applications right now. Choose a batch whose applications are open.`,
        },
      };
    }
    if (chosen.isFull && chosen.fullBehaviour === 'offer_another_batch') {
      const alternatives = context.batches.filter((b) => b.acceptingNow).map((b) => b.name);
      return {
        result: null,
        refusal: {
          code: 'batch_full',
          status: 422,
          message: alternatives.length
            ? `${chosen.name} is full. These batches still have room: ${alternatives.join(', ')}.`
            : `${chosen.name} is full, and no other batch has room at the moment. ` +
              'Contact the programme coordinator to ask about the next round.',
        },
      };
    }
    requestedBatch = chosen;
  }
  // 'staff_assign' — no batch is collected and any batchCohortId in the body is
  // ignored, so an applicant cannot pick their own batch by editing the request.

  // D5 — the applicant is waitlisted when the batch they will land in is full
  // and the programme's answer to a full batch is to hold them. With
  // staff_assign there is no chosen batch, so the question is whether every batch
  // that is STILL OPEN is full — and whether the programme keeps a list at all.
  //
  // Only open batches are counted. `acceptingNow` is intakeOpen && !isFull, so
  // asking every(!acceptingNow) would read a closed window as a full one and
  // stamp 'waitlisted' on somebody who is really just late — the message they
  // then get ('a coordinator will contact you when a place opens up') would
  // promise a seat that was never the obstacle. buildSoiApplyContext has already
  // refused the all-windows-shut case above, so openBatches is non-empty here;
  // the length check keeps this honest if that guard is ever moved.
  //
  // soi.batch_full_behaviour is named on BOTH branches on purpose. The
  // staff_assign branch used to rely on the earlier no_open_batch guard having
  // already refused when nothing keeps a list — true today, but it left the one
  // decision the setting governs reading as though the setting were not
  // consulted. Anybody reordering those guards would have silently turned the
  // waiting list on for a programme that had switched it off.
  const openBatches = context.batches.filter((b) => b.intakeOpen);
  const anyBatchWaitlists = context.batches.some((b) => b.fullBehaviour === 'waitlist');
  const isWaitlisted = requestedBatch
    ? requestedBatch.isFull && requestedBatch.fullBehaviour === 'waitlist'
    : openBatches.length > 0 && openBatches.every((b) => b.isFull) && anyBatchWaitlists;

  // Required questions are validated with the SAME helper the tournament path
  // uses, so "required" means one thing across the platform.
  const { fields } = await loadFormSections(eventId);
  const answers = submission.answers ?? {};
  const answersError = validateCustomFields(fields, answers);
  if (answersError) {
    return {
      result: null,
      refusal: { code: 'answers_incomplete', status: 422, message: answersError },
    };
  }

  // Is this a repeat? Read AFTER every refusal has been cleared, so a person who
  // cannot apply never costs a query. buildSoiApplyContext has already proved
  // there is no live application, so anything found here is decided and closed.
  const prior = await findPriorApplications(eventId, applicant.profileId);
  const reapplication =
    prior.count > 0 && prior.latest
      ? {
          reapplication: {
            attempt: prior.count + 1,
            previous_application_id: prior.latest.id,
            previous_status: prior.latest.status,
            previous_decision: prior.latest.decision,
            previous_decided_at: prior.latest.decidedAt,
          },
        }
      : {};

  // ── the prefilled boxes, judged against the record (Director decision) ─────
  // A changed box is never a refusal. It is recorded, so a coordinator sees the
  // disagreement instead of the typed value silently becoming the truth about
  // this person. The record's own value is filed under a readable key as well,
  // because the review queue prints every custom_fields entry with its field's
  // label and falls back to the raw key — which puts "Name — on record" right
  // beside "Name" in the answer list, with no change to any SQL.
  const mismatches = soiPrefillMismatches(fields, context.knownAnswers, answers);
  const answersWithRecord = { ...answers };
  for (const mismatch of mismatches) {
    answersWithRecord[soiOnRecordAnswerKey(mismatch.field_label)] = mismatch.on_record;
  }

  const svc = createServiceRoleClient();
  const { data, error } = await (svc as any)
    .from('events_registrations')
    .insert({
      event_id: eventId,
      // ── identity, every field of it read from the session ────────────────
      profile_id: applicant.profileId,
      learner_id: applicant.learnerId,
      participant_type: 'internal',
      participant_name: applicant.fullName ?? applicant.email ?? 'JKKN applicant',
      participant_email: applicant.email,
      institution_id: applicant.institutionId,
      // ── application state ────────────────────────────────────────────────
      status: isWaitlisted ? 'waitlisted' : 'pending',
      payment_status: 'not_required',
      source: SOI_APPLICATION_SOURCE,
      registered_by: applicant.profileId,
      custom_fields: answersWithRecord,
      custom_data: {
        soi: {
          audiences: applicant.audiences,
          // The answer to the question the form no longer asks. Derived from
          // this person's own records — profiles.learner_id and an ACTIVE staff
          // row — which is the same reading eligibility was already decided on
          // above, so the application cannot contradict its own admission.
          // 'learner' wins when somebody is both: they applied to a programme
          // whose learner audience already admitted them.
          member_type: applicant.audiences.includes('learner')
            ? ('learner' as SoiMemberType)
            : (applicant.audiences[0] ?? null),
          member_type_source: 'derived_from_record',
          // Empty when every prefilled box was left as the record had it.
          prefill_mismatches: mismatches,
          batch_choice_mode: batchChoiceMode,
          requested_batch_cohort_id: requestedBatch?.id ?? null,
          requested_batch_name: requestedBatch?.name ?? null,
          require_approval: requireApproval,
          applied_at: now.toISOString(),
          ...reapplication,
        },
      },
    })
    .select('id, status')
    .single();

  if (error || !data) {
    throw error ?? new Error('Could not record the application');
  }

  return {
    refusal: null,
    result: {
      applicationId: data.id,
      status: isWaitlisted ? 'waitlisted' : 'pending',
      requestedBatchId: requestedBatch?.id ?? null,
      message: isWaitlisted
        ? 'Every batch is full right now, so you are on the waiting list rather than ' +
          'turned away. Your application stays open: when a place frees up a ' +
          'coordinator offers it from this list, and you will be told either way. ' +
          'You do not need to apply again.'
        : 'Your application has been received. A coordinator will review it and let you know the outcome.',
    },
  };
}
