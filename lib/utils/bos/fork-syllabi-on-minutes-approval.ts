import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fork all syllabi referenced in a meeting's minutes changes_log into fresh V2
 * versions when the meeting transitions `minutes_drafted → minutes_approved`.
 *
 * This mirrors what the manual `POST /api/bos/syllabus/[id]/revise` endpoint
 * does — duplicate the latest version, bump version_number, flip is_latest
 * on the old row, set revised_from_syllabus_id for lineage. The difference is
 * trigger and atomicity:
 *   • Manual revise:  user clicks "Revise" on a specific syllabus, supplies
 *                     updated_content inline.
 *   • Auto-fork here: server fires on status transition, duplicates verbatim
 *                     (no content changes — the chairman edits the new V2
 *                     manually afterward based on the changes_log they wrote).
 *
 * Failure mode: if a fork fails for one syllabus, the others still attempt to
 * fork. The caller receives a partial-success report so the status transition
 * itself can still succeed and the user can see which syllabi need manual
 * intervention. Rolling back the entire status transition because one fork
 * failed would be more disruptive than the partial-success state.
 */

interface ChangesLogEntryShape {
  syllabus_id?: string | null;
}

interface MinutesContentShape {
  changes_log?: ChangesLogEntryShape[];
}

export interface ForkResult {
  attempted: number;
  forked: Array<{ oldSyllabusId: string; newSyllabusId: string; newVersion: number }>;
  failed: Array<{ oldSyllabusId: string; reason: string }>;
}

export async function forkSyllabiOnMinutesApproval(
  db: SupabaseClient,
  meetingId: string,
  triggeringUserId: string,
): Promise<ForkResult> {
  const result: ForkResult = { attempted: 0, forked: [], failed: [] };

  // Step 1: Read the meeting's minutes_content and extract unique syllabus IDs.
  // Multiple change rows for the same syllabus should only fork it once.
  const { data: meeting, error: meetingError } = await db
    .from('bos_meetings')
    .select('id, minutes_content')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) {
    // No meeting → nothing to fork. Surface as zero-attempt rather than throwing
    // because we don't want a missing minutes_content to abort a transition.
    return result;
  }

  const minutesContent = (meeting.minutes_content as MinutesContentShape | null) ?? {};
  const changesLog = minutesContent.changes_log ?? [];
  const uniqueSyllabusIds = Array.from(
    new Set(
      changesLog
        .map((row) => row.syllabus_id ?? null)
        .filter((id): id is string => !!id),
    ),
  );

  if (uniqueSyllabusIds.length === 0) {
    return result;
  }

  result.attempted = uniqueSyllabusIds.length;

  // Step 2: For each unique syllabus, attempt to fork.
  for (const oldId of uniqueSyllabusIds) {
    try {
      // 2a. Fetch the old version (must still be is_latest=true — if a manual
      // revise already bumped it, skip to avoid double-forking).
      const { data: oldRow, error: fetchErr } = await db
        .from('bos_course_syllabi')
        .select('*')
        .eq('id', oldId)
        .maybeSingle();

      if (fetchErr || !oldRow) {
        result.failed.push({
          oldSyllabusId: oldId,
          reason: 'Old syllabus row not found',
        });
        continue;
      }

      if (!oldRow.is_latest) {
        // Already superseded (perhaps by a previous minutes approval or a
        // manual revise). Skip silently so re-running the transition is safe.
        continue;
      }

      // 2b. Flip the old version's is_latest to false.
      const { error: updErr } = await db
        .from('bos_course_syllabi')
        .update({
          is_latest: false,
          last_modified_by: triggeringUserId,
          last_modified_at: new Date().toISOString(),
        })
        .eq('id', oldId);

      if (updErr) {
        result.failed.push({
          oldSyllabusId: oldId,
          reason: `Failed to mark old version non-latest: ${updErr.message}`,
        });
        continue;
      }

      // 2c. Insert the new V2 — exact duplicate of V1 content, bumped version.
      const newVersionPayload = {
        institutions_id: oldRow.institutions_id,
        board_id: oldRow.board_id,
        regulation_id: oldRow.regulation_id,
        composition_id: oldRow.composition_id,
        course_code: oldRow.course_code,
        course_name: oldRow.course_name,
        course_credits: oldRow.course_credits,
        total_hours: oldRow.total_hours,
        contact_hours: oldRow.contact_hours,
        stream: oldRow.stream,
        version_number: (oldRow.version_number || 1) + 1,
        is_latest: true,
        is_archived: false,
        revised_from_syllabus_id: oldRow.id,
        course_objectives: oldRow.course_objectives,
        course_learning_outcomes: oldRow.course_learning_outcomes,
        course_content: oldRow.course_content,
        textbooks: oldRow.textbooks,
        web_resources: oldRow.web_resources,
        pedagogy: oldRow.pedagogy,
        po_mappings: oldRow.po_mappings,
        notes:
          `Auto-created on minutes approval of meeting ${meetingId}.\n\n` +
          `--- Previous version notes ---\n${oldRow.notes ?? ''}`.trim(),
        created_by: triggeringUserId,
      };

      const { data: newRow, error: insErr } = await db
        .from('bos_course_syllabi')
        .insert(newVersionPayload)
        .select('id, version_number')
        .single();

      if (insErr || !newRow) {
        // Best-effort rollback: restore is_latest on the old row so it isn't
        // left orphaned.
        await db
          .from('bos_course_syllabi')
          .update({ is_latest: true })
          .eq('id', oldId);
        result.failed.push({
          oldSyllabusId: oldId,
          reason: `Insert new version failed: ${insErr?.message ?? 'unknown'}`,
        });
        continue;
      }

      result.forked.push({
        oldSyllabusId: oldId,
        newSyllabusId: newRow.id,
        newVersion: newRow.version_number,
      });
    } catch (e) {
      result.failed.push({
        oldSyllabusId: oldId,
        reason: (e as Error).message,
      });
    }
  }

  return result;
}
