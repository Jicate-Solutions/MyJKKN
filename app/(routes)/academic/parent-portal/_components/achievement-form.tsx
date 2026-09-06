'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ParentPortalAdminService,
  type PPTarget,
  type PPLearner,
} from '@/lib/services/academic/parent-portal-admin-service';
import type { Attachment } from '@/types/parent-portal';
import { AttachmentField } from './attachment-field';
import { RichTextEditor } from '@/components/ui/rich-text-editor';

export function AchievementForm({
  target,
  label,
  learners,
  onSaved,
}: {
  target: PPTarget;
  label: (s: string) => string;
  learners: PPLearner[];
  onSaved: () => void;
}) {
  const [f, setF] = useState({ title: '', description: '', category: '', achievedOn: '' });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);
  const names = learners.filter((l) => target.learnerIds.includes(l.id)).map((l) => l.name);

  const submit = async () => {
    if (!target.learnerIds.length)
      return toast.error(`Select learner(s) in the filters above.`);
    if (!f.title.trim()) return toast.error('Title is required.');
    if (!f.description.trim()) return toast.error('Description is required.');
    if (!f.category.trim()) return toast.error('Category is required.');
    if (!f.achievedOn) return toast.error('Achieved-on date is required.');
    setSaving(true);
    try {
      await Promise.all(
        target.learnerIds.map((learnerId) =>
          ParentPortalAdminService.createAchievement({ institutionId: target.institutionId, learnerId, ...f, attachments })
        )
      );
      toast.success(`Achievement recorded for ${target.learnerIds.length} learner(s).`);
      setF({ title: '', description: '', category: '', achievedOn: '' });
      setAttachments([]);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-4 p-5">
      {target.learnerIds.length ? (
        <p className="rounded-lg bg-[#0b6d41]/5 px-3 py-2 text-xs text-muted-foreground">
          For <span className="font-semibold text-[#0b6d41]">{target.learnerIds.length} learner(s)</span>
          {names.length ? `: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}` : ''}
        </p>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          Select a {label('Section')} and learner(s) in the filters above.
        </p>
      )}
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input placeholder="e.g. 1st place, Science Fair" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Description <span className="text-rose-500">*</span></Label>
        <RichTextEditor
          value={f.description}
          onChange={(v) => setF({ ...f, description: v })}
          placeholder="Details of the achievement"
          maxLength={2000}
        />
        <p className="text-xs text-muted-foreground">
          Use the toolbar to format the description with bold, lists, and links.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Category</Label><Input placeholder="academic / sports…" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Achieved on</Label><Input type="date" value={f.achievedOn} onChange={(e) => setF({ ...f, achievedOn: e.target.value })} /></div>
      </div>
      <AttachmentField
        feature="achievements"
        institutionId={target.institutionId}
        context={{ learnerIds: target.learnerIds }}
        value={attachments}
        onChange={setAttachments}
      />
      <Button disabled={saving || !target.learnerIds.length} className="w-full bg-[#0b6d41] py-5 font-semibold hover:bg-[#0a5733] sm:w-auto" onClick={submit}>
        Record achievement
      </Button>
    </Card>
  );
}
