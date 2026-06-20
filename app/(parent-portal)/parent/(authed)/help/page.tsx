'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Bug, Lightbulb, Heart, HelpCircle } from 'lucide-react';
import { ParentFeatures } from '@/lib/services/parent/parent-features-service';
import type { FeedbackType } from '@/types/parent-portal';

const ACTIONS: { type: FeedbackType; label: string; icon: typeof Bug; color: string }[] = [
  { type: 'issue', label: 'Report an Issue', icon: Bug, color: 'text-red-600 bg-red-100' },
  { type: 'improvement', label: 'Suggest an Improvement', icon: Lightbulb, color: 'text-amber-600 bg-amber-100' },
  { type: 'appreciation', label: 'Share Appreciation', icon: Heart, color: 'text-pink-600 bg-pink-100' },
  { type: 'question', label: 'Ask a Question', icon: HelpCircle, color: 'text-blue-600 bg-blue-100' },
];

export default function HelpPage() {
  const [active, setActive] = useState<FeedbackType | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!active || !message.trim()) return toast.error('Please write a message.');
    setSaving(true);
    try {
      await ParentFeatures.feedback({ type: active, message: message.trim() });
      toast.success('Thank you for your feedback!');
      setActive(null);
      setMessage('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Help &amp; Feedback</h1>
      <p className="text-sm text-muted-foreground">Hi there 👋 How can we help?</p>
      <div className="grid gap-3">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <Card key={a.type} onClick={() => setActive(a.type)} className="flex cursor-pointer items-center gap-3 p-4">
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${a.color}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="font-medium">{a.label}</span>
            </Card>
          );
        })}
      </div>

      <Drawer open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <DrawerContent className="mx-auto max-w-md">
          <DrawerHeader className="text-left">
            <DrawerTitle>{ACTIONS.find((a) => a.type === active)?.label}</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us more…"
              className="min-h-28 w-full rounded-xl border p-3 text-sm outline-none focus:ring-2 focus:ring-[#0b6d41]/30"
            />
            <Button onClick={submit} disabled={saving} className="w-full bg-[#0b6d41]">
              {saving ? 'Submitting…' : 'Submit'}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
