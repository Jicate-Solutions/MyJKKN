'use client';

// app/(routes)/meetings/series/_components/series-manager.tsx
//
// The EAO's screen for defining a recurring meeting series — piece 1 of the
// Monthly Slate spec. Create, name, edit and list a series with its cadence,
// preferred slot, duration, whether it may be held online, its coverage and
// recorded exceptions, and the few named people who must be free for it.
//
// Configuration only. Nothing on this screen proposes a month, books a meeting
// or approves anything — those are pieces 3 and 4 and are deliberately absent.
//
// Mobile-first: the form is a single column that only becomes two at sm, and
// every control is full-width at 390px. Semantic tokens throughout so the page
// reads correctly in the shipped light theme and in dark.

import { useMemo, useState, useTransition } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  CalendarClock,
  ChevronDown,
  Loader2,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  CADENCE_OPTIONS,
  WEEKDAY_OPTIONS,
  cadenceLabel,
  hhmmToMinutes,
  minutesToHHmm,
  resolveCoveredInstitutions,
  weekdayLabel,
  type CoverageMode,
  type SeriesCadence,
} from '@/lib/services/meetings/recurring-series-config';

import {
  createSeries,
  deleteSeries,
  listSeries,
  searchSeriesPeople,
  setSeriesAttendees,
  setSeriesUnits,
  updateSeries,
  type InstitutionOption,
  type RecurringSeries,
  type SeriesAttendee,
  type SeriesPersonOption,
  type SeriesUnit,
} from '../actions';

interface FormState {
  name: string;
  description: string;
  cadence: SeriesCadence;
  preferredWeekday: string; // '' = any
  preferredTime: string; // 'HH:mm' or ''
  durationMin: string;
  mayBeOnline: boolean;
  coverageMode: CoverageMode;
  priority: string;
  isActive: boolean;
  excludedIds: string[];
  includedIds: string[];
  attendees: SeriesAttendee[];
}

const BLANK: FormState = {
  name: '',
  description: '',
  cadence: 'monthly',
  preferredWeekday: '',
  preferredTime: '',
  durationMin: '60',
  mayBeOnline: true,
  coverageMode: 'all_institutions',
  priority: '100',
  isActive: true,
  excludedIds: [],
  includedIds: [],
  attendees: [],
};

function toForm(s: RecurringSeries): FormState {
  return {
    name: s.name,
    description: s.description ?? '',
    cadence: s.cadence,
    preferredWeekday: s.preferredWeekday === null ? '' : String(s.preferredWeekday),
    preferredTime: minutesToHHmm(s.preferredStartMinute),
    durationMin: String(s.durationMin),
    mayBeOnline: s.mayBeOnline,
    coverageMode: s.coverageMode,
    priority: String(s.priority),
    isActive: s.isActive,
    excludedIds: s.units.filter((u) => u.isExcluded).map((u) => u.institutionId),
    includedIds: s.units.filter((u) => !u.isExcluded).map((u) => u.institutionId),
    attendees: s.attendees,
  };
}

/**
 * Say what deleting a series actually destroys, in plain words.
 *
 * The counts come off the row itself — a RecurringSeries already carries its
 * units and attendees — so warning costs no extra round-trip.
 */
export function describeWhatIsLost(s: RecurringSeries | null): string {
  if (!s) return '';
  const units = s.units?.length ?? 0;
  const people = s.attendees?.length ?? 0;
  const parts: string[] = [];
  if (units > 0) parts.push(`${units} college${units === 1 ? '' : 's'}`);
  if (people > 0) parts.push(`${people} required ${people === 1 ? 'person' : 'people'}`);
  if (parts.length === 0) {
    return 'Nothing else is attached to it yet.';
  }
  return `It carries ${parts.join(' and ')}, which go with it.`;
}

export function SeriesManager({
  initialSeries,
  institutions,
}: {
  initialSeries: RecurringSeries[];
  institutions: InstitutionOption[];
}) {
  const [series, setSeries] = useState<RecurringSeries[]>(initialSeries);
  /**
   * The series queued for deletion. Deleting used to happen on the first click
   * with nothing in between — one tap and the configuration was gone, with no
   * undo. The rest of this module already warns first (deleting a set of
   * working hours names how many meeting kinds use it), so this matches it.
   *
   * No extra round-trip is needed to say what is lost: a row already carries
   * its own units and attendees.
   */
  const [pendingDelete, setPendingDelete] = useState<RecurringSeries | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK);
  const [isSaving, startSave] = useTransition();

  const institutionName = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of institutions) map.set(i.id, i.name);
    return map;
  }, [institutions]);

  const open = creating || editingId !== null;

  function beginCreate() {
    setEditingId(null);
    setForm(BLANK);
    setCreating(true);
  }

  function beginEdit(s: RecurringSeries) {
    setCreating(false);
    setForm(toForm(s));
    setEditingId(s.id);
  }

  function close() {
    setCreating(false);
    setEditingId(null);
    setForm(BLANK);
  }

  async function reload() {
    const result = await listSeries();
    if (result.success && result.data) setSeries(result.data);
  }

  function save() {
    const durationMin = Number(form.durationMin);
    const priority = Number(form.priority);
    if (!Number.isFinite(durationMin) || !Number.isFinite(priority)) {
      toast.error('Duration and priority must be numbers.');
      return;
    }

    const payload = {
      name: form.name,
      description: form.description,
      cadence: form.cadence,
      preferredWeekday: form.preferredWeekday === '' ? null : Number(form.preferredWeekday),
      preferredStartMinute: hhmmToMinutes(form.preferredTime),
      durationMin,
      mayBeOnline: form.mayBeOnline,
      coverageMode: form.coverageMode,
      priority,
      isActive: form.isActive,
    };

    const units: SeriesUnit[] =
      form.coverageMode === 'all_institutions'
        ? form.excludedIds.map((id) => ({
            institutionId: id,
            isExcluded: true,
            exclusionReason: null,
          }))
        : form.includedIds.map((id) => ({
            institutionId: id,
            isExcluded: false,
            exclusionReason: null,
          }));

    const attendees = form.attendees.map((a) => ({
      profileId: a.profileId,
      isRequired: a.isRequired,
    }));

    startSave(async () => {
      const result = editingId
        ? await updateSeries(editingId, payload)
        : await createSeries(payload);
      if (!result.success || !result.data) {
        toast.error(result.error ?? 'Could not save the series.');
        return;
      }
      const id = result.data.id;

      const unitsResult = await setSeriesUnits(id, units);
      if (!unitsResult.success) {
        toast.error(unitsResult.error ?? 'Saved, but the coverage list did not save.');
      }
      const peopleResult = await setSeriesAttendees(id, attendees);
      if (!peopleResult.success) {
        toast.error(peopleResult.error ?? 'Saved, but the people list did not save.');
      }

      toast.success(editingId ? 'Series updated.' : 'Series created.');
      close();
      await reload();
    });
  }

  function remove(s: RecurringSeries) {
    startSave(async () => {
      const result = await deleteSeries(s.id);
      if (!result.success) {
        toast.error(result.error ?? 'Could not delete the series.');
        return;
      }
      toast.success(`"${s.name}" deleted.`);
      if (editingId === s.id) close();
      await reload();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-base">Recurring series</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Define each recurring meeting once. Nothing here books anything — this is the
              list the month is proposed from.
            </p>
          </div>
          {!open && (
            <Button size="sm" onClick={beginCreate} className="shrink-0">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              New
            </Button>
          )}
        </CardHeader>

        {open && (
          <CardContent className="border-t border-border pt-4">
            <SeriesForm
              form={form}
              setForm={setForm}
              institutions={institutions}
              isSaving={isSaving}
              onCancel={close}
              onSave={save}
              heading={editingId ? 'Edit series' : 'New series'}
            />
          </CardContent>
        )}
      </Card>

      {series.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CalendarClock className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <h3 className="text-sm font-medium">No recurring series yet</h3>
            <p className="max-w-sm text-xs text-muted-foreground">
              Add the meetings that repeat — IQAC, the fortnightly and monthly reviews, the
              weekly series. Each one is defined once here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {series.map((s) => {
            const coverage = resolveCoveredInstitutions({
              coverageMode: s.coverageMode,
              allInstitutionIds: institutions.map((i) => i.id),
              units: s.units,
            });
            return (
              <Card key={s.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">{s.name}</h3>
                      {s.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {s.description}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => beginEdit(s)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(s)}
                        disabled={isSaving}
                        aria-label={`Delete ${s.name}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{cadenceLabel(s.cadence)}</Badge>
                    <Badge variant="outline">{weekdayLabel(s.preferredWeekday)}</Badge>
                    {s.preferredStartMinute !== null && (
                      <Badge variant="outline">{minutesToHHmm(s.preferredStartMinute)}</Badge>
                    )}
                    <Badge variant="outline">{s.durationMin} min</Badge>
                    {s.mayBeOnline && <Badge variant="outline">May go online</Badge>}
                    {!s.isActive && <Badge variant="destructive">Paused</Badge>}
                  </div>

                  <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="font-medium text-muted-foreground">Covers</dt>
                      <dd className="mt-0.5">
                        {coverage.covered.length} of {institutions.length} colleges
                        {coverage.excluded.length > 0 && (
                          <span className="text-muted-foreground">
                            {' '}
                            · {coverage.excluded.length} excepted
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-muted-foreground">Must be free</dt>
                      <dd className="mt-0.5">
                        {s.hostName ?? 'Host'}
                        {s.attendees.filter((a) => a.isRequired).length > 0 &&
                          ` + ${s.attendees.filter((a) => a.isRequired).length} named`}
                      </dd>
                    </div>
                  </dl>

                  {coverage.excluded.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Not held for:{' '}
                      {coverage.excluded
                        .map((id) => institutionName.get(id) ?? 'Unknown')
                        .join(', ')}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “{pendingDelete?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {describeWhatIsLost(pendingDelete)} This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSaving}
              onClick={() => {
                const target = pendingDelete;
                setPendingDelete(null);
                if (target) remove(target);
              }}
            >
              Delete series
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

function SeriesForm({
  form,
  setForm,
  institutions,
  isSaving,
  onCancel,
  onSave,
  heading,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
  institutions: InstitutionOption[];
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
  heading: string;
}) {
  const [showCoverage, setShowCoverage] = useState(false);
  const patch = (next: Partial<FormState>) => setForm({ ...form, ...next });

  const listKey = form.coverageMode === 'all_institutions' ? 'excludedIds' : 'includedIds';
  const selected = form.coverageMode === 'all_institutions' ? form.excludedIds : form.includedIds;

  function toggleUnit(id: string) {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    patch({ [listKey]: next } as Partial<FormState>);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{heading}</h3>
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Close the form">
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="series-name">Name</Label>
        <Input
          id="series-name"
          value={form.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Monthly IQAC review"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="series-description">What it is for (optional)</Label>
        <Textarea
          id="series-description"
          rows={2}
          value={form.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="Reviews the college's IQAC actions for the month."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="series-cadence">How often it repeats</Label>
          <Select
            value={form.cadence}
            onValueChange={(v) => patch({ cadence: v as SeriesCadence })}
          >
            <SelectTrigger id="series-cadence">
              <SelectValue placeholder="Pick a frequency" />
            </SelectTrigger>
            <SelectContent>
              {CADENCE_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            About{' '}
            {CADENCE_OPTIONS.find((c) => c.value === form.cadence)?.approxPerYear ?? 12} a year
            per college.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="series-weekday">Preferred day</Label>
          <Select
            value={form.preferredWeekday === '' ? 'any' : form.preferredWeekday}
            onValueChange={(v) => patch({ preferredWeekday: v === 'any' ? '' : v })}
          >
            <SelectTrigger id="series-weekday">
              <SelectValue placeholder="Any day" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any day</SelectItem>
              {WEEKDAY_OPTIONS.map((d) => (
                <SelectItem key={d.value} value={String(d.value)}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="series-time">Preferred start time</Label>
          <Input
            id="series-time"
            type="time"
            value={form.preferredTime}
            onChange={(e) => patch({ preferredTime: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="series-duration">How long it runs (minutes)</Label>
          <Input
            id="series-duration"
            type="number"
            min={5}
            max={1440}
            value={form.durationMin}
            onChange={(e) => patch({ durationMin: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="series-priority">Priority when two want the same slot</Label>
          <Input
            id="series-priority"
            type="number"
            min={1}
            max={1000}
            value={form.priority}
            onChange={(e) => patch({ priority: e.target.value })}
          />
          <p className="text-[11px] text-muted-foreground">Lower goes first. Default 100.</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div className="min-w-0">
          <Label htmlFor="series-online" className="text-sm">
            May be held online
          </Label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            When the host is travelling this series becomes an online meeting instead of
            slipping. Travel never blocks a week.
          </p>
        </div>
        <Switch
          id="series-online"
          checked={form.mayBeOnline}
          onCheckedChange={(v) => patch({ mayBeOnline: v })}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div className="min-w-0">
          <Label htmlFor="series-active" className="text-sm">
            Active
          </Label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            A paused series stays configured but is skipped.
          </p>
        </div>
        <Switch
          id="series-active"
          checked={form.isActive}
          onCheckedChange={(v) => patch({ isActive: v })}
        />
      </div>

      {/* Coverage */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setShowCoverage((v) => !v)}
          className="flex w-full items-center justify-between gap-2 p-3 text-left"
          aria-expanded={showCoverage}
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">Which colleges it covers</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              {form.coverageMode === 'all_institutions'
                ? `Every college except ${form.excludedIds.length} exception${
                    form.excludedIds.length === 1 ? '' : 's'
                  }`
                : `${form.includedIds.length} college${
                    form.includedIds.length === 1 ? '' : 's'
                  } listed`}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${showCoverage ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>

        {showCoverage && (
          <div className="space-y-3 border-t border-border p-3">
            <Select
              value={form.coverageMode}
              onValueChange={(v) => patch({ coverageMode: v as CoverageMode })}
            >
              <SelectTrigger aria-label="Coverage mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_institutions">
                  Every college, with exceptions
                </SelectItem>
                <SelectItem value="listed_only">Only the colleges I pick</SelectItem>
              </SelectContent>
            </Select>

            <p className="text-[11px] text-muted-foreground">
              {form.coverageMode === 'all_institutions'
                ? 'Tick the colleges this series is NOT held for. Recorded once and honoured every cycle.'
                : 'Tick the colleges this series IS held for.'}
            </p>

            <ul className="space-y-1">
              {institutions.map((i) => {
                const on = selected.includes(i.id);
                return (
                  <li key={i.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleUnit(i.id)}
                        className="h-4 w-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0 truncate">{i.name}</span>
                    </label>
                  </li>
                );
              })}
              {institutions.length === 0 && (
                <li className="px-2 py-1.5 text-xs text-muted-foreground">
                  No active colleges found.
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      <AttendeePicker
        attendees={form.attendees}
        onChange={(next) => patch({ attendees: next })}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel} disabled={isSaving} className="sm:w-auto">
          Cancel
        </Button>
        <Button onClick={onSave} disabled={isSaving} className="sm:w-auto">
          {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
          Save series
        </Button>
      </div>
    </div>
  );
}

function AttendeePicker({
  attendees,
  onChange,
}: {
  attendees: SeriesAttendee[];
  onChange: (next: SeriesAttendee[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SeriesPersonOption[]>([]);
  const [isSearching, startSearch] = useTransition();

  function search() {
    const term = query.trim();
    if (term.length < 2) {
      toast.error('Type at least two letters to search.');
      return;
    }
    startSearch(async () => {
      const result = await searchSeriesPeople(term);
      if (!result.success) {
        toast.error(result.error ?? 'Could not search people.');
        return;
      }
      setResults(result.data ?? []);
    });
  }

  function add(p: SeriesPersonOption) {
    if (attendees.some((a) => a.profileId === p.profileId)) return;
    onChange([
      ...attendees,
      { profileId: p.profileId, name: p.name, email: p.email, isRequired: true },
    ]);
    setResults([]);
    setQuery('');
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium">Who must be free</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            The host is always required. Add the few named people this particular series
            cannot happen without.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Search by name or email"
          aria-label="Search people"
        />
        <Button
          type="button"
          variant="outline"
          onClick={search}
          disabled={isSearching}
          className="shrink-0"
        >
          {isSearching ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            'Search'
          )}
        </Button>
      </div>

      {results.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-1">
          {results.map((p) => (
            <li key={p.profileId}>
              <button
                type="button"
                onClick={() => add(p)}
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {p.subtitle ? `${p.subtitle} · ` : ''}
                  {p.email}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {attendees.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nobody added yet — only the host&apos;s calendar will be checked.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {attendees.map((a) => (
            <li
              key={a.profileId}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm">{a.name}</span>
                {a.email && (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {a.email}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={a.isRequired}
                    onChange={() =>
                      onChange(
                        attendees.map((x) =>
                          x.profileId === a.profileId
                            ? { ...x, isRequired: !x.isRequired }
                            : x,
                        ),
                      )
                    }
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  Required
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange(attendees.filter((x) => x.profileId !== a.profileId))
                  }
                  aria-label={`Remove ${a.name}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
