'use client';

/**
 * File ONE tournament-permission request for a whole squad.
 *
 * Director-locked D2: one request covers the squad. The Physical Director enters
 * the tournament once and picks every participating learner. Each picked learner
 * is stored with their own learner id, name, roll number and sport, so every
 * participant stays individually recoverable later — accreditation needs
 * per-learner participation, not a headcount.
 *
 * The row's own learner_id (NOT NULL on the table) holds the first learner
 * picked, and that learner is ALSO in the roster, so nobody is reachable only
 * through the row's foreign key.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { JKKN_SPORTS, SPORT_LEVELS } from '@/types/health-sports';
import type { SportLevel } from '@/types/health-sports';
import { HealthSportsService } from '@/lib/services/health/health-sports-service';
import type {
  SquadCandidate,
  TournamentPermissionRecord,
  TournamentSquadMember,
} from '@/lib/services/health/health-sports-service';
import {
  EmptyBecauseNoDataAccess,
  isSchemaNotApplied,
  readFailure,
} from '../../_components/tournament-permission-ui';

const LEARNER_READ_KEYS = [
  'learners.profiles.view',
  'learners.view',
  'learners.admissions.view',
];

function candidateName(c: SquadCandidate): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Unnamed learner';
}

export function FileSquadDialog({
  open,
  onClose,
  filedByProfileId,
  institutionId,
  onFiled,
}: {
  open: boolean;
  onClose: () => void;
  filedByProfileId: string;
  institutionId: string | null;
  onFiled: (row: TournamentPermissionRecord) => void;
}) {
  const [tournamentName, setTournamentName] = useState('');
  // D14 — the OUTSIDE institution hosting the event. Blank means held at JKKN.
  const [hostInstitution, setHostInstitution] = useState('');
  const [level, setLevel] = useState<SportLevel | ''>('');
  const [sport, setSport] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [travelRequired, setTravelRequired] = useState(false);
  const [travelDetails, setTravelDetails] = useState('');
  const [justification, setJustification] = useState('');
  const [squad, setSquad] = useState<TournamentSquadMember[]>([]);

  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<SquadCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [searchedEmpty, setSearchedEmpty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ message: string; code: string | null } | null>(
    null
  );

  const datesValid = Boolean(startDate && endDate && endDate >= startDate);
  const complete =
    tournamentName.trim().length > 0 &&
    level !== '' &&
    sport.length > 0 &&
    datesValid &&
    squad.length > 0;

  const pickedIds = useMemo(() => new Set(squad.map((m) => m.learner_id)), [squad]);

  const runSearch = useCallback(
    async (term: string) => {
      if (term.trim().length < 2) {
        setCandidates([]);
        setSearchedEmpty(false);
        return;
      }
      setSearching(true);
      setSearchFailed(false);
      try {
        const found = await HealthSportsService.searchSquadCandidates(institutionId, term);
        setCandidates(found);
        setSearchedEmpty(found.length === 0);
      } catch {
        // A permission-shaped failure must say so, not show an empty list.
        setCandidates([]);
        setSearchFailed(true);
      } finally {
        setSearching(false);
      }
    },
    [institutionId]
  );

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void runSearch(search), 350);
    return () => clearTimeout(t);
  }, [search, open, runSearch]);

  function addMember(c: SquadCandidate) {
    if (pickedIds.has(c.id)) return;
    setSquad((prev) => [
      ...prev,
      {
        learner_id: c.id,
        name: candidateName(c),
        roll_number: c.roll_number ?? null,
        sport: sport || null,
      },
    ]);
  }

  function removeMember(learnerId: string) {
    setSquad((prev) => prev.filter((m) => m.learner_id !== learnerId));
  }

  function reset() {
    setTournamentName('');
    setHostInstitution('');
    setLevel('');
    setSport('');
    setStartDate('');
    setEndDate('');
    setTravelRequired(false);
    setTravelDetails('');
    setJustification('');
    setSquad([]);
    setSearch('');
    setCandidates([]);
    setSearchedEmpty(false);
    setSearchFailed(false);
    setFailure(null);
  }

  async function submit() {
    // `level === ''` is checked FIRST, not after `!complete`: `complete` already
    // implies it, so the reverse order makes this an impossible comparison.
    if (level === '' || !complete) return;
    setSaving(true);
    setFailure(null);
    try {
      const row = await HealthSportsService.fileSquadPermissionRequest(filedByProfileId, {
        tournament_name: tournamentName.trim(),
        host_institution: hostInstitution.trim() || null,
        tournament_level: level,
        sport,
        start_date: startDate,
        end_date: endDate,
        travel_required: travelRequired,
        travel_details: travelRequired ? travelDetails.trim() || null : null,
        justification: justification.trim() || null,
        members: squad,
      });
      toast.success(
        `Filed for ${squad.length} ${squad.length === 1 ? 'learner' : 'learners'} — awaiting the Principal.`
      );
      onFiled(row);
      reset();
      onClose();
    } catch (err) {
      // PostgREST errors are plain objects — readFailure is how the real reason
      // reaches the screen instead of a generic fallback (CLAUDE.md #27).
      setFailure(readFailure(err));
      toast.error('Request not filed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>File tournament permission for a squad</DialogTitle>
          <DialogDescription>
            One request covers everyone you list. The Principal is the only approver.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="squad-tournament">
              Tournament name *
            </Label>
            <Input
              id="squad-tournament"
              placeholder="e.g. Anna University Zonal Meet"
              value={tournamentName}
              onChange={(e) => setTournamentName(e.target.value)}
            />
          </div>

          {/* D14 — who is RUNNING the event. An accreditation reviewer asks
              which outside body hosted it, and that cannot be answered from the
              tournament name alone. Blank when we host it ourselves. */}
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="squad-host">
              Hosted by (leave blank if held at JKKN)
            </Label>
            <Input
              id="squad-host"
              placeholder="e.g. Vinayaka Missions Research Foundation, Salem"
              value={hostInstitution}
              onChange={(e) => setHostInstitution(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Sport *</Label>
              <Select value={sport} onValueChange={setSport}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {JKKN_SPORTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Level *</Label>
              <Select
                value={level}
                onValueChange={(v) => setLevel(v as SportLevel)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select" />
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="squad-start">
                Start date *
              </Label>
              <Input
                id="squad-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="squad-end">
                End date *
              </Label>
              <Input
                id="squad-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          {startDate && endDate && endDate < startDate ? (
            <p className="text-xs text-amber-600">
              The end date cannot be before the start date.
            </p>
          ) : null}

          <div className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
            <div>
              <Label className="text-xs">Travel required</Label>
              <p className="text-[11px] text-slate-400">
                Off-campus travel needs the Principal&apos;s explicit approval.
              </p>
            </div>
            <Switch checked={travelRequired} onCheckedChange={setTravelRequired} />
          </div>

          {travelRequired ? (
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="squad-travel">
                Travel details
              </Label>
              <Input
                id="squad-travel"
                placeholder="Mode, departure, return, accompanying team member"
                value={travelDetails}
                onChange={(e) => setTravelDetails(e.target.value)}
              />
            </div>
          ) : null}

          {/* ---------------- squad picker ---------------- */}
          <div className="space-y-2 rounded-lg border border-slate-100 p-3">
            <Label className="text-xs">Participating learners *</Label>

            {squad.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {squad.map((m) => (
                  <span
                    key={m.learner_id}
                    className="flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800"
                  >
                    {m.name}
                    {m.roll_number ? (
                      <span className="text-emerald-600">{m.roll_number}</span>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`Remove ${m.name}`}
                      onClick={() => removeMember(m.learner_id)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-emerald-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Nobody added yet. The first learner you add is recorded as the squad
                lead on the request.
              </p>
            )}

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                className="h-9 pl-8 text-sm"
                placeholder="Search by name or roll number (2+ characters)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {searching ? (
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Searching
              </p>
            ) : searchFailed ? (
              <EmptyBecauseNoDataAccess
                what="learner records"
                permissionKeys={LEARNER_READ_KEYS}
              />
            ) : candidates.length > 0 ? (
              <div className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-100">
                {candidates.map((c) => {
                  const already = pickedIds.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={already}
                      onClick={() => addMember(c)}
                      className="flex w-full items-center justify-between px-2.5 py-2 text-left text-xs hover:bg-slate-50 disabled:opacity-40"
                    >
                      <span className="truncate text-slate-700">{candidateName(c)}</span>
                      <span className="ml-2 shrink-0 text-slate-400">
                        {already ? 'Added' : (c.roll_number ?? '')}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : searchedEmpty ? (
              <p className="text-xs text-slate-400">
                No learner in your institution matches that. Check the spelling or the
                roll number.
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label className="text-xs" htmlFor="squad-justification">
              Justification
            </Label>
            <Textarea
              id="squad-justification"
              rows={2}
              placeholder="Why this squad should represent the institution"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </div>

          {failure ? (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-xs text-red-900">
                <span className="font-medium">
                  {failure.code ? `${failure.code}: ` : ''}
                  {failure.message}
                </span>
                <br />
                Nothing was filed.{' '}
                {isSchemaNotApplied(failure.code, failure.message)
                  ? 'The database change for this feature has not been applied to this environment yet — an administrator needs to apply the pending migration.'
                  : 'If this mentions row-level security, your role is missing health.sports.file_request.'}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={!complete || saving}
            onClick={submit}
          >
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            File for {squad.length || 0}{' '}
            {squad.length === 1 ? 'learner' : 'learners'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
