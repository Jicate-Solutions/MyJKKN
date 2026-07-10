'use client';

// Sports Tournaments — edit dialog for the event-level fields (name, dates,
// registration window, venue, scope, description). Divisions/entries/fixtures
// are managed on the detail page; this covers the fields set at creation.
// The inner form is keyed by tournament id so it remounts with fresh initial
// state per tournament (no setState-in-effect re-seeding).

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Event } from '@/types/events';
import type { TournamentScope } from '@/types/tournament';
import { useUpdateTournament } from '@/hooks/events/use-tournaments';

/** ISO timestamp / date string → yyyy-MM-dd for <input type="date">. */
const toDateInput = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

function EditTournamentForm({
  tournament,
  onClose,
  onSaved,
}: {
  tournament: Event;
  onClose: () => void;
  onSaved: () => void;
}) {
  const update = useUpdateTournament();

  const [form, setForm] = useState({
    name: tournament.name ?? '',
    description: tournament.description ?? '',
    scope: (tournament.scope === 'all_jkkn' ? 'all_jkkn' : 'institution') as TournamentScope,
    start_date: toDateInput(tournament.start_date),
    end_date: toDateInput(tournament.end_date),
    registration_open_date: toDateInput(tournament.registration_open_date),
    registration_close_date: toDateInput(tournament.registration_close_date),
    venue: tournament.venue ?? '',
  });

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const submit = () => {
    if (!form.name.trim()) return;
    update.mutate(
      {
        id: tournament.id,
        dto: {
          name: form.name.trim(),
          description: form.description || undefined,
          scope: form.scope,
          start_date: form.start_date || undefined,
          end_date: form.end_date || undefined,
          registration_open_date: form.registration_open_date || undefined,
          registration_close_date: form.registration_close_date || undefined,
          venue: form.venue.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          onSaved();
          onClose();
        },
      }
    );
  };

  return (
    <>
      <div className="space-y-4 py-1">
        <div className="space-y-1.5">
          <Label htmlFor="t-name">
            Tournament Name <span className="text-destructive">*</span>
          </Label>
          <Input id="t-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Scope</Label>
          <Select value={form.scope} onValueChange={(v) => set('scope', v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="institution">Institution only (Intra-College)</SelectItem>
              <SelectItem value="all_jkkn">All JKKN (Inter-College / District+)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="t-start">Start Date</Label>
            <Input
              id="t-start"
              type="date"
              value={form.start_date}
              onChange={(e) => set('start_date', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-end">End Date</Label>
            <Input
              id="t-end"
              type="date"
              value={form.end_date}
              onChange={(e) => set('end_date', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="t-reg-open">Registration Opens</Label>
            <Input
              id="t-reg-open"
              type="date"
              value={form.registration_open_date}
              onChange={(e) => set('registration_open_date', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-reg-close">Registration Closes</Label>
            <Input
              id="t-reg-close"
              type="date"
              value={form.registration_close_date}
              onChange={(e) => set('registration_close_date', e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="t-venue">Venue</Label>
          <Input
            id="t-venue"
            placeholder="e.g. JKKN Sports Complex, Main Ground"
            value={form.venue}
            onChange={(e) => set('venue', e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="t-desc">Description</Label>
          <Textarea
            id="t-desc"
            rows={3}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={update.isPending || !form.name.trim()}>
          {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </DialogFooter>
    </>
  );
}

export function EditTournamentDialog({
  open,
  onClose,
  tournament,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  tournament: Event | null;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Tournament</DialogTitle>
        </DialogHeader>
        {tournament && (
          <EditTournamentForm
            key={tournament.id}
            tournament={tournament}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
