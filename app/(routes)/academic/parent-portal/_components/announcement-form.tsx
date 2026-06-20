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
} from '@/lib/services/academic/parent-portal-admin-service';
import type { Attachment } from '@/types/parent-portal';
import { AttachmentField } from './attachment-field';
import { RichTextEditor } from '@/components/ui/rich-text-editor';

const CATEGORIES = ['general', 'exam', 'fee', 'holiday', 'event', 'greetings'];
const SELECT =
  'w-full rounded-lg border bg-white p-2.5 text-sm shadow-sm focus:border-[#0b6d41] focus:outline-none focus:ring-1 focus:ring-[#0b6d41] dark:bg-neutral-900';

export function AnnouncementForm({
  target,
  label,
  onSaved,
}: {
  target: PPTarget;
  label: (s: string) => string;
  onSaved: () => void;
}) {
  const [f, setF] = useState({ title: '', body: '', category: 'general' });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);

  // Narrowest selected level wins; fan out one announcement per target.
  const fanout: Array<{ programId?: string; sectionId?: string; learnerId?: string }> =
    target.learnerIds.length
      ? target.learnerIds.map((id) => ({ learnerId: id }))
      : target.sectionIds.length
      ? target.sectionIds.map((id) => ({ sectionId: id }))
      : target.programIds.length
      ? target.programIds.map((id) => ({ programId: id }))
      : [{}];

  const audience = target.learnerIds.length
    ? `${target.learnerIds.length} learner(s)`
    : target.sectionIds.length
    ? `${target.sectionIds.length} ${label('Section')}(s)`
    : target.programIds.length
    ? `${target.programIds.length} ${label('Program')}(s)`
    : 'the whole institution';

  const submit = async () => {
    if (!target.institutionId) return toast.error('Select an institution first.');
    if (!f.title.trim()) return toast.error('Title is required.');
    if (!f.body.trim()) return toast.error('Message is required.');
    if (!f.category.trim()) return toast.error('Category is required.');
    setSaving(true);
    try {
      await Promise.all(
        fanout.map((t) =>
          ParentPortalAdminService.createAnnouncement({ institutionId: target.institutionId, ...t, ...f, attachments })
        )
      );
      toast.success(`Published to ${audience}.`);
      setF({ title: '', body: '', category: 'general' });
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
      <p className="rounded-lg bg-[#0b6d41]/5 px-3 py-2 text-xs text-muted-foreground">
        Visible to <span className="font-semibold text-[#0b6d41]">{audience}</span> — set by the
        filters above.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="ann-title">Title</Label>
        <Input id="ann-title" placeholder="e.g. Rising temperature advisory" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Message <span className="text-rose-500">*</span></Label>
        <RichTextEditor
          value={f.body}
          onChange={(v) => setF({ ...f, body: v })}
          placeholder="Write the announcement…"
          maxLength={2000}
        />
        <p className="text-xs text-muted-foreground">
          Use the toolbar to format your message with bold, lists, and links.
        </p>
      </div>
      <div className="space-y-1.5 sm:max-w-xs">
        <Label>Category</Label>
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className={`${SELECT} capitalize`}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <AttachmentField
        feature="announcements"
        institutionId={target.institutionId}
        context={{ programIds: target.programIds, sectionIds: target.sectionIds, learnerIds: target.learnerIds }}
        value={attachments}
        onChange={setAttachments}
      />
      <Button disabled={saving} className="w-full bg-[#0b6d41] py-5 font-semibold hover:bg-[#0a5733] sm:w-auto" onClick={submit}>
        Publish announcement
      </Button>
    </Card>
  );
}
