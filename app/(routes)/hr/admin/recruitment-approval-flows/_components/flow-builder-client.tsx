'use client';

/**
 * Dynamic approval-flow builder.
 *
 * Left rail: role categories. Right: the selected category's step chain —
 * ordered steps, each routed to a role (with live holder counts, warning on
 * zero) or a pinned person (staff search → profile_id), typed review|final,
 * with an optional interview requirement. Saving upserts the band-less
 * template for every selected organization.
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowDown, ArrowUp, CalendarClock, Check, ChevronsUpDown,
  GitBranch, Loader2, Plus, Search, Trash2, UserRound, Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  useApprovalFlows,
  useUpsertApprovalFlow,
  useRoleUserCounts,
  useRoleUsers,
  useHrOrganizations,
} from '@/hooks/hr/use-recruitment';
import {
  ROLE_CATEGORY_LABELS,
  type ApprovalFlowStepTemplate,
  type RoleCategory,
} from '@/types/hr-recruitment';

const CATEGORIES = Object.keys(ROLE_CATEGORY_LABELS) as RoleCategory[];

interface DraftStep {
  key: string; // local list key
  mode: 'role' | 'user';
  approver_role: string;
  approver_user_id: string | null;
  approver_name: string | null;
  interview_required: boolean;
  escalate_after_hours: number;
}

let stepSeq = 0;
const newStep = (partial?: Partial<DraftStep>): DraftStep => ({
  key: `s${++stepSeq}`,
  mode: 'role',
  approver_role: '',
  approver_user_id: null,
  approver_name: null,
  interview_required: false,
  escalate_after_hours: 72,
  ...partial,
});

export function FlowBuilderClient() {
  const [category, setCategory] = useState<RoleCategory>('teaching_faculty');
  const [flowName, setFlowName] = useState('');
  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set());
  // Multi-category apply: the edited category is always included; extra
  // categories receive the same chain on save (each keeps its own row).
  const [extraCategories, setExtraCategories] = useState<Set<RoleCategory>>(new Set());
  const [loadedFromFlowId, setLoadedFromFlowId] = useState<string | null>(null);

  const { data: flows, isLoading: flowsLoading, error: flowsError } = useApprovalFlows();
  const { data: orgs } = useHrOrganizations();
  const { data: roleCounts } = useRoleUserCounts();
  const upsert = useUpsertApprovalFlow();

  const allOrgIds = useMemo(() => (orgs ?? []).map((o) => o.id), [orgs]);
  const allSelected = allOrgIds.length > 0 && selectedOrgIds.size === allOrgIds.length;

  // Default: all orgs selected once loaded.
  useEffect(() => {
    if (allOrgIds.length > 0 && selectedOrgIds.size === 0) {
      setSelectedOrgIds(new Set(allOrgIds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOrgIds.length]);

  // Load the existing band-less template for the selected category
  // (prefer a flow belonging to a selected org; fall back to any org's).
  useEffect(() => {
    const candidates = (flows ?? []).filter(
      (f) =>
        f.is_active &&
        (f.conditions as Record<string, string> | null)?.role_category === category &&
        !(f.conditions as Record<string, string> | null)?.monthly_salary_band,
    );
    const preferred =
      candidates.find((f) => selectedOrgIds.has(f.hr_organization_id)) ?? candidates[0] ?? null;

    if (!preferred) {
      setFlowName(`${ROLE_CATEGORY_LABELS[category]} Approval`);
      setSteps([newStep()]);
      setLoadedFromFlowId(null);
      return;
    }
    if (preferred.id === loadedFromFlowId) return;

    setFlowName(preferred.flow_name);
    setSteps(
      (preferred.steps ?? []).map((s) =>
        newStep({
          mode: s.approver_user_id ? 'user' : 'role',
          approver_role: s.approver_role ?? '',
          approver_user_id: s.approver_user_id ?? null,
          approver_name: s.approver_name ?? null,
          interview_required: s.interview_required ?? false,
          escalate_after_hours: s.escalate_after_hours ?? 72,
        }),
      ),
    );
    setLoadedFromFlowId(preferred.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, flows]);

  const roleByKey = useMemo(
    () => new Map((roleCounts ?? []).map((r) => [r.role_key, r] as const)),
    [roleCounts],
  );

  const updateStep = (key: string, patch: Partial<DraftStep>) =>
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const removeStep = (key: string) =>
    setSteps((prev) => (prev.length > 1 ? prev.filter((s) => s.key !== key) : prev));
  const moveStep = (key: string, dir: -1 | 1) =>
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });

  const stepsValid = steps.every((s) =>
    s.mode === 'role' ? !!s.approver_role : !!s.approver_user_id,
  );
  const canSave = stepsValid && steps.length > 0 && selectedOrgIds.size > 0 && !!flowName.trim();
  const targetCategories: RoleCategory[] = [
    category,
    ...Array.from(extraCategories).filter((c) => c !== category),
  ];

  const handleSave = () => {
    const payload: ApprovalFlowStepTemplate[] = steps.map((s, idx) => ({
      chain_order: idx + 1,
      approver_role: s.mode === 'role' ? s.approver_role : (s.approver_role || 'pinned_user'),
      approver_user_id: s.mode === 'user' ? s.approver_user_id : null,
      approver_name: s.mode === 'user' ? s.approver_name : null,
      step_type: idx === steps.length - 1 ? 'final' : 'review',
      interview_required: s.interview_required,
      escalate_after_hours: s.escalate_after_hours,
    }));
    upsert.mutate(
      {
        flow_name: flowName.trim(),
        role_categories: targetCategories,
        steps: payload,
        hr_organization_ids: Array.from(selectedOrgIds),
      },
      {
        onSuccess: ({ updated, created }) => {
          toast.success(
            `Flow saved across ${targetCategories.length} categor${targetCategories.length === 1 ? 'y' : 'ies'} — ` +
            `${updated} flow${updated === 1 ? '' : 's'} updated, ${created} created.`,
          );
          setExtraCategories(new Set());
          setLoadedFromFlowId(null); // allow reload of fresh data
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="mt-2 space-y-4">
      <Alert>
        <GitBranch className="h-4 w-4" />
        <AlertDescription>
          Flows are frozen onto each candidate when they enter the pipeline — editing here
          changes <span className="font-medium">future</span> candidates only. Every step
          before the last is a <span className="font-medium">review</span> step (notes + mark
          as reviewed); the <span className="font-medium">last step gives final approval</span>{' '}
          and unlocks staff onboarding.
        </AlertDescription>
      </Alert>

      {flowsError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{(flowsError as Error).message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        {/* Category rail */}
        <Card className="lg:col-span-1 h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Role Category</CardTitle>
          </CardHeader>
          <CardContent className="p-2 pt-0 space-y-1">
            {CATEGORIES.map((cat) => {
              const flow = (flows ?? []).find(
                (f) =>
                  f.is_active &&
                  (f.conditions as Record<string, string> | null)?.role_category === cat &&
                  !(f.conditions as Record<string, string> | null)?.monthly_salary_band,
              );
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategory(cat);
                    setExtraCategories(new Set());
                    setLoadedFromFlowId(null);
                  }}
                  className={`w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors cursor-pointer ${
                    active
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <span className="truncate text-left">{ROLE_CATEGORY_LABELS[cat]}</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 shrink-0 tabular-nums ${
                      active ? 'border-primary-foreground/40 text-primary-foreground' : ''
                    }`}
                  >
                    {flow ? `${(flow.steps ?? []).length} steps` : 'none'}
                  </Badge>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Editor */}
        <div className="lg:col-span-3 space-y-4">
          {flowsLoading ? (
            <Card>
              <CardContent className="p-6 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 rounded bg-muted/50 animate-pulse" />
                ))}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Flow meta */}
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="flowName">Flow name</Label>
                      <Input
                        id="flowName"
                        value={flowName}
                        onChange={(e) => setFlowName(e.target.value)}
                        placeholder="e.g. Teaching Faculty Approval"
                      />
                    </div>
                    <div>
                      <Label>Applies to organizations</Label>
                      <div className="mt-1 rounded-md border border-border max-h-36 overflow-y-auto p-2 space-y-1">
                        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={(v) =>
                              setSelectedOrgIds(v === true ? new Set(allOrgIds) : new Set())
                            }
                          />
                          All organizations ({allOrgIds.length})
                        </label>
                        {(orgs ?? []).map((o) => (
                          <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer pl-5">
                            <Checkbox
                              checked={selectedOrgIds.has(o.id)}
                              onCheckedChange={(v) =>
                                setSelectedOrgIds((prev) => {
                                  const next = new Set(prev);
                                  if (v === true) next.add(o.id);
                                  else next.delete(o.id);
                                  return next;
                                })
                              }
                            />
                            <span className="truncate">{o.name ?? o.id}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Applies to role categories</Label>
                      <p className="text-xs text-muted-foreground mb-1">
                        The category you&rsquo;re editing is always included. Tick more to save this
                        same chain for them too — each category keeps its own copy and can be
                        edited separately later.
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border border-border p-2">
                        {CATEGORIES.map((cat) => {
                          const isCurrent = cat === category;
                          return (
                            <label
                              key={cat}
                              className={`flex items-center gap-2 text-sm ${
                                isCurrent ? 'font-medium' : 'cursor-pointer'
                              }`}
                            >
                              <Checkbox
                                checked={isCurrent || extraCategories.has(cat)}
                                disabled={isCurrent}
                                onCheckedChange={(v) =>
                                  setExtraCategories((prev) => {
                                    const next = new Set(prev);
                                    if (v === true) next.add(cat);
                                    else next.delete(cat);
                                    return next;
                                  })
                                }
                              />
                              {ROLE_CATEGORY_LABELS[cat]}
                              {isCurrent && (
                                <span className="text-[10px] text-muted-foreground">(editing)</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Steps */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Approval chain — {steps.length} step{steps.length === 1 ? '' : 's'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {steps.map((step, idx) => (
                    <StepEditor
                      key={step.key}
                      step={step}
                      index={idx}
                      isLast={idx === steps.length - 1}
                      total={steps.length}
                      roleCounts={roleCounts ?? []}
                      onChange={(patch) => updateStep(step.key, patch)}
                      onMove={(dir) => moveStep(step.key, dir)}
                      onRemove={() => removeStep(step.key)}
                    />
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setSteps((prev) => [...prev, newStep()])}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add step
                  </Button>
                </CardContent>
              </Card>

              {/* English consequence preview */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4">
                  <p className="text-sm font-medium mb-1.5">What this means</p>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-5">
                    {steps.map((s, idx) => {
                      const who =
                        s.mode === 'user'
                          ? (s.approver_name ?? 'the pinned person')
                          : (roleByKey.get(s.approver_role)?.role_name ?? (s.approver_role || '…'));
                      const isLast = idx === steps.length - 1;
                      return (
                        <li key={s.key}>
                          <span className="font-medium text-foreground">{who}</span>{' '}
                          {s.interview_required && (
                            <>schedules &amp; completes an <span className="font-medium text-foreground">interview</span>, then </>
                          )}
                          {isLast
                            ? 'gives the final approval — the candidate can then be onboarded to Staff.'
                            : 'adds notes and marks the candidate as reviewed.'}
                        </li>
                      );
                    })}
                  </ol>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button className="gap-1.5" disabled={!canSave || upsert.isPending} onClick={handleSave}>
                  {upsert.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {upsert.isPending
                    ? 'Saving…'
                    : `Save ${targetCategories.length} categor${targetCategories.length === 1 ? 'y' : 'ies'} × ${selectedOrgIds.size} organization${selectedOrgIds.size === 1 ? '' : 's'}`}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Single step editor ----------------------------------------------------------

function StepEditor({
  step, index, isLast, total, roleCounts, onChange, onMove, onRemove,
}: {
  step: DraftStep;
  index: number;
  isLast: boolean;
  total: number;
  roleCounts: Array<{ role_key: string; role_name: string; users: number }>;
  onChange: (patch: Partial<DraftStep>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const selectedRole = roleCounts.find((r) => r.role_key === step.approver_role);
  const zeroHolders = step.mode === 'role' && selectedRole && selectedRole.users === 0;

  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
          {index + 1}
        </span>
        <Badge
          className={
            isLast
              ? 'bg-primary text-primary-foreground text-[10px]'
              : 'bg-muted text-foreground text-[10px]'
          }
          variant={isLast ? 'default' : 'outline'}
        >
          {isLast ? 'Final approval' : 'Review'}
        </Badge>
        {step.interview_required && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <CalendarClock className="h-3 w-3" />
            Interview required
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move step up">
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isLast} onClick={() => onMove(1)} aria-label="Move step down">
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-600 dark:text-red-400"
            disabled={total <= 1}
            onClick={onRemove}
            aria-label="Remove step"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[140px_1fr_auto_auto] sm:items-end">
        {/* Approver mode */}
        <div>
          <Label className="text-xs">Route to</Label>
          <Select
            value={step.mode}
            onValueChange={(v) =>
              onChange({ mode: v as 'role' | 'user', approver_user_id: null, approver_name: null })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="role">
                <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Role</span>
              </SelectItem>
              <SelectItem value="user">
                <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" /> Specific person</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Approver picker */}
        {step.mode === 'role' ? (
          <div>
            <Label className="text-xs">Approver role</Label>
            <Select value={step.approver_role || undefined} onValueChange={(v) => onChange({ approver_role: v })}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Pick a role…" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {roleCounts.map((r) => (
                  <SelectItem key={r.role_key} value={r.role_key}>
                    <span className="inline-flex items-center gap-2">
                      {r.role_name}
                      <span className={`text-[10px] tabular-nums ${r.users === 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-muted-foreground'}`}>
                        {r.users} user{r.users === 1 ? '' : 's'}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div>
            <Label className="text-xs">Person</Label>
            <PinnedUserPicker
              value={step.approver_user_id}
              displayName={step.approver_name}
              roleCounts={roleCounts}
              onPick={(u) =>
                onChange({
                  approver_user_id: u.profile_id,
                  approver_name: u.name,
                  approver_role: u.role_hint || step.approver_role || 'pinned_user',
                })
              }
            />
          </div>
        )}

        {/* Interview toggle */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Interview</Label>
          <label className="flex h-9 items-center gap-2 text-sm cursor-pointer">
            <Switch
              checked={step.interview_required}
              onCheckedChange={(v) => onChange({ interview_required: v })}
            />
            <span className="text-xs text-muted-foreground">Required</span>
          </label>
        </div>

        {/* Escalation */}
        <div>
          <Label className="text-xs">Escalate after (hrs)</Label>
          <Input
            type="number"
            min={1}
            className="h-9 w-24"
            value={step.escalate_after_hours}
            onChange={(e) => onChange({ escalate_after_hours: parseInt(e.target.value) || 72 })}
          />
        </div>
      </div>

      {zeroHolders && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Nobody currently holds this role — candidates would get stuck at this step.
          Assign the role to a user in Role Management, or pin a specific person instead.
        </p>
      )}
    </div>
  );
}

// ---- Pinned-person picker: role filter first, then search ---------------------------
// Sourced from profiles + user_roles via the role-users API (NOT the staff
// table — super admins have no staff row and must be pickable). State is
// isolated in this child so keystrokes don't re-render the whole builder.

interface PickedUser {
  profile_id: string;
  name: string;
  role_hint: string | null;
}

function PinnedUserPicker({
  value, displayName, roleCounts, onPick,
}: {
  value: string | null;
  displayName: string | null;
  roleCounts: Array<{ role_key: string; role_name: string; users: number }>;
  onPick: (u: PickedUser) => void;
}) {
  const [open, setOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all');
  const [query, setQuery] = useState('');

  // 'all' needs ≥2 chars (server refuses to dump the whole directory);
  // any concrete filter lists its holders immediately.
  const canFetch = open && (roleFilter !== 'all' || query.trim().length >= 2);
  const { data: results, isFetching } = useRoleUsers(roleFilter, query, canFetch);

  const roleNameByKey = new Map(roleCounts.map((r) => [r.role_key, r.role_name] as const));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm cursor-pointer"
      >
        <span className={value ? 'text-foreground truncate' : 'text-muted-foreground'}>
          {value ? (displayName ?? 'Selected person') : 'Pick a person…'}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[300px] rounded-md border border-border bg-popover shadow-md p-2 space-y-1.5">
          {/* Step 1 — role filter */}
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="all">All roles (search by name)</SelectItem>
              <SelectItem value="super_admin">
                <span className="inline-flex items-center gap-2">
                  Super Administrators
                </span>
              </SelectItem>
              {roleCounts
                .filter((r) => r.users > 0)
                .map((r) => (
                  <SelectItem key={r.role_key} value={r.role_key}>
                    <span className="inline-flex items-center gap-2">
                      {r.role_name}
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {r.users}
                      </span>
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {/* Step 2 — person search within the filter */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={roleFilter === 'all' ? 'Type ≥2 characters…' : 'Filter by name or email…'}
              className="h-8 pl-7 text-sm"
            />
          </div>

          <div className="max-h-56 overflow-y-auto">
            {!canFetch && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Pick a role above, or type at least 2 characters to search everyone.
              </p>
            )}
            {canFetch && isFetching && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Searching…</p>
            )}
            {canFetch && !isFetching && (results ?? []).length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">No people match.</p>
            )}
            {(results ?? []).map((p) => {
              const name = p.full_name ?? p.email ?? 'Unknown';
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onPick({
                      profile_id: p.id,
                      name,
                      role_hint:
                        roleFilter !== 'all' && roleFilter !== 'super_admin'
                          ? roleFilter
                          : p.is_super_admin
                          ? 'super_admin'
                          : p.roles[0] ?? null,
                    });
                    setOpen(false);
                    setQuery('');
                  }}
                  className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted cursor-pointer"
                >
                  <span className="font-medium inline-flex items-center gap-1.5">
                    {name}
                    {p.is_super_admin && (
                      <Badge className="text-[9px] px-1 py-0 bg-primary text-primary-foreground">
                        Super Admin
                      </Badge>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {p.email}
                    {p.roles.length > 0 &&
                      ` · ${p.roles
                        .slice(0, 2)
                        .map((k) => roleNameByKey.get(k.toLowerCase()) ?? k)
                        .join(', ')}${p.roles.length > 2 ? ` +${p.roles.length - 2}` : ''}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
