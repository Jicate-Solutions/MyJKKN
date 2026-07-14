'use client';

// Sports Tournaments — edit dialog with full create-form parity: event fields
// (name, scope, dates, registration window, venue, public/external toggles,
// description) plus the division fields set at creation (sport, level, format,
// category, age band). Divisions load via useTournament(id); when several
// exist a picker chooses which one to edit. Entries/fixtures stay on the
// detail page. The inner form is keyed by tournament id so it remounts with
// fresh initial state per tournament (no setState-in-effect re-seeding).

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
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Event } from '@/types/events';
import { JKKN_SPORTS, SPORT_LEVELS } from '@/types/health-sports';
import { TOURNAMENT_FORMATS, DIVISION_GENDERS } from '@/types/tournament';
import type {
  TournamentDivision,
  TournamentScope,
  UpdateDivisionDto,
} from '@/types/tournament';
import {
  useTournament,
  useUpdateTournament,
  useUpdateDivision,
} from '@/hooks/events/use-tournaments';

/** ISO timestamp / date string → yyyy-MM-dd for <input type="date">. */
const toDateInput = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

/**
 * Editable fields of one division. Changes accumulate in `edits` (an overlay
 * on the division's current values), so only touched fields hit the update
 * DTO and switching divisions never needs async state re-seeding.
 */
function DivisionFields({
  division,
  edits,
  onEdit,
  onEditConfig,
}: {
  division: TournamentDivision;
  edits: UpdateDivisionDto;
  onEdit: (field: keyof UpdateDivisionDto, value: string) => void;
  onEditConfig: (patch: Record<string, unknown>) => void;
}) {
  const sport = (edits.sport ?? division.sport) || '';
  // Keep a legacy/renamed sport selectable even if it left the catalog.
  const sportOptions = JKKN_SPORTS.includes(sport as (typeof JKKN_SPORTS)[number])
    ? JKKN_SPORTS
    : [sport, ...JKKN_SPORTS];

  const currentFee = Number(
    ((edits.config ?? division.config) as { entry_fee?: number } | undefined)?.entry_fee ?? 0
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Sport</Label>
          <Select value={sport} onValueChange={(v) => onEdit('sport', v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select sport" />
            </SelectTrigger>
            <SelectContent>
              {sportOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Level</Label>
          <Select
            value={(edits.level ?? division.level) || undefined}
            onValueChange={(v) => onEdit('level', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select level" />
            </SelectTrigger>
            <SelectContent>
              {SPORT_LEVELS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Format</Label>
          <Select
            value={(edits.format ?? division.format) || undefined}
            onValueChange={(v) => onEdit('format', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select format" />
            </SelectTrigger>
            <SelectContent>
              {TOURNAMENT_FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select
            value={(edits.gender ?? division.gender) || undefined}
            onValueChange={(v) => onEdit('gender', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {DIVISION_GENDERS.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-age-band">Age Band</Label>
        <Input
          id="t-age-band"
          placeholder="e.g. U-19, Open"
          value={edits.age_band !== undefined ? edits.age_band ?? '' : division.age_band ?? ''}
          onChange={(e) => onEdit('age_band', e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="t-entry-fee">Entry Fee (₹)</Label>
        <Input
          id="t-entry-fee"
          type="number"
          min="0"
          step="1"
          value={currentFee || ''}
          onChange={(e) =>
            onEditConfig({
              ...(division.config as Record<string, unknown>),
              entry_fee: e.target.value ? Number(e.target.value) : 0,
            })
          }
          placeholder="0 = free"
        />
      </div>
    </div>
  );
}

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
  const updateDivision = useUpdateDivision();
  // Divisions aren't on the list row — fetch the full tournament for them.
  const { data: detail, isLoading: divisionsLoading } = useTournament(tournament.id);
  const divisions = detail?.divisions ?? [];

  const [form, setForm] = useState({
    name: tournament.name ?? '',
    description: tournament.description ?? '',
    scope: (tournament.scope === 'all_jkkn' ? 'all_jkkn' : 'institution') as TournamentScope,
    start_date: toDateInput(tournament.start_date),
    end_date: toDateInput(tournament.end_date),
    registration_open_date: toDateInput(tournament.registration_open_date),
    registration_close_date: toDateInput(tournament.registration_close_date),
    venue: tournament.venue ?? '',
    is_public: tournament.is_public ?? false,
    allow_external_registration: tournament.allow_external_registration ?? false,
  });

  // Which division is being edited + the touched-fields overlay for it.
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null);
  const [divisionEdits, setDivisionEdits] = useState<UpdateDivisionDto>({});

  const selectedDivision =
    divisions.find((d) => d.id === selectedDivisionId) ?? divisions[0] ?? null;

  const set = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const setDivision = (field: keyof UpdateDivisionDto, value: string) =>
    setDivisionEdits((prev) => ({ ...prev, [field]: value }));

  const setDivisionConfig = (patch: Record<string, unknown>) =>
    setDivisionEdits((prev) => ({ ...prev, config: patch }));

  const isPending = update.isPending || updateDivision.isPending;

  const submit = async () => {
    if (!form.name.trim()) return;
    try {
      await update.mutateAsync({
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
          is_public: form.is_public,
          allow_external_registration: form.allow_external_registration,
        },
      });

      if (selectedDivision && Object.keys(divisionEdits).length > 0) {
        await updateDivision.mutateAsync({
          id: selectedDivision.id,
          eventId: tournament.id,
          dto: {
            ...divisionEdits,
            // Cleared age band means "remove it", not "leave unchanged".
            ...(divisionEdits.age_band !== undefined
              ? { age_band: divisionEdits.age_band?.toString().trim() || null }
              : {}),
          },
        });
      }

      onSaved();
      onClose();
    } catch {
      // handled by mutation toasts
    }
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

        {/* Division fields (sport, level, format, category, age band) */}
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm font-semibold">Division</Label>
            {divisions.length > 1 && selectedDivision && (
              <Select
                value={selectedDivision.id}
                onValueChange={(v) => {
                  setSelectedDivisionId(v);
                  setDivisionEdits({});
                }}
              >
                <SelectTrigger className="h-8 w-auto min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {divisions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {[d.sport, d.age_band].filter(Boolean).join(' — ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {divisionsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : selectedDivision ? (
            <DivisionFields
              division={selectedDivision}
              edits={divisionEdits}
              onEdit={setDivision}
              onEditConfig={setDivisionConfig}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No divisions yet — add one from the tournament detail page.
            </p>
          )}
        </div>

        {/* Visibility toggles */}
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="t-public">Public scoreboard</Label>
              <p className="text-xs text-muted-foreground">
                Allow a no-login public view.
              </p>
            </div>
            <Switch
              id="t-public"
              checked={form.is_public}
              onCheckedChange={(v) => set('is_public', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="t-external">Allow external teams</Label>
              <p className="text-xs text-muted-foreground">
                Non-JKKN teams/players can register.
              </p>
            </div>
            <Switch
              id="t-external"
              checked={form.allow_external_registration}
              onCheckedChange={(v) => set('allow_external_registration', v)}
            />
          </div>
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
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={isPending || !form.name.trim()}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
