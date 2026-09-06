/**
 * Shared orchestration for the super-admin purge of a rejected applicant.
 *
 * Two surfaces reach this: DELETE /applications/:id (screening rejection) and
 * DELETE /candidates/:id (pipeline rejection). Both erase the same person — the
 * RPC follows promoted_candidate_id in whichever direction it was given.
 *
 * Order matters and is deliberate: the database purge commits FIRST, then the
 * Drive resume is deleted. If Drive fails we do NOT roll back — the PII in
 * Postgres is the part that must go, and the purge-log row keeps the file id so
 * an orphaned resume stays findable. The reverse order would risk deleting the
 * resume and then failing the DB delete, leaving a record pointing at nothing.
 *
 * Server-only: pulls in the Drive service-account client (node:stream).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { RecruitmentService } from '@/lib/services/hr/recruitment-service';
import { deleteDriveFile } from '@/lib/google/drive-upload';
import type { PurgeRejectedApplicantResponse } from '@/types/hr-recruitment';

export async function purgeRejectedApplicant(
  supabase: SupabaseClient,
  target: { applicationId?: string | null; candidateId?: string | null }
): Promise<PurgeRejectedApplicantResponse> {
  // Throws 42501 if the caller isn't a super admin, or if the record isn't rejected.
  const result = await RecruitmentService.purgeRejectedApplicant(supabase, target);

  let resumesDeleted = 0;
  let resumesFailed = 0;

  for (const file of result.drive_files ?? []) {
    const gone = await deleteDriveFile(file.drive_file_id);
    if (!gone) {
      resumesFailed += 1;
      console.error(
        `[hr/recruitment/purge] Drive file ${file.drive_file_id} survived the purge — ` +
        `hr_recruitment_purge_log ${file.log_id} still holds the reference.`
      );
      continue;
    }

    resumesDeleted += 1;
    try {
      await RecruitmentService.clearPurgedResumeRef(supabase, file.log_id);
    } catch (err) {
      // The file IS deleted; only the bookkeeping failed. Leaving the reference
      // makes the sweep re-check a already-gone file, which is harmless (404 → true).
      console.error(`[hr/recruitment/purge] could not clear log ${file.log_id}`, err);
    }
  }

  return { ...result, resumes_deleted: resumesDeleted, resumes_failed: resumesFailed };
}
