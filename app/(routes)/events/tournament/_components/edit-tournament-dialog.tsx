'use client';

// Sports Tournaments — edit dialog with full create-form parity: event fields
// (host institution, name, scope, dates, registration window, venue,
// public/external toggles, description) plus the division fields set at
// creation (sport, level, format, category, age band). Divisions load via
// useTournament(id); when several exist a picker chooses which one to edit,
// and when NONE exist the same fields seed the first division inline on save
// (a create-form division can fail best-effort, leaving a division-less row).
// "Add sport" creates a further division immediately (BUG-004567 — the old
// per-division add UI was removed 2026-07-28, leaving no way to add Carrom to a
// running tournament); it copies the shown division's shared settings, the way
// the create form applies one set of settings to every sport picked.
// Entries/fixtures stay on the detail page. The inner form is keyed by
// tournament id so it remounts with fresh initial state per tournament (no
// setState-in-effect re-seeding).

import { useState } from 'react';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Event, ParticipantOrgType } from '@/types/events';
import { JKKN_SPORTS, SPORT_LEVELS } from '@/types/health-sports';
import {
  TOURNAMENT_FORMATS,
  DIVISION_GENDERS,
  divisionPlayType,
  isTeamDivision,
  supportsDoubles,
} from '@/types/tournament';
import { HEAT_SPORTS } from '@/types/tournament';
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
  useDeleteDivision,
} from '@/hooks/events/use-tournaments';
import { useTournamentEntries } from '@/hooks/events/use-tournament-registrations';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { HostInstitutionsPicker, hostInstitutionsDto } from './host-institutions-picker';
import { NaacCriteriaField } from '@/components/events/shared/naac-criteria-field';

/** ISO timestamp / date string → yyyy-MM-dd for <input type="date">. */
const toDateInput = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

/**
 * Identity of a division for duplicate checks: sport + category + age band.
 * A missing category counts as 'open' (the default every form writes).
 */
const divisionKey = (
  sport: string,
  gender: string | null | undefined,
  ageBand: string | null | undefined
) =>
  [
    sport.trim().toLowerCase(),
    (gender || 'open').trim().toLowerCase(),
    (ageBand ?? '').trim().toLowerCase(),
  ].join('|');

/** Categories offered as one-click variant chips for the shown division's sport. */
const VARIANT_GENDERS = ['male', 'female', 'mixed'] as const;

/**
 * Category label for a division. School tournaments read "Boys / Girls"
 * rather than the college "Men's / Women's".
 */
const categoryLabel = (gender: string | null | undefined, schoolWording: boolean) => {
  const g = gender || 'open';
  if (schoolWording && g === 'male') return 'Boys';
  if (schoolWording && g === 'female') return 'Girls';
  return DIVISION_GENDERS.find((x) => x.value === g)?.label ?? g;
};

/** "Girls", "Mixed Doubles", "Men's Doubles" — the category plus a doubles suffix. */
const variantLabel = (
  d: { sport: string; gender: string | null | undefined; config?: Record<string, unknown> | null },
  schoolWording: boolean
) => {
  const base = categoryLabel(d.gender, schoolWording);
  return supportsDoubles(d.sport) && isTeamDivision(d) ? `${base} Doubles` : base;
};

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

  // Fee and play type both live in config — merge onto the pending edits so
  // touching one doesn't drop the other.
  const currentConfig = (edits.config ?? division.config ?? {}) as Record<string, unknown>;
  const currentFee = Number((currentConfig as { entry_fee?: number }).entry_fee ?? 0);
  const playType = isTeamDivision({ sport, config: currentConfig }) ? 'doubles' : 'singles';

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

      {supportsDoubles(sport) && (
        <div className="space-y-1.5">
          <Label>Play type</Label>
          <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label="Play type">
            {(['singles', 'doubles'] as const).map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                role="radio"
                aria-checked={playType === p}
                variant={playType === p ? 'default' : 'ghost'}
                className="h-7 px-4"
                onClick={() => onEditConfig({ ...currentConfig, play_type: p })}
              >
                {p === 'singles' ? 'Singles' : 'Doubles'}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {playType === 'doubles'
              ? 'Each entry is a pair — the registration form asks for both players.'
              : 'Each entry is one player.'}
          </p>
        </div>
      )}

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
              ...currentConfig,
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
  const deleteDivision = useDeleteDivision();
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();
  // Divisions aren't on the list row — fetch the full tournament for them.
  const { data: detail, isLoading: divisionsLoading } = useTournament(tournament.id);
  const divisions = detail?.divisions ?? [];
  // Entries/fixtures cascade-delete with their division, so a division that
  // already has entries can't be removed here.
  const { data: entries, isLoading: entriesLoading } = useTournamentEntries(tournament.id);

  // Director decision (2026-09-07): an event's college may still be changed
  // while it is a DRAFT, and is fixed once it leaves draft. Before publication
  // the institutional number cannot have reached a circular, a brochure or
  // minutes, which is the only thing the freeze exists to protect. Moving a
  // draft RE-ISSUES the number from the destination college.
  //
  // Past draft the database (trg_events_stamp_event_number) raises 23514, so the
  // control is disabled rather than left to fail a save and discard every other
  // edit made in the same dialog. Events are fetched with select('*')
  // (EventBaseService.getEvents / getEvent), so status and event_number are both
  // present on the row.
  const issuedNumber = tournament.event_number ?? null;
  const collegeLocked = tournament.status !== 'draft';

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
    // Full host list, primary included. A single-host event stores none.
    host_ids: (tournament.host_institution_ids?.length
      ? tournament.host_institution_ids
      : tournament.institution_id
        ? [tournament.institution_id]
        : []) as string[],
    description: tournament.description ?? '',
    scope: (tournament.scope === 'all_jkkn' ? 'all_jkkn' : 'institution') as TournamentScope,
    start_date: toDateInput(tournament.start_date),
    end_date: toDateInput(tournament.end_date),
    registration_open_date: toDateInput(tournament.registration_open_date),
    registration_close_date: toDateInput(tournament.registration_close_date),
    venue: tournament.venue ?? '',
    is_public: tournament.is_public ?? false,
    allow_external_registration: tournament.allow_external_registration ?? false,
    participant_org_type: (tournament.participant_org_type === 'college' ||
    tournament.participant_org_type === 'both'
      ? tournament.participant_org_type
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
    update.isPending ||
    updateDivision.isPending ||
    createDivision.isPending ||
    deleteDivision.isPending;

  // Remove the shown division — two-step inline confirm (no nested AlertDialog
  // inside this Dialog). Blocked when it is the last one or has entries.
  // Holds the division id being confirmed, so switching divisions drops it.
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const confirmRemove = !!selectedDivision && confirmRemoveId === selectedDivision.id;
  const selectedEntryCount = selectedDivision
    ? (entries ?? []).filter((e) => e.division_id === selectedDivision.id).length
    : 0;
  const removeBlockedReason =
    divisions.length <= 1
      ? 'A tournament needs at least one division.'
      : entriesLoading
        ? 'Checking entries…'
        : selectedEntryCount > 0
          ? `It has ${selectedEntryCount} ${selectedEntryCount === 1 ? 'entry' : 'entries'}, so it can't be removed.`
          : null;

  const removeSelectedDivision = async () => {
    if (!selectedDivision || removeBlockedReason) return;
    try {
      await deleteDivision.mutateAsync({ id: selectedDivision.id, eventId: tournament.id });
      setSelectedDivisionId(null);
      setDivisionEdits({});
    } catch {
      // handled by mutation toast
    } finally {
      setConfirmRemoveId(null);
    }
  };

  // "Add sport" — a further division, created straight away (not on Save).
  // Category defaults to the shown division's; age band, level, format and
  // entry fee are copied from it. Sports that would duplicate an existing
  // sport + category + age band are left out of the picker.
  const [addSport, setAddSport] = useState('');
  const [addGenderOverride, setAddGenderOverride] = useState<string | null>(null);
  const addGender = addGenderOverride ?? (selectedDivision?.gender || 'open');
  const addAgeBand = selectedDivision?.age_band?.trim() || '';
  const existingDivisionKeys = new Set(
    divisions.map((d) => divisionKey(d.sport, d.gender, d.age_band))
  );
  const addableSports: string[] = JKKN_SPORTS.filter(
    (s) => !existingDivisionKeys.has(divisionKey(s, addGender, addAgeBand))
  );
  const addSportValue = addableSports.includes(addSport) ? addSport : '';

  // Creates a division copying the shown one's age band, level, format and
  // entry fee. Returns false when the create failed (the mutation toasts).
  // For a doubles-capable sport, Mixed is created as doubles and Boys/Girls as
  // singles — the usual carrom/badminton line-up; the Play type toggle changes it.
  const createFromSelected = async (sport: string, gender: string) => {
    if (!selectedDivision) return false;
    const templateFee = Number(
      (selectedDivision.config as { entry_fee?: number } | undefined)?.entry_fee ?? 0
    );
    const config: Record<string, unknown> = templateFee > 0 ? { entry_fee: templateFee } : {};
    if (supportsDoubles(sport)) config.play_type = gender === 'mixed' ? 'doubles' : 'singles';
    try {
      const created = await createDivision.mutateAsync({
        eventId: tournament.id,
        dto: {
          sport,
          gender,
          age_band: selectedDivision.age_band?.trim() || undefined,
          // Heat sports always run as heats; a heats template never leaks into a 1-vs-1 sport.
          format: HEAT_SPORTS.includes(sport)
            ? 'heats'
            : selectedDivision.format && selectedDivision.format !== 'heats'
              ? selectedDivision.format
              : 'knockout',
          level: selectedDivision.level ?? 'intra_college',
          config,
          sort_order: Math.max(0, ...divisions.map((d) => d.sort_order ?? 0)) + 1,
        },
      });
      // Show the new division for tweaking — unless that would throw away
      // unsaved edits to the current one (switching divisions resets them).
      if (Object.keys(divisionEdits).length === 0) setSelectedDivisionId(created.id);
      return true;
    } catch {
      return false;
    }
  };

  const addDivision = async () => {
    if (!addSportValue) return;
    if (await createFromSelected(addSportValue, addGender)) {
      setAddSport('');
      setAddGenderOverride(null);
    }
  };

  // Division picker grouped by sport (Carrom → Boys · U18, Girls · U18, …).
  const schoolWording = form.participant_org_type === 'school';
  const divisionGroups = divisions.reduce<{ sport: string; items: TournamentDivision[] }[]>(
    (groups, d) => {
      const group = groups.find((g) => g.sport === d.sport);
      if (group) group.items.push(d);
      else groups.push({ sport: d.sport, items: [d] });
      return groups;
    },
    []
  );
  const divisionItemLabel = (d: TournamentDivision) =>
    [variantLabel(d, schoolWording), d.age_band?.trim()].filter(Boolean).join(' · ');
  // Chip label for a category that may not exist yet (Mixed → Mixed Doubles).
  const chipLabel = (gender: string) => {
    const existing = variantDivision(gender);
    if (existing) return variantLabel(existing, schoolWording);
    const base = categoryLabel(gender, schoolWording);
    return selectedDivision && supportsDoubles(selectedDivision.sport) && gender === 'mixed'
      ? `${base} Doubles`
      : base;
  };

  // Category variants of the shown division's sport + age band: existing ones
  // switch to that division, missing ones create it in one click.
  const variantGenders: string[] = selectedDivision && supportsDoubles(selectedDivision.sport)
    ? Array.from(
        new Set<string>([
          ...divisions
            .filter(
              (d) =>
                divisionKey(d.sport, 'open', d.age_band) ===
                divisionKey(selectedDivision.sport, 'open', selectedDivision.age_band)
            )
            .map((d) => d.gender || 'open'),
          ...VARIANT_GENDERS,
        ])
      )
    : [];
  const variantDivision = (gender: string) =>
    selectedDivision
      ? divisions.find(
          (d) =>
            divisionKey(d.sport, d.gender, d.age_band) ===
            divisionKey(selectedDivision.sport, gender, selectedDivision.age_band)
        )
      : undefined;

  const submit = async () => {
    if (!form.name.trim() || !form.institution_id) return;
    try {
      await update.mutateAsync({
        id: tournament.id,
        dto: {
          name: form.name.trim(),
          ...hostInstitutionsDto(
            { primaryId: form.institution_id, hostIds: form.host_ids },
            !!tournament.host_institution_ids?.length
          ),
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
          <HostInstitutionsPicker
            id="t-institution"
            institutions={institutions}
            loading={institutionsLoading}
            value={{ primaryId: form.institution_id, hostIds: form.host_ids }}
            onChange={(v) =>
              setForm((prev) => ({ ...prev, institution_id: v.primaryId, host_ids: v.hostIds }))
            }
            primaryLocked={collegeLocked}
            hideSingleHostHint
          />
          <p className="text-xs text-muted-foreground">
            {collegeLocked ? (
              <>
                This tournament has left draft, so its college is fixed
                {issuedNumber !== null ? (
                  <>
                    {' '}— institutional number{' '}
                    <span className="font-medium">{issuedNumber}</span> is already in circulation
                  </>
                ) : null}
                . If it genuinely has to move, ask a system administrator: it needs a database
                change, not a form.
              </>
            ) : issuedNumber !== null ? (
              <>
                Still a draft, so the college can be changed. Moving it retires number{' '}
                <span className="font-medium">{issuedNumber}</span> and issues a new one from the
                destination college. Registration fees settle into this institution&apos;s payment
                account.
              </>
            ) : (
              <>
                Registration fees for this tournament settle into this institution&apos;s payment
                account.
              </>
            )}
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
              <SelectItem value="both">Both schools and colleges</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Sets what external entrants are asked on the public registration form:
            Schools shows &ldquo;School / club&rdquo; with the school-directory picker;
            Colleges shows &ldquo;College&rdquo; as free text; Both lets each entrant
            choose school or college first.
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
                  <SelectValue>
                    {selectedDivision.sport} — {divisionItemLabel(selectedDivision)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {divisionGroups.map((g) => (
                    <SelectGroup key={g.sport}>
                      <SelectLabel>{g.sport}</SelectLabel>
                      {g.items.map((d) => (
                        <SelectItem key={d.id} value={d.id} className="pl-6">
                          {divisionItemLabel(d)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Boys / Girls / Mixed Doubles chips — only for doubles sports
              (Carrom, Badminton, …); Chess and the rest stay a single division. */}
          {!divisionsLoading && selectedDivision && supportsDoubles(selectedDivision.sport) && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                {selectedDivision.sport}
                {selectedDivision.age_band?.trim() ? ` ${selectedDivision.age_band.trim()}` : ''}{' '}
                categories — tap a missing one to add it.
              </p>
              <div className="flex flex-wrap gap-2">
                {variantGenders.map((g) => {
                  const existing = variantDivision(g);
                  const active = existing?.id === selectedDivision.id;
                  return (
                    <Button
                      key={g}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : existing ? 'secondary' : 'outline'}
                      className={existing ? 'h-7' : 'h-7 border-dashed'}
                      disabled={isPending || active}
                      onClick={() => {
                        if (existing) {
                          setSelectedDivisionId(existing.id);
                          setDivisionEdits({});
                        } else {
                          void createFromSelected(selectedDivision.sport, g);
                        }
                      }}
                    >
                      {existing ? (
                        <Check className="mr-1 h-3.5 w-3.5" />
                      ) : (
                        <Plus className="mr-1 h-3.5 w-3.5" />
                      )}
                      {chipLabel(g)}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
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

          {!divisionsLoading && selectedDivision && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {removeBlockedReason ??
                  (confirmRemove
                    ? `Remove ${selectedDivision.sport} — ${divisionItemLabel(selectedDivision)}?`
                    : '')}
              </p>
              {confirmRemove ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmRemoveId(null)}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={removeSelectedDivision}
                    disabled={isPending || !!removeBlockedReason}
                  >
                    {deleteDivision.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    Yes, remove
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmRemoveId(selectedDivision.id)}
                  disabled={isPending || !!removeBlockedReason}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remove division
                </Button>
              )}
            </div>
          )}

          {!divisionsLoading && selectedDivision && (
            <div className="space-y-2 border-t pt-4">
              <Label className="text-sm font-semibold">Add sport</Label>
              <p className="text-xs text-muted-foreground">
                Adds a new division right away, copying the age band, level, format and entry fee
                of the division above. Pick it in the division list to change those afterwards.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={addSportValue} onValueChange={setAddSport}>
                  <SelectTrigger className="sm:flex-1" aria-label="Sport to add">
                    <SelectValue
                      placeholder={
                        addableSports.length > 0 ? 'Select sport' : 'Every sport already added'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {addableSports.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={addGender} onValueChange={setAddGenderOverride}>
                  <SelectTrigger className="sm:w-36" aria-label="Category of the sport to add">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIVISION_GENDERS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {categoryLabel(g.value, schoolWording)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addDivision}
                  disabled={isPending || !addSportValue}
                >
                  {createDivision.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Add
                </Button>
              </div>
            </div>
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
          <DialogDescription className="sr-only">
            Edit the tournament details, its divisions, and add a sport.
          </DialogDescription>
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
