// lib/certificates/resolve-data.ts
// ============================================================================
// Server-only: resolve everything a certificate prints from a service request.
//
//   service_requests.requester_id → profiles (learner_id, email)
//     → learners_profiles (name, register no, parent, gender, programme, batch)
//
// Reads go through the service-role client: the office staff member printing
// the certificate is usually NOT the learner, and learner-row RLS is written
// for the learner/their institution. Authorization is the ROUTE's job (it has
// already checked service_requests.manage before calling this).
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/server';
import { clean, displayLearnerName, type CertificateData } from './wording';
import {
  batchSpanLabel,
  currentAcademicYearLabel,
  purposeFromFormData,
  yearOfStudyFromBatch,
  yearOfStudyLabel,
} from './derive';

export { batchSpanLabel, currentAcademicYearLabel, purposeFromFormData, yearOfStudyLabel } from './derive';

interface LearnerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
  register_number: string | null;
  gender: string | null;
  father_name: string | null;
  mother_name: string | null;
  college_email: string | null;
  program: { program_name: string | null } | null;
  batch: { batch_name: string | null; start_date: string | null; end_date: string | null } | null;
  semester: { semester_name: string | null; semester_code: string | null; semester_order: number | null } | null;
}

const LEARNER_SELECT = `
  id, first_name, last_name, roll_number, register_number, gender,
  father_name, mother_name, college_email,
  program:programs(program_name),
  batch:batches(batch_name, start_date, end_date),
  semester:semesters(semester_name, semester_code, semester_order)
`;

export interface ResolvedCertificateSubject {
  data: CertificateData;
  /** Whether a learner record was found (otherwise data came from the profile only). */
  learnerFound: boolean;
}

export async function resolveCertificateSubject(requestId: string): Promise<ResolvedCertificateSubject> {
  const db = createServiceRoleClient() as any;

  const { data: request, error: reqError } = await db
    .from('service_requests')
    .select('id, requester_id, form_data, requester_context, service_type:service_types(fields:service_type_fields(field_key, field_label))')
    .eq('id', requestId)
    .single();
  if (reqError || !request) throw new Error('Service request not found');

  const { data: profile } = await db
    .from('profiles')
    .select('id, full_name, email, learner_id')
    .eq('id', request.requester_id)
    .single();

  // Learner row: by the profile's learner_id first, then by college email —
  // the same two links the ID-card renderer and the request creator rely on.
  let learner: LearnerRow | null = null;
  if (profile?.learner_id) {
    const { data } = await db
      .from('learners_profiles')
      .select(LEARNER_SELECT)
      .eq('id', profile.learner_id)
      .maybeSingle();
    learner = (data as LearnerRow | null) ?? null;
  }
  if (!learner && profile?.email) {
    const { data } = await db
      .from('learners_profiles')
      .select(LEARNER_SELECT)
      .eq('college_email', profile.email)
      .maybeSingle();
    learner = (data as LearnerRow | null) ?? null;
  }

  const ctx = (request.requester_context ?? {}) as Record<string, string | undefined>;

  const academicYear = currentAcademicYearLabel();
  // Year of study: the learner's current semester row first; when the record
  // has no usable semester, count years from the batch start.
  const yearOfStudy =
    yearOfStudyLabel(learner?.semester ?? ctx.semester) ||
    yearOfStudyFromBatch(learner?.batch?.start_date, academicYear);

  const data: CertificateData = {
    learnerName: learner
      ? displayLearnerName(learner.first_name, learner.last_name)
      : clean(profile?.full_name),
    registerNumber: clean(learner?.register_number) || clean(learner?.roll_number),
    parentName: clean(learner?.father_name) || clean(learner?.mother_name),
    gender: clean(learner?.gender),
    programName: clean(learner?.program?.program_name) || clean(ctx.program),
    batchSpan: batchSpanLabel(learner?.batch ?? null),
    batchEndDate: learner?.batch?.end_date ?? null,
    yearOfStudy,
    requestPurpose: purposeFromFormData(request.form_data, request.service_type?.fields ?? []),
    currentAcademicYear: academicYear,
  };

  return { data, learnerFound: Boolean(learner) };
}
