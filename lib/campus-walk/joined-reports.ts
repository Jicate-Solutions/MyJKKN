// lib/campus-walk/joined-reports.ts
// ============================================================================
// "Add to the open report" — the extra reports a Campus Walk task collects
// when more people scan the same item's QR sticker while its first report is
// still open (app/api/instasolver/resource-report/route.ts).
//
// STORED SHAPE (metadata.additional_reports — keep it stable, other code
// relies on reporter_id to thank everyone once the job is fixed):
//   { reporter_id, raised_by_profile_id, reporter_role, note,
//     photo_storage_path, at }
//
// This file is the ONE reader of that array for the screens and the cron:
//   - the fix screen and the approvals screen show each note and photo, so the
//     person fixing it and the person signing it off see every report;
//   - the photo-retention cron purges each joined photo with the task's own.
//
// D10: a ticket shows how it arrived, never who sent it. The view type below
// has no reporter field on purpose — reporter_id, raised_by_profile_id and
// reporter_role must never reach a browser.
// ============================================================================

/** The most extra reports one task holds. Past this, a new report is filed. */
export const MAX_JOINED_REPORTS = 50;

/** One stored entry, as the report route writes it. */
export interface JoinedReportEntry {
  reporter_id: string;
  raised_by_profile_id: string;
  reporter_role: string | null;
  note: string;
  photo_storage_path: string | null;
  at: string;
}

/** What a screen may show: the note, when, and the photo's storage path. */
export interface JoinedReportView {
  note: string;
  at: string | null;
  photoStoragePath: string | null;
}

function entries(metadata: unknown): Record<string, unknown>[] {
  const list = (metadata as { additional_reports?: unknown } | null | undefined)?.additional_reports;
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object');
}

/** How many extra reports the task already holds. */
export function countJoinedReports(metadata: unknown): number {
  return entries(metadata).length;
}

/** Oldest first, reporter identity stripped. Entries with no note and no photo are skipped. */
export function readJoinedReports(metadata: unknown): JoinedReportView[] {
  const out: JoinedReportView[] = [];
  for (const e of entries(metadata)) {
    const note = typeof e.note === 'string' ? e.note.trim() : '';
    const photo =
      typeof e.photo_storage_path === 'string' && e.photo_storage_path.length > 0
        ? e.photo_storage_path
        : null;
    if (!note && !photo) continue;
    out.push({ note, at: typeof e.at === 'string' ? e.at : null, photoStoragePath: photo });
  }
  return out;
}

/** Every joined photo's storage path — for signing URLs and for the retention purge. */
export function joinedReportPhotoPaths(metadata: unknown): string[] {
  return readJoinedReports(metadata)
    .map((r) => r.photoStoragePath)
    .filter((p): p is string => Boolean(p));
}
