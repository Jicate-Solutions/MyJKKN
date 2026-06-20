'use client';

import { use, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils';
import { ParentRichContent, ParentAttachments } from '@/components/parent/parent-media';
import { useParentHomeworkDetail } from '@/hooks/parent/use-parent-features';
import { useParentSession } from '@/hooks/parent/use-parent-session';
import { ParentFeatures } from '@/lib/services/parent/parent-features-service';

export default function HomeworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { activeLearnerId } = useParentSession();
  const { data: hw, isLoading } = useParentHomeworkDetail(id);
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  if (isLoading || !hw) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const sub = hw.submission;
  const isMarked = sub?.status === 'marked';
  const alreadySubmitted = sub && sub.status !== 'pending';

  const submit = async () => {
    if (!activeLearnerId || !text.trim()) return toast.error('Please write your submission.');
    setSaving(true);
    try {
      await ParentFeatures.submitHomework(id, activeLearnerId, text.trim());
      toast.success('Submitted!');
      setText('');
      queryClient.invalidateQueries({ queryKey: ['parent-homework'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-5">
        {hw.subject && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#0b6d41]">{hw.subject}</span>
        )}
        <h1 className="text-lg font-bold">{hw.title}</h1>
        <div className="flex gap-4 text-xs text-muted-foreground">
          {hw.dueDate && <span>Due {formatDate(hw.dueDate)}</span>}
          {hw.maxMarks != null && <span>Max marks {hw.maxMarks}</span>}
        </div>
        {hw.instructions && <ParentRichContent content={hw.instructions} className="text-sm" />}
        <ParentAttachments files={hw.attachmentUrls} />
      </Card>

      {isMarked ? (
        <Card className="space-y-1 p-5">
          <h2 className="text-sm font-semibold">Marked</h2>
          <p className="text-2xl font-bold text-[#0b6d41]">
            {sub?.marks ?? '—'}
            {hw.maxMarks != null && <span className="text-base text-muted-foreground"> / {hw.maxMarks}</span>}
          </p>
          {sub?.feedback && <p className="text-sm text-muted-foreground">{sub.feedback}</p>}
        </Card>
      ) : (
        hw.requiresSubmission && (
          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-semibold">
              {alreadySubmitted ? 'Update submission' : 'Submit your work'}
            </h2>
            {alreadySubmitted && (
              <p className="text-xs text-muted-foreground">
                Status: <span className="capitalize">{sub?.status}</span>
                {sub?.submittedAt && ` · ${formatDate(sub.submittedAt)}`}
              </p>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={sub?.submissionText || 'Type your answer or a note for the teacher…'}
              className="min-h-28 w-full rounded-xl border p-3 text-sm outline-none focus:ring-2 focus:ring-[#0b6d41]/30"
            />
            <p className="text-[11px] text-muted-foreground">File attachments coming soon.</p>
            <Button
              onClick={submit}
              disabled={saving}
              className="w-full bg-gradient-to-r from-[#0b6d41] to-[#0a5733] py-5 font-semibold"
            >
              {saving ? 'Submitting…' : 'Submit'}
            </Button>
          </Card>
        )
      )}
    </div>
  );
}
