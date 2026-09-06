'use client';

// ============================================================================
// Teaching-Enterprise Cohorts — config editor
// ============================================================================
// Every policy decision = a config-table row + a UI to write it. The cohort
// definition that used to be a frozen WHERE clause inside the participant sync
// is now a row in `teaching_enterprise_cohorts`; this is where the Director
// edits it. No PR, no migration, no deploy.
//
// Reads and writes both go through SECURITY DEFINER RPCs (see
// lib/services/teaching-cohorts/teaching-cohorts-service.ts) — the base table
// stays read-only to the browser client.
// ============================================================================

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Layers,
  RotateCcw,
  Save,
  Users,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

import { usePermissions } from '@/hooks/use-permissions';
import {
  CONTRIBUTION_MODES,
  formatSemesterOrders,
  parseSemesterOrders,
  useTeachingCohorts,
  useUpdateTeachingCohort,
  type ContributionMode,
  type TeachingCohort,
} from '@/lib/services/teaching-cohorts/teaching-cohorts-service';

/** Per-row unsaved edits, keyed by cohort_key. */
interface Draft {
  display_name?: string;
  semester_orders_text?: string;
  contribution_mode?: ContributionMode;
  is_active?: boolean;
}

export function TeachingCohortsClient() {
  const { isLoading: permsLoading, isSuperAdmin, can } = usePermissions();

  // `can()` returns false while permissions load, so the gate must read the
  // loading state explicitly — treating UNKNOWN as DENIED would flash a
  // no-access panel at every super admin on first paint.
  const canManage = permsLoading ? false : isSuperAdmin || can('improvement.board.manage');

  const {
    data: cohorts,
    isLoading: cohortsLoading,
    error,
  } = useTeachingCohorts(canManage);
  const updateMutation = useUpdateTeachingCohort();

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  /**
   * Drop one row's unsaved edits so it re-renders from the canonical server
   * values. Called on a successful save (and by the Discard button) rather than
   * from an effect on `cohorts` — a blanket clear-on-refetch would also throw
   * away edits in progress on the OTHER rows every time any row saved.
   */
  const clearDraft = (cohortKey: string) =>
    setDrafts((prev) => {
      if (!(cohortKey in prev)) return prev;
      const next = { ...prev };
      delete next[cohortKey];
      return next;
    });

  // ---- loading ----------------------------------------------------------
  // Never `return null` while loading — that causes a layout shift.
  if (permsLoading || (canManage && cohortsLoading)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  // ---- explicit no-access (never a silent redirect) ---------------------
  if (!canManage) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>You don&apos;t have access to this page</AlertTitle>
        <AlertDescription>
          Managing teaching-enterprise cohorts needs the Improvement Board
          management permission (<code>improvement.board.manage</code>) or super
          administrator access. If you believe you should have it, contact a
          platform administrator.
        </AlertDescription>
      </Alert>
    );
  }

  if (error) {
    const missingSubstrate = /does not exist|schema cache|could not find/i.test(
      error.message,
    );
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Couldn&apos;t load the cohort list</AlertTitle>
        <AlertDescription>
          {error.message}
          {missingSubstrate ? (
            <>
              {' '}
              This usually means the migration that creates{' '}
              <code>teaching_enterprise_cohorts</code> has not been applied yet.
            </>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  if (!cohorts || cohorts.length === 0) {
    return (
      <Alert>
        <Layers className="h-4 w-4" />
        <AlertTitle>No cohorts configured</AlertTitle>
        <AlertDescription>
          The <code>teaching_enterprise_cohorts</code> table has no rows yet.
          Once the seed migration is applied, each cohort appears here and can
          be edited without a deploy.
        </AlertDescription>
      </Alert>
    );
  }

  const activeCount = cohorts.filter((c) => c.is_active).length;

  return (
    <div className="space-y-6">
      <Alert>
        <Layers className="h-4 w-4" />
        <AlertTitle>One row per participating cohort</AlertTitle>
        <AlertDescription>
          A cohort row decides who is enrolled (programme + semester window) and
          what they get (which role, and whether they analyse or build). The
          nightly participant sync reads the <strong>active</strong> rows and
          grants or removes the role to match, and the analytics gate only
          admits an active cohort&apos;s learners.{' '}
          <strong>
            Turning a cohort off stops new grants and closes its analytics
            access, but does not remove roles already granted.
          </strong>{' '}
          The programme, department and role keys are fixed here on purpose —
          repointing a cohort is a migration-level change, not a toggle.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Teaching-enterprise cohorts</CardTitle>
          <CardDescription>
            {cohorts.length} {cohorts.length === 1 ? 'cohort' : 'cohorts'}{' '}
            configured &middot; {activeCount} active
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {cohorts.map((row) => (
            <CohortRow
              key={row.cohort_key}
              row={row}
              draft={drafts[row.cohort_key] ?? {}}
              saving={updateMutation.isPending}
              onDraft={(patch) =>
                setDrafts((prev) => ({
                  ...prev,
                  [row.cohort_key]: { ...prev[row.cohort_key], ...patch },
                }))
              }
              onReset={() => clearDraft(row.cohort_key)}
              onSave={(patch) => {
                updateMutation.mutate(
                  { cohortKey: row.cohort_key, patch },
                  {
                    onSuccess: () => {
                      clearDraft(row.cohort_key);
                      toast.success(`Saved ${row.display_name}`);
                    },
                    onError: (e) => toast.error(e.message),
                  },
                );
              }}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CohortRow({
  row,
  draft,
  saving,
  onDraft,
  onReset,
  onSave,
}: {
  row: TeachingCohort;
  draft: Draft;
  saving: boolean;
  onDraft: (patch: Draft) => void;
  onReset: () => void;
  onSave: (patch: {
    display_name?: string;
    semester_orders?: number[];
    contribution_mode?: ContributionMode;
    is_active?: boolean;
  }) => void;
}) {
  const displayName = draft.display_name ?? row.display_name;
  const semestersText =
    draft.semester_orders_text ?? formatSemesterOrders(row.semester_orders);
  const mode = draft.contribution_mode ?? row.contribution_mode;
  const isActive = draft.is_active ?? row.is_active;

  const parsedSemesters = useMemo(
    () => parseSemesterOrders(semestersText),
    [semestersText],
  );
  const semestersValid = parsedSemesters !== null;

  const savedSemesters = formatSemesterOrders(row.semester_orders);
  const dirty =
    displayName !== row.display_name ||
    semestersText.trim() !== savedSemesters ||
    mode !== row.contribution_mode ||
    isActive !== row.is_active;

  const nameValid = displayName.trim().length > 0;
  const canSave = dirty && nameValid && semestersValid && !saving;

  return (
    <div className="rounded-lg border border-border p-4">
      {/* header line */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-muted-foreground">
          {row.cohort_key}
        </span>
        <Badge variant={row.is_active ? 'default' : 'secondary'}>
          {row.is_active ? 'Active' : 'Inactive'}
        </Badge>
        <span className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {row.learner_members} {row.learner_members === 1 ? 'learner' : 'learners'}
          {row.faculty_role_key ? (
            <>
              {' '}
              &middot; {row.faculty_members}{' '}
              {row.faculty_members === 1 ? 'Senior Learner' : 'Senior Learners'}
            </>
          ) : null}
        </span>
      </div>

      {/* fixed identity — read-only context */}
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Programme" value={row.program_name} />
        <Fact label="Department" value={row.department_name} />
        <Fact label="Institution" value={row.institution_name} />
        <Fact
          label="Roles granted"
          value={[row.learner_role_key, row.faculty_role_key]
            .filter(Boolean)
            .join(' / ')}
          mono
        />
      </dl>

      {/* editable fields */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Display name</span>
          <Input
            value={displayName}
            disabled={saving}
            onChange={(e) => onDraft({ display_name: e.target.value })}
          />
          {!nameValid ? (
            <span className="text-xs text-destructive">
              A display name is required.
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Drives every label the participant sees.
            </span>
          )}
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Semester window</span>
          <Input
            value={semestersText}
            placeholder="5, 6, 7"
            disabled={saving}
            onChange={(e) => onDraft({ semester_orders_text: e.target.value })}
          />
          {semestersValid ? (
            <span className="text-xs text-muted-foreground">
              Learners in {parsedSemesters!.length === 1 ? 'semester' : 'semesters'}{' '}
              {parsedSemesters!.join(', ')} qualify.
            </span>
          ) : (
            <span className="text-xs text-destructive">
              Enter one or more semester numbers, e.g. 5, 6, 7.
            </span>
          )}
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Contribution mode</span>
          <Select
            value={mode}
            disabled={saving}
            onValueChange={(v) =>
              onDraft({ contribution_mode: v as ContributionMode })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTRIBUTION_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {CONTRIBUTION_MODES.find((m) => m.value === mode)?.hint}
          </span>
        </label>

        <div className="space-y-1.5 text-sm">
          <span className="font-medium">Active</span>
          <div className="flex h-9 items-center gap-2">
            <Switch
              checked={isActive}
              disabled={saving}
              onCheckedChange={(checked) => onDraft({ is_active: checked })}
              aria-label={`Activate ${row.display_name}`}
            />
            <span className="text-muted-foreground">
              {isActive ? 'Enrolling' : 'Paused'}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Active cohorts are synced and can reach their assigned analytics.
          </span>
        </div>
      </div>

      {/* actions */}
      <div className="mt-4 flex items-center gap-2">
        <Button
          size="sm"
          disabled={!canSave}
          onClick={() =>
            onSave({
              display_name: displayName.trim(),
              semester_orders: parsedSemesters ?? undefined,
              contribution_mode: mode,
              is_active: isActive,
            })
          }
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!dirty || saving}
          onClick={onReset}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Discard
        </Button>
        {row.updated_at ? (
          <span className="ml-auto text-xs text-muted-foreground">
            Updated {new Date(row.updated_at).toLocaleString()}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={mono ? 'font-mono text-xs' : undefined}>
        {value && value.length > 0 ? value : '—'}
      </dd>
    </div>
  );
}
