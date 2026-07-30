'use client';

// Sports Tournaments — edit dialog with full create-form parity: event fields
// (host institution, name, scope, dates, registration window, venue,
// public/external toggles, description) plus the division fields set at
// creation (sport, level, format, category, age band). Divisions load via
// useTournament(id); when several exist a picker chooses which one to edit,
// and when NONE exist the same fields seed the first division inline on save
// (a create-form division can fail best-effort, leaving a division-less row).
// Entries/fixtures stay on the detail page. The inner form is keyed by
// tournament id so it remounts with fresh initial state per tournament (no
// setState-in-effect re-seeding).

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
import type { Event, ParticipantOrgType } from '@/types/events';
import { JKKN_SPORTS, SPORT_LEVELS } from '@/types/health-sports';
import { TOURNAMENT_FORMATS, DIVISION_GENDERS } from '@/types/tournament';
import type {
  TournamentDivision,
  TournamentScope,
  UpdateDivisionDto,
  CreateDivisionDto,
} from '@/types/tournament';
import {
  useTournament,
  useUpdateTournament,
  useUpdateDivision,
  useCreateDivision,
} from '@/hooks/events/use-tournaments';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { NaacCriteriaField } from '@/components/events/shared/naac-criteria-field';

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
  const createDivision = useCreateDivision();
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();
  // Divisions aren't on the list row — fetch the full tournament for them.
  const { data: detail, isLoading: divisionsLoading } = useTournament(tournament.id);
  const divisions = detail?.divisions ?? [];

  // Defaults for the first division when a tournament has none yet — mirror the
  // create form so saving the edit modal seeds a valid division inline.
  const newDivisionDefaults: TournamentDivision = {
    id: '',
    event_id: tournament.id,
    sport: JKKN_SPORTS[0],
    gender: 'open',
    age_band: null,
    format: 'knockout',
    level: 'intra_college',
    max_teams: null,
    eligibility: {},
    config: {},
    sort_order: 0,
    is_active: true,
    created_at: '',
    updated_at: '',
  };

  const [form, setForm] = useState({
    name: tournament.name ?? '',
    institution_id: tournament.institution_id ?? '',
    description: tournament.description ?? '',
    scope: (tournament.scope === 'all_jkkn' ? 'all_jkkn' : 'institution') as TournamentScope,
    start_date: toDateInput(tournament.start_date),
    end_date: toDateInput(tournament.end_date),
    registration_open_date: toDateInput(tournament.registration_open_date),
    registration_close_date: toDateInput(tournament.registration_close_date),
    venue: tournament.venue ?? '',
    is_public: tournament.is_public ?? false,
    allow_external_registration: tournament.allow_external_registration ?? false,
    participant_org_type: (tournament.participant_org_type === 'college'
      ? 'college'
      : 'school') as ParticipantOrgType,
    // NAAC evidence tags — the writer for the events → evidence-spine
    // emitter (naac_criteria text[] on events; empty array = untagged).
    naac_criteria: tournament.naac_criteria ?? [],
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

  const isPending =
    update.isPending || updateDivision.isPending || createDivision.isPending;

  const submit = async () => {
    if (!form.name.trim() || !form.institution_id) return;
    try {
      await update.mutateAsync({
        id: tournament.id,
        dto: {
          name: form.name.trim(),
          institution_id: form.institution_id,
          description: form.description || undefined,
          scope: form.scope,
          start_date: form.start_date || undefined,
          end_date: form.end_date || undefined,
          registration_open_date: form.registration_open_date || undefined,
          registration_close_date: form.registration_close_date || undefined,
          venue: form.venue.trim() || undefined,
          is_public: form.is_public,
          allow_external_registration: form.allow_external_registration,
          participant_org_type: form.participant_org_type,
          naac_criteria: form.naac_criteria,
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
      } else if (divisions.length === 0) {
        // No division exists yet — seed the first one inline (parity with the
        // create form). Untouched fields fall back to the defaults shown.
        const dto: CreateDivisionDto = {
          sport: divisionEdits.sport || newDivisionDefaults.sport,
          gender: divisionEdits.gender || 'open',
          age_band: divisionEdits.age_band?.toString().trim() || undefined,
          format: divisionEdits.format || 'knockout',
          level: divisionEdits.level || 'intra_college',
          config: divisionEdits.config ?? {},
          sort_order: 0,
        };
        await createDivision.mutateAsync({ eventId: tournament.id, dto });
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
          <Label htmlFor="t-institution">
            Host Institution <span className="text-destructive">*</span>
          </Label>
          <Select value={form.institution_id} onValueChange={(v) => set('institution_id', v)}>
            <SelectTrigger id="t-institution">
              <SelectValue
                placeholder={
                  institutionsLoading ? 'Loading institutions…' : 'Select host institution'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Registration fees for this tournament settle into this institution&apos;s payment
            account.
          </p>
        </div>

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

        <div className="space-y-1.5">
          <Label>Participants come from</Label>
          <Select
            value={form.participant_org_type}
            onValueChange={(v) => set('participant_org_type', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="school">Schools</SelectItem>
              <SelectItem value="college">Colleges</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Sets what external entrants are asked on the public registration form:
            Schools shows &ldquo;School / club&rdquo; with the school-directory picker;
            Colleges shows &ldquo;College&rdquo; as free text.
          </p>
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
            <Label className="text-sm font-semibold">
              {!divisionsLoading && divisions.length === 0 ? 'Division (new)' : 'Division'}
            </Label>
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
            <>
              <p className="text-xs text-muted-foreground">
                This tournament has no division yet — set these to create its first one on save.
              </p>
              <DivisionFields
                division={newDivisionDefaults}
                edits={divisionEdits}
                onEdit={setDivision}
                onEditConfig={setDivisionConfig}
              />
            </>
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

        {/* NAAC evidence tags — writes events.naac_criteria; the evidence
            emitter picks tagged events up once they complete. */}
        <NaacCriteriaField
          value={form.naac_criteria}
          onChange={(next) => setForm((prev) => ({ ...prev, naac_criteria: next }))}
          disabled={isPending}
        />

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
        <Button
          onClick={submit}
          disabled={isPending || !form.name.trim() || !form.institution_id}
        >
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
