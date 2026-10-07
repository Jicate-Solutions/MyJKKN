/**
 * lib/services/cdc/drive-public-registration.ts
 *
 * Public (no-login) registration for a CDC campus drive.
 *
 *   cdc_drives.public_registration_enabled + public_token  → /dr/<token>
 *   cdc_drive_public_registrations                          → one row per registrant
 *
 * The link exists once the drive has left draft; it ACCEPTS registrations only
 * while the drive is announced / collecting willingness. Everything here runs
 * with the service-role client — callers gate (permission for the CDC side,
 * token + status for the public side).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CdcDrive, CdcDriveStatus, CdcDriveTargetGender } from '@/types/cdc';
import { driveTargetGender, isLearnerTargeted } from './drive-targeting';

/** Statuses in which the public link can be switched on and is shown to the CDC team. */
export const PUBLIC_LINK_STATUSES: CdcDriveStatus[] = [
  'announced',
  'willingness_open',
  'eligibility_locked',
  'attendance_day',
  'results_announced',
  'closed',
];

/** Statuses in which the public page accepts a new registration. */
export const PUBLIC_REGISTRATION_OPEN_STATUSES: CdcDriveStatus[] = ['announced', 'willingness_open'];

export const PUBLIC_TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function isPublicRegistrationOpen(drive: Pick<CdcDrive, 'status' | 'public_registration_enabled'>): boolean {
  return drive.public_registration_enabled === true && PUBLIC_REGISTRATION_OPEN_STATUSES.includes(drive.status);
}

export interface CdcDrivePublicRegistration {
  id: string;
  drive_id: string;
  full_name: string;
  email: string;
  mobile: string;
  gender: string;
  register_number: string | null;
  institution_id: string | null;
  institution_name: string;
  program_name: string;
  semester: string | null;
  cgpa: number | null;
  arrears: number | null;
  learner_id: string | null;
  in_audience: boolean | null;
  created_at: string;
}

/** What the public page is allowed to show — no ids beyond the drive's institutions. */
export interface PublicDriveView {
  title: string;
  description: string | null;
  status: CdcDriveStatus;
  open: boolean;
  recruiter_name: string | null;
  job_role_title: string | null;
  job_location: string | null;
  expected_package_lpa: number | null;
  drive_date: string | null;
  drive_start_time: string | null;
  venue_label: string | null;
  gender: CdcDriveTargetGender;
  institutions: Array<{ id: string; name: string }>;
}

type PublicDriveRow = Pick<
  CdcDrive,
  | 'id'
  | 'title'
  | 'description'
  | 'status'
  | 'recruiter_id'
  | 'institutions'
  | 'institution_semesters'
  | 'job_role_title'
  | 'job_location'
  | 'expected_package_lpa'
  | 'drive_date'
  | 'drive_start_time'
  | 'venue_label'
  | 'public_registration_enabled'
  | 'public_token'
>;

const PUBLIC_DRIVE_COLUMNS =
  'id, title, description, status, recruiter_id, institutions, institution_semesters, job_role_title, job_location, expected_package_lpa, drive_date, drive_start_time, venue_label, public_registration_enabled, public_token';

/** Drive behind a public token, or null when the token is unknown / the link is off / the drive is hidden. */
export async function loadDriveByPublicToken(service: SupabaseClient, token: string): Promise<PublicDriveRow | null> {
  if (!PUBLIC_TOKEN_RE.test(token)) return null;
  const { data, error } = await service.from('cdc_drives').select(PUBLIC_DRIVE_COLUMNS).eq('public_token', token).maybeSingle();
  if (error || !data) return null;
  const drive = data as unknown as PublicDriveRow;
  if (drive.public_registration_enabled !== true) return null;
  if (!PUBLIC_LINK_STATUSES.includes(drive.status)) return null;
  return drive;
}

export async function buildPublicDriveView(service: SupabaseClient, drive: PublicDriveRow): Promise<PublicDriveView> {
  const [recruiterRes, instRes] = await Promise.all([
    drive.recruiter_id
      ? service.from('cdc_recruiters').select('name').eq('id', drive.recruiter_id).maybeSingle()
      : Promise.resolve({ data: null }),
    drive.institutions?.length
      ? service.from('institutions').select('id, name').in('id', drive.institutions)
      : Promise.resolve({ data: [] }),
  ]);
  const institutions = ((instRes.data ?? []) as Array<{ id: string; name: string }>)
    .map((i) => ({ id: i.id, name: i.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    title: drive.title,
    description: drive.description,
    status: drive.status,
    open: isPublicRegistrationOpen(drive),
    recruiter_name: (recruiterRes.data as { name: string } | null)?.name ?? null,
    job_role_title: drive.job_role_title,
    job_location: drive.job_location,
    expected_package_lpa: drive.expected_package_lpa,
    drive_date: drive.drive_date,
    drive_start_time: drive.drive_start_time,
    venue_label: drive.venue_label,
    gender: driveTargetGender(drive),
    institutions,
  };
}

/**
 * Match a registrant to a JKKN learner by register number inside the drive's
 * institutions, and say whether that learner is in the drive's audience.
 */
export async function matchRegistrantToLearner(
  service: SupabaseClient,
  drive: Pick<CdcDrive, 'institutions' | 'institution_semesters'>,
  registerNumber: string | null
): Promise<{ learner_id: string | null; in_audience: boolean | null }> {
  if (!registerNumber || !drive.institutions?.length) return { learner_id: null, in_audience: null };
  // Escape LIKE wildcards — the value is user-typed on a public page.
  const pattern = registerNumber.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await service
    .from('learners_profiles')
    .select('id, institution_id, program_id, semester_id, gender')
    .ilike('register_number', pattern)
    .in('institution_id', drive.institutions)
    .limit(1)
    .maybeSingle();
  if (!data) return { learner_id: null, in_audience: null };
  let semester_order: number | null = null;
  if (data.semester_id) {
    const { data: sem } = await service.from('semesters').select('semester_order').eq('id', data.semester_id).maybeSingle();
    semester_order = (sem?.semester_order as number | null) ?? null;
  }
  const targeted = (drive.institution_semesters ?? []).length > 0;
  return {
    learner_id: data.id as string,
    in_audience: targeted
      ? isLearnerTargeted(drive, {
          institution_id: (data.institution_id as string | null) ?? null,
          program_id: (data.program_id as string | null) ?? null,
          gender: (data.gender as string | null) ?? null,
          semester_order,
        })
      : null,
  };
}
