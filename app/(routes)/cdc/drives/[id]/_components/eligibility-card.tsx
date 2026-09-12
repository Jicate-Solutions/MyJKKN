'use client';

/**
 * Drive eligibility criteria — the form that says WHO a drive is for.
 *
 * This is the missing writer for `cdc_drive_eligibility`. Until it existed, every
 * drive had zero criteria, so the "drive is open" notification found no one to
 * notify and exited quietly, and every learner who reached the willingness page
 * was told they were not eligible. See lib/services/cdc/eligibility-service.ts.
 *
 * Programs are the load-bearing field: both the notification query and the
 * learner's own eligibility check match on program. Everything else is recorded
 * for the coordinator to apply when locking the final list.
 *
 * The form is a separate component seeded from props and mounted with a `key`
 * derived from the saved row, so arriving/!changed server data re-initialises it by
 * remounting rather than by syncing state inside an effect.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2, Users } from 'lucide-react';
import type { CdcDriveEligibility } from '@/types/cdc';
import {
  useCdcDriveEligibility,
  useCdcProgramOptions,
  useSaveCdcDriveEligibility,
  type CdcProgramOption,
} from '@/hooks/cdc/use-cdc-drive-eligibility';

const GENDERS = ['Male', 'Female', 'Other'];

/** Empty string → null, so a cleared field stores NULL rather than 0. */
function numOrNull(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function str(v: number | null | undefined): string {
  return v == null ? '' : String(v);
}

// ---------------------------------------------------------------------------

export function DriveEligibilityCard({
  driveId,
  canEdit,
}: {
  driveId: string;
  canEdit: boolean;
}) {
  const { data, isLoading } = useCdcDriveEligibility(driveId);
  const { data: programs, isLoading: programsLoading } = useCdcProgramOptions(driveId);
  const [editing, setEditing] = useState(false);

  const eligibility = data?.data ?? null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who is eligible</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading criteria…</p>
        </CardContent>
      </Card>
    );
  }

  const showForm = editing || !eligibility;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">Who is eligible</CardTitle>
          {eligibility ? (
            <Badge variant="secondary" className="shrink-0">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Set
            </Badge>
          ) : (
            <Badge variant="destructive" className="shrink-0">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Not set
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!eligibility ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This drive cannot be opened for willingness until eligibility is set. No
              learner is notified and none can declare interest without it.
            </AlertDescription>
          </Alert>
        ) : null}

        {eligibility && data?.matching_learners != null ? (
          <div className="flex items-center gap-2 text-sm rounded-md border p-3">
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>
              <strong>{data.matching_learners.toLocaleString()}</strong> active learners
              match these criteria and will be notified when the drive opens.
            </span>
          </div>
        ) : null}

        {showForm ? (
          <EligibilityForm
            // Remount (and therefore re-seed) whenever the saved row changes OR
            // the program options finish loading — the form seeds its selection
            // by matching saved ids against those options, so seeding before
            // they arrive would show nothing ticked on an already-configured drive.
            key={`${eligibility ? `${eligibility.id}:${eligibility.updated_at}` : 'new'}:${programs?.length ?? 0}`}
            driveId={driveId}
            canEdit={canEdit}
            initial={eligibility}
            programs={programs ?? []}
            programsLoading={programsLoading}
            onDone={() => setEditing(false)}
          />
        ) : (
          <EligibilitySummary
            eligibility={eligibility}
            programs={programs ?? []}
            canEdit={canEdit}
            onEdit={() => setEditing(true)}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function EligibilitySummary({
  eligibility,
  programs,
  canEdit,
  onEdit,
}: {
  eligibility: CdcDriveEligibility;
  programs: CdcProgramOption[];
  canEdit: boolean;
  onEdit: () => void;
}) {
  // A saved program_ids array may hold several ids that are the same program
  // (duplicate master rows), so resolve by membership and show each name once.
  const labels = Array.from(
    new Set(
      (eligibility.program_ids ?? []).map(
        (id) => programs.find((p) => p.ids.includes(id))?.label ?? id
      )
    )
  );

  return (
    <>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Programs</dt>
          <dd className="flex flex-wrap gap-1 mt-1">
            {labels.map((label) => (
              <Badge key={label} variant="outline">
                {label}
              </Badge>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Minimum CGPA</dt>
          <dd>{eligibility.min_cgpa ?? 'Any'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Maximum arrears</dt>
          <dd>{eligibility.max_arrears ?? 'Any'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Minimum semester</dt>
          <dd>{eligibility.min_semester ?? 'Any'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Year of study</dt>
          <dd>{eligibility.program_year ?? 'Any'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Gender</dt>
          <dd>{eligibility.allowed_genders?.join(', ') || 'Any'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Passed-out allowed</dt>
          <dd>{eligibility.passed_out_allowed ? 'Yes' : 'No'}</dd>
        </div>
        {eligibility.additional_notes ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Notes</dt>
            <dd>{eligibility.additional_notes}</dd>
          </div>
        ) : null}
      </dl>
      {canEdit ? (
        <Button variant="outline" size="sm" onClick={onEdit}>
          Change criteria
        </Button>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------

function EligibilityForm({
  driveId,
  canEdit,
  initial,
  programs,
  programsLoading,
  onDone,
}: {
  driveId: string;
  canEdit: boolean;
  initial: CdcDriveEligibility | null;
  programs: CdcProgramOption[];
  programsLoading: boolean;
  onDone: () => void;
}) {
  const save = useSaveCdcDriveEligibility(driveId);

  // Selection is per OPTION, not per raw id: one option can stand for several
  // duplicate master rows. Seed an option as chosen when the saved criteria
  // include any of its ids.
  const savedIds = initial?.program_ids ?? [];
  const [selected, setSelected] = useState<string[]>(() =>
    programs.filter((p) => p.ids.some((id) => savedIds.includes(id))).map((p) => p.value)
  );
  const [minCgpa, setMinCgpa] = useState(str(initial?.min_cgpa));
  const [minSemester, setMinSemester] = useState(str(initial?.min_semester));
  const [maxArrears, setMaxArrears] = useState(str(initial?.max_arrears));
  const [programYear, setProgramYear] = useState(str(initial?.program_year));
  const [genders, setGenders] = useState<string[]>(initial?.allowed_genders ?? []);
  const [passedOut, setPassedOut] = useState(!!initial?.passed_out_allowed);
  const [notes, setNotes] = useState(initial?.additional_notes ?? '');
  const [error, setError] = useState<string | null>(null);

  function toggleProgram(optionValue: string) {
    setSelected((prev) =>
      prev.includes(optionValue)
        ? prev.filter((p) => p !== optionValue)
        : [...prev, optionValue]
    );
  }

  /** Every underlying program id for the chosen options — what actually gets saved. */
  const programIdsToSave = Array.from(
    new Set(programs.filter((p) => selected.includes(p.value)).flatMap((p) => p.ids))
  );

  function toggleGender(g: string) {
    setGenders((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  async function handleSave() {
    setError(null);
    try {
      await save.mutateAsync({
        program_ids: programIdsToSave,
        min_cgpa: numOrNull(minCgpa),
        min_semester: numOrNull(minSemester),
        max_arrears: numOrNull(maxArrears),
        program_year: numOrNull(programYear),
        allowed_genders: genders.length > 0 ? genders : null,
        passed_out_allowed: passedOut,
        additional_notes: notes,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving eligibility failed');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Programs {selected.length > 0 ? `(${selected.length} chosen)` : ''}</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Only learners on a chosen program are notified and able to declare interest.
        </p>
        {programsLoading ? (
          <p className="text-sm text-muted-foreground">Loading programs…</p>
        ) : programs.length === 0 ? (
          <p className="text-sm text-destructive">
            No programs found for the institutions this drive targets.
          </p>
        ) : (
          <div className="max-h-56 overflow-y-auto rounded-md border p-2 space-y-1">
            {programs.map((p) => (
              <label
                key={p.value}
                htmlFor={`program-${p.value}`}
                className="flex items-start gap-2 text-sm py-1 cursor-pointer"
              >
                <Checkbox
                  id={`program-${p.value}`}
                  checked={selected.includes(p.value)}
                  onCheckedChange={() => toggleProgram(p.value)}
                  disabled={!canEdit}
                />
                <span className="leading-tight">{p.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="elig-min-cgpa">Minimum CGPA</Label>
          <Input
            id="elig-min-cgpa"
            type="number"
            step="0.01"
            min="0"
            max="10"
            value={minCgpa}
            onChange={(e) => setMinCgpa(e.target.value)}
            placeholder="Any"
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label htmlFor="elig-max-arrears">Maximum arrears</Label>
          <Input
            id="elig-max-arrears"
            type="number"
            min="0"
            value={maxArrears}
            onChange={(e) => setMaxArrears(e.target.value)}
            placeholder="Any"
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label htmlFor="elig-min-semester">Minimum semester</Label>
          <Input
            id="elig-min-semester"
            type="number"
            min="1"
            max="12"
            value={minSemester}
            onChange={(e) => setMinSemester(e.target.value)}
            placeholder="Any"
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label htmlFor="elig-program-year">Year of study</Label>
          <Input
            id="elig-program-year"
            type="number"
            min="1"
            max="6"
            value={programYear}
            onChange={(e) => setProgramYear(e.target.value)}
            placeholder="Any"
            disabled={!canEdit}
          />
        </div>
      </div>

      <div>
        <Label>Gender</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Leave all unticked when the recruiter has no restriction.
        </p>
        <div className="flex flex-wrap gap-4">
          {GENDERS.map((g) => (
            <label
              key={g}
              htmlFor={`gender-${g}`}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <Checkbox
                id={`gender-${g}`}
                checked={genders.includes(g)}
                onCheckedChange={() => toggleGender(g)}
                disabled={!canEdit}
              />
              <span>{g}</span>
            </label>
          ))}
        </div>
      </div>

      <label htmlFor="elig-passed-out" className="flex items-center gap-2 text-sm cursor-pointer">
        <Checkbox
          id="elig-passed-out"
          checked={passedOut}
          onCheckedChange={(v) => setPassedOut(!!v)}
          disabled={!canEdit}
        />
        <span>Allow passed-out learners</span>
      </label>

      <div>
        <Label htmlFor="elig-notes">Notes for learners (optional)</Label>
        <Textarea
          id="elig-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything else the recruiter requires"
          disabled={!canEdit}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {canEdit ? (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={save.isPending || selected.length === 0}>
            {save.isPending ? 'Saving…' : 'Save criteria'}
          </Button>
          {initial ? (
            <Button variant="outline" size="sm" onClick={onDone}>
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
