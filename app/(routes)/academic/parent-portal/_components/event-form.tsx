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

/** Events are institution-wide (no section targeting) and push to all parents. */
export function EventForm({ target, onSaved }: { target: PPTarget; onSaved: () => void }) {
  const [f, setF] = useState({ title: '', description: '', eventDate: '', venue: '' });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!target.institutionId) return toast.error('Select an institution first.');
    if (!f.title.trim()) return toast.error('Title is required.');
    setSaving(true);
    try {
      await ParentPortalAdminService.createEvent({ institutionId: target.institutionId, ...f });
      toast.success('Event published to all parents.');
      setF({ title: '', description: '', eventDate: '', venue: '' });
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
        Events are <span className="font-semibold text-[#0b6d41]">institution-wide</span> — all
        parents are notified.
      </p>
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input placeholder="e.g. Annual Sports Day" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <textarea
          placeholder="Event details"
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          className="min-h-24 w-full rounded-lg border p-2.5 text-sm shadow-sm focus:border-[#0b6d41] focus:outline-none focus:ring-1 focus:ring-[#0b6d41]"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={f.eventDate} onChange={(e) => setF({ ...f, eventDate: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Venue</Label><Input placeholder="e.g. Main ground" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></div>
      </div>
      <Button disabled={saving} className="w-full bg-[#0b6d41] py-5 font-semibold hover:bg-[#0a5733] sm:w-auto" onClick={submit}>
        Publish event
      </Button>
    </Card>
  );
}
