'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Plus, ChevronRight, MessageSquareWarning } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { useParentConcerns } from '@/hooks/parent/use-parent-features';
import { useParentSession } from '@/hooks/parent/use-parent-session';
import { ParentFeatures } from '@/lib/services/parent/parent-features-service';
import { CONCERN_CATEGORIES, type ConcernStatus } from '@/types/parent-portal';

const STATUS_STYLE: Record<ConcernStatus, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-neutral-100 text-neutral-600',
};

const catLabel = (c: string) => c.replace(/_/g, ' ');

export default function ConcernsPage() {
  const { activeLearnerId } = useParentSession();
  const { data, isLoading } = useParentConcerns();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>('other');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const items = data?.data ?? [];

  const create = async () => {
    if (!activeLearnerId || !subject.trim() || !message.trim())
      return toast.error('Subject and message are required.');
    setSaving(true);
    try {
      await ParentFeatures.createConcern({ learnerId: activeLearnerId, category, subject, message });
      toast.success('Concern raised.');
      setOpen(false);
      setSubject('');
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['parent-concerns'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to raise concern');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Parent Concerns</h1>
        <Button size="sm" onClick={() => setOpen(true)} className="bg-[#0b6d41] hover:bg-[#0a5733]">
          <Plus className="mr-1 h-4 w-4" /> New
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <MessageSquareWarning className="mx-auto mb-2 h-6 w-6 text-[#0b6d41]" />
          No concerns yet. Tap “New” to raise one.
        </Card>
      ) : (
        items.map((c) => (
          <Link key={c.id} href={`/parent/concerns/${c.id}`}>
            <Card className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                {c.category && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[#0b6d41]">
                    {catLabel(c.category)}
                  </span>
                )}
                <p className="truncate font-medium">{c.subject}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_STYLE[c.status])}>
                    {c.status.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(c.updatedAt)}</span>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </Card>
          </Link>
        ))
      )}

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="mx-auto max-w-md">
          <DrawerHeader className="text-left">
            <DrawerTitle>Raise a concern</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border p-2.5 text-sm"
              >
                {CONCERN_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {catLabel(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="msg">Message</Label>
              <textarea
                id="msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-24 w-full rounded-xl border p-3 text-sm outline-none focus:ring-2 focus:ring-[#0b6d41]/30"
              />
            </div>
            <Button
              onClick={create}
              disabled={saving}
              className="w-full bg-gradient-to-r from-[#0b6d41] to-[#0a5733] py-5 font-semibold"
            >
              {saving ? 'Submitting…' : 'Submit concern'}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
