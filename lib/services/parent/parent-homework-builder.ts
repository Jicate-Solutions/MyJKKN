/**
 * Parent Portal — homework assembly (server). Joins pp_homework (by the
 * learner's section) with the learner's pp_homework_submissions.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Homework, HomeworkStatus, Attachment } from '@/types/parent-portal';

const asAttachments = (v: unknown): Attachment[] =>
  Array.isArray(v) ? (v as Attachment[]) : [];

function mapHomework(hw: Record<string, any>, sub?: Record<string, any>): Homework {
  return {
    id: hw.id,
    subject: hw.subject ?? undefined,
    title: hw.title,
    instructions: hw.instructions ?? undefined,
    attachmentUrls: asAttachments(hw.attachment_urls),
    assignedOn: hw.assigned_on,
    dueDate: hw.due_date ?? undefined,
    maxMarks: hw.max_marks ?? undefined,
    requiresSubmission: hw.requires_submission ?? true,
    submission: sub
      ? {
          id: sub.id,
          status: (sub.status as HomeworkStatus) ?? 'pending',
          submittedAt: sub.submitted_at ?? undefined,
          attachmentUrls: asAttachments(sub.attachment_urls),
          marks: sub.marks ?? undefined,
          feedback: sub.feedback ?? undefined,
        }
      : undefined,
  };
}

export async function listHomework(
  db: SupabaseClient,
  learnerId: string,
  sectionId: string | null,
  institutionId: string | null
): Promise<Homework[]> {
  if (!sectionId || !institutionId) return [];

  const { data: hws } = await db
    .from('pp_homework')
    .select('*')
    .eq('institutions_id', institutionId)
    .eq('section_id', sectionId)
    .eq('is_active', true)
    .order('assigned_on', { ascending: false });

  const rows = hws ?? [];
  if (!rows.length) return [];

  const { data: subs } = await db
    .from('pp_homework_submissions')
    .select('*')
    .eq('learner_profile_id', learnerId)
    .in('homework_id', rows.map((h) => h.id));

  const subByHw = new Map((subs ?? []).map((s) => [s.homework_id, s]));
  return rows.map((h) => mapHomework(h, subByHw.get(h.id)));
}

export async function getHomework(
  db: SupabaseClient,
  homeworkId: string,
  learnerId: string
): Promise<Homework | null> {
  const { data: hw } = await db.from('pp_homework').select('*').eq('id', homeworkId).maybeSingle();
  if (!hw) return null;
  const { data: sub } = await db
    .from('pp_homework_submissions')
    .select('*')
    .eq('homework_id', homeworkId)
    .eq('learner_profile_id', learnerId)
    .maybeSingle();
  return mapHomework(hw, sub ?? undefined);
}
