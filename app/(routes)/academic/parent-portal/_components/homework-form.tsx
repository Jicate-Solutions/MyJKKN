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
  type PPSection,
} from '@/lib/services/academic/parent-portal-admin-service';
import type { Attachment } from '@/types/parent-portal';
import { AttachmentField } from './attachment-field';
import { RichTextEditor } from '@/components/ui/rich-text-editor';

export function HomeworkForm({
  target,
  label,
  sections,
  onSaved,
}: {
  target: PPTarget;
  label: (s: string) => string;
  sections: PPSection[];
  onSaved: () => void;
}) {
  const [f, setF] = useState({ subject: '', title: '', instructions: '', dueDate: '', maxMarks: '' });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [saving, setSaving] = useState(false);

  // No sections selected → assign to ALL shown sections; else the selected ones.
  const targetSectionIds = target.sectionIds.length ? target.sectionIds : sections.map((s) => s.id);

  const submit = async () => {
    if (!target.institutionId) return toast.error('Select an institution first.');
    if (!targetSectionIds.length) return toast.error(`No ${label('Sections')} available.`);
    if (!f.subject.trim()) return toast.error(`${label('Subject')} is required.`);
    if (!f.title.trim()) return toast.error('Title is required.');
    if (!f.instructions.trim()) return toast.error('Instructions are required.');
    if (!f.dueDate) return toast.error('Due date is required.');
    if (!f.maxMarks.trim()) return toast.error('Max marks are required.');
    setSaving(true);
    try {
      await Promise.all(
        targetSectionIds.map((sectionId) =>
          ParentPortalAdminService.createHomework({
            institutionId: target.institutionId,
            sectionId,
            subject: f.subject,
            title: f.title,
            instructions: f.instructions,
            dueDate: f.dueDate,
            maxMarks: Number(f.maxMarks),
            attachments,
          })
        )
      );
      toast.success(`Homework assigned to ${targetSectionIds.length} ${label('Section')}(s).`);
      setF({ subject: '', title: '', instructions: '', dueDate: '', maxMarks: '' });
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
      <p className={targetSectionIds.length ? 'rounded-lg bg-[#0b6d41]/5 px-3 py-2 text-xs text-muted-foreground' : 'rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700'}>
        {targetSectionIds.length
          ? `Assigning to ${targetSectionIds.length} ${label('Section')}(s) ${target.sectionIds.length ? '(selected)' : '(all)'}.`
          : `No ${label('Sections')} available — pick an institution above.`}
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>{label('Subject')}</Label><Input placeholder={label('Subject')} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Title</Label><Input placeholder="e.g. Chapter 4 exercises" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      </div>
      <div className="space-y-1.5">
        <Label>Instructions <span className="text-rose-500">*</span></Label>
        <RichTextEditor
          value={f.instructions}
          onChange={(v) => setF({ ...f, instructions: v })}
          placeholder="What should the learner do?"
          maxLength={2000}
        />
        <p className="text-xs text-muted-foreground">
          Use the toolbar to format the instructions with bold, lists, and links.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Due date</Label><Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Max marks</Label><Input type="number" value={f.maxMarks} onChange={(e) => setF({ ...f, maxMarks: e.target.value })} /></div>
      </div>
      <AttachmentField
        feature="homework"
        institutionId={target.institutionId}
        context={{ programIds: target.programIds, sectionIds: targetSectionIds }}
        value={attachments}
        onChange={setAttachments}
      />
      <Button disabled={saving || !targetSectionIds.length} className="w-full bg-[#0b6d41] py-5 font-semibold hover:bg-[#0a5733] sm:w-auto" onClick={submit}>
        Assign homework
      </Button>
    </Card>
  );
}
