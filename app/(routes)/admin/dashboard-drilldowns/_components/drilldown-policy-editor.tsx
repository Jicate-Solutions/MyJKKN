'use client';

/**
 * DrilldownPolicyEditor
 *
 * Right-side Sheet editor for one drill-down metric. Per spec §3.0.1:
 * one editor surface, six fields per metric:
 *   - destination (text, must start with "/")
 *   - columns     (chip / tag input)
 *   - action_buttons.<role>  (multi-checkbox per role)
 *   - empty_state_copy       (textarea)
 *   - enabled                (switch)
 *
 * Each field is saved via its own platform_policies row (one key per
 * field, per spec §3.0). "Reset all overrides for this metric" deletes
 * every override row for the given metric and falls back to defaults.
 *
 * Saves are per-field — each field click "Save" runs an upsert on just
 * that field's policy_key. This mirrors the granular-override semantics
 * the rest of the platform_policies UIs use (a missing key = default).
 */

import { useEffect, useMemo, useState } from 'react';
import { Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import {
  ACTION_BUTTON_OPTIONS,
  DRILLDOWN_DEFAULTS,
  DRILLDOWN_ROLES,
  METRIC_LABELS,
  buildPolicyKey,
  type ActionButtonValue,
  type DrilldownMetric,
  type DrilldownRole,
} from '@/lib/policies/dashboard-drilldown-ui';
import {
  useResetDrilldownField,
  useResetDrilldownMetric,
  useUpsertDrilldownField,
  type ResolvedDrilldownRow,
} from './drilldown-policy-service';

interface DrilldownPolicyEditorProps {
  open: boolean;
  row: ResolvedDrilldownRow | null;
  canEdit: boolean;
  onClose: () => void;
}

export function DrilldownPolicyEditor({
  open,
  row,
  canEdit,
  onClose,
}: DrilldownPolicyEditorProps) {
  const upsertMutation = useUpsertDrilldownField();
  const resetFieldMutation = useResetDrilldownField();
  const resetMetricMutation = useResetDrilldownMetric();

  // Local drafts — initialized from `row` on open and synced when
  // `row` changes (after a successful save the parent re-fetches).
  const [destination, setDestination] = useState('');
  const [columnInput, setColumnInput] = useState('');
  const [columns, setColumns] = useState<string[]>([]);
  const [emptyCopy, setEmptyCopy] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [actionButtonsByRole, setActionButtonsByRole] =
    useState<Record<DrilldownRole, ActionButtonValue[]>>({
      director: [],
      counselor: [],
      principal: [],
    });

  useEffect(() => {
    if (!row) return;
    setDestination(row.policy.destination);
    setColumns([...row.policy.columns]);
    setColumnInput('');
    setEmptyCopy(row.policy.emptyStateCopy);
    setEnabled(row.policy.enabled);
    setActionButtonsByRole({
      director: [...row.policy.actionButtonsByRole.director],
      counselor: [...row.policy.actionButtonsByRole.counselor],
      principal: [...row.policy.actionButtonsByRole.principal],
    });
  }, [row, open]);

  const metric = row?.metric;

  const codeDefault = useMemo(
    () => (metric ? DRILLDOWN_DEFAULTS[metric] : null),
    [metric],
  );

  const destinationValid = useMemo(() => {
    const d = destination.trim();
    return d.length > 0 && d.startsWith('/');
  }, [destination]);

  const saving =
    upsertMutation.isPending ||
    resetFieldMutation.isPending ||
    resetMetricMutation.isPending;

  function patchActionButtons(
    role: DrilldownRole,
    value: ActionButtonValue,
    checked: boolean,
  ) {
    setActionButtonsByRole((prev) => {
      const current = prev[role];
      const next = checked
        ? Array.from(new Set([...current, value]))
        : current.filter((v) => v !== value);
      return { ...prev, [role]: next };
    });
  }

  function addColumn() {
    const v = columnInput.trim();
    if (!v) return;
    if (columns.includes(v)) {
      toast.info(`"${v}" is already in the column list.`);
      return;
    }
    setColumns([...columns, v]);
    setColumnInput('');
  }

  function removeColumn(c: string) {
    setColumns(columns.filter((x) => x !== c));
  }

  async function saveField(
    policyKey: string,
    value: unknown,
    successMsg: string,
  ) {
    try {
      await upsertMutation.mutateAsync({ policyKey, value });
      toast.success(successMsg);
    } catch (e) {
      toast.error(
        `Save failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async function saveDestination() {
    if (!metric || !destinationValid) return;
    await saveField(
      buildPolicyKey(metric, 'destination'),
      destination.trim(),
      `Destination updated for ${METRIC_LABELS[metric]}`,
    );
  }

  async function saveColumns() {
    if (!metric) return;
    await saveField(
      buildPolicyKey(metric, 'columns'),
      columns,
      `Columns updated for ${METRIC_LABELS[metric]}`,
    );
  }

  async function saveActionButtons(role: DrilldownRole) {
    if (!metric) return;
    await saveField(
      buildPolicyKey(metric, { kind: 'action_buttons', role }),
      actionButtonsByRole[role],
      `Action buttons (${role}) updated for ${METRIC_LABELS[metric]}`,
    );
  }

  async function saveEmptyCopy() {
    if (!metric) return;
    await saveField(
      buildPolicyKey(metric, 'empty_state_copy'),
      emptyCopy,
      `Empty-state copy updated for ${METRIC_LABELS[metric]}`,
    );
  }

  async function saveEnabled(next: boolean) {
    if (!metric) return;
    setEnabled(next);
    await saveField(
      buildPolicyKey(metric, 'enabled'),
      next,
      `Drill-down ${next ? 'enabled' : 'disabled'} for ${METRIC_LABELS[metric]}`,
    );
  }

  async function resetAllOverrides() {
    if (!row) return;
    const ids = Object.values(row.rowIdsByKey);
    if (ids.length === 0) {
      toast.info('Nothing to reset — already on defaults.');
      return;
    }
    try {
      await resetMetricMutation.mutateAsync(ids);
      toast.success(
        `Reset ${ids.length} override${ids.length === 1 ? '' : 's'} to default.`,
      );
    } catch (e) {
      toast.error(
        `Reset failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async function resetSingleField(policyKey: string) {
    if (!row) return;
    const id = row.rowIdsByKey[policyKey];
    if (!id) {
      toast.info('Already on default for this field.');
      return;
    }
    try {
      await resetFieldMutation.mutateAsync(id);
      toast.success('Reset to default.');
    } catch (e) {
      toast.error(
        `Reset failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (!row || !metric || !codeDefault) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-xl" />
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>Edit drill-down — {METRIC_LABELS[metric]}</SheetTitle>
          <SheetDescription>
            Each field saves independently. Empty fields fall back to the
            code default. <strong>Reset to default</strong> deletes the
            override row.
          </SheetDescription>
        </SheetHeader>

        {!canEdit && (
          <Alert className="mt-4">
            <AlertTitle>Read-only</AlertTitle>
            <AlertDescription>
              Only <strong>super_admin</strong> can edit drill-down
              policies. You can view but not save changes.
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-6 space-y-8">
          {/* Enabled */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="dd-enabled" className="text-sm font-semibold">
                  Drill-down enabled
                </Label>
                <p className="text-xs text-muted-foreground">
                  When off, the dashboard card still renders but click is a
                  no-op. Use this to disable a drill-down without removing it.
                </p>
              </div>
              <Switch
                id="dd-enabled"
                checked={enabled}
                disabled={!canEdit || saving}
                onCheckedChange={(v) => saveEnabled(v === true)}
              />
            </div>
            <DefaultBadge
              isOverride={row.overriddenFields.has('enabled')}
              defaultLabel={String(codeDefault.enabled)}
              onReset={() =>
                resetSingleField(buildPolicyKey(metric, 'enabled'))
              }
              canEdit={canEdit}
            />
          </section>

          <Separator />

          {/* Destination */}
          <section className="space-y-2">
            <Label htmlFor="dd-destination" className="text-sm font-semibold">
              Destination URL
            </Label>
            <p className="text-xs text-muted-foreground">
              Path the click navigates to. Must start with{' '}
              <code className="font-mono">/</code>. Filters from the
              dashboard (year, institutions) are appended at click time.
            </p>
            <div className="flex items-start gap-2">
              <Input
                id="dd-destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder={codeDefault.destination}
                disabled={!canEdit || saving}
                aria-invalid={!destinationValid}
                className="font-mono text-sm"
              />
              <Button
                size="sm"
                onClick={saveDestination}
                disabled={!canEdit || saving || !destinationValid}
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                Save
              </Button>
            </div>
            {!destinationValid && (
              <p className="text-xs text-destructive">
                Destination must be a non-empty path starting with{' '}
                <code className="font-mono">/</code>.
              </p>
            )}
            <DefaultBadge
              isOverride={row.overriddenFields.has('destination')}
              defaultLabel={codeDefault.destination}
              onReset={() =>
                resetSingleField(buildPolicyKey(metric, 'destination'))
              }
              canEdit={canEdit}
            />
          </section>

          <Separator />

          {/* Columns */}
          <section className="space-y-2">
            <Label className="text-sm font-semibold">Columns</Label>
            <p className="text-xs text-muted-foreground">
              Columns shown on the destination list. Add one at a time;
              remove with the X.
            </p>
            <div className="flex flex-wrap gap-2">
              {columns.map((c) => (
                <Badge key={c} variant="secondary" className="pr-1 text-sm">
                  <span className="font-mono">{c}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeColumn(c)}
                      disabled={saving}
                      className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
                      aria-label={`Remove ${c}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
              {columns.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No columns configured.
                </p>
              )}
            </div>
            {canEdit && (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Add column (e.g. date_applied)"
                  value={columnInput}
                  onChange={(e) => setColumnInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addColumn();
                    }
                  }}
                  disabled={saving}
                  className="max-w-sm font-mono text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addColumn}
                  disabled={saving || !columnInput.trim()}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 pt-1">
              <DefaultBadge
                isOverride={row.overriddenFields.has('columns')}
                defaultLabel={codeDefault.columns.join(', ')}
                onReset={() =>
                  resetSingleField(buildPolicyKey(metric, 'columns'))
                }
                canEdit={canEdit}
              />
              <Button
                size="sm"
                onClick={saveColumns}
                disabled={!canEdit || saving}
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                Save columns
              </Button>
            </div>
          </section>

          <Separator />

          {/* Action buttons per role */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Action buttons (per role)</h3>
              <p className="text-xs text-muted-foreground">
                Per spec §3.2 — same destination URL renders different
                buttons by viewer role. Counselor mode is the work surface;
                director / principal are read-only by default.
              </p>
            </div>
            {DRILLDOWN_ROLES.map((role) => {
              const overrideKey = `action_buttons.${role}`;
              const fieldKey = buildPolicyKey(metric, {
                kind: 'action_buttons',
                role,
              });
              return (
                <div key={role} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold capitalize">
                      {role}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => saveActionButtons(role)}
                      disabled={!canEdit || saving}
                    >
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Save {role}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
                    {ACTION_BUTTON_OPTIONS.map((opt) => {
                      const id = `dd-${role}-${opt.value}`;
                      const checked = actionButtonsByRole[role].includes(
                        opt.value,
                      );
                      return (
                        <label
                          key={opt.value}
                          htmlFor={id}
                          className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent text-xs"
                        >
                          <Checkbox
                            id={id}
                            checked={checked}
                            disabled={!canEdit || saving}
                            onCheckedChange={(v) =>
                              patchActionButtons(role, opt.value, v === true)
                            }
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <DefaultBadge
                    isOverride={row.overriddenFields.has(overrideKey)}
                    defaultLabel={
                      codeDefault.actionButtonsByRole[role].length === 0
                        ? '(none)'
                        : codeDefault.actionButtonsByRole[role].join(', ')
                    }
                    onReset={() => resetSingleField(fieldKey)}
                    canEdit={canEdit}
                  />
                </div>
              );
            })}
          </section>

          <Separator />

          {/* Empty-state copy */}
          <section className="space-y-2">
            <Label htmlFor="dd-empty-copy" className="text-sm font-semibold">
              Empty-state copy
            </Label>
            <p className="text-xs text-muted-foreground">
              Per spec §3.5 — what shows when the destination list is empty
              (cards with value 0 are still clickable; the empty list IS
              the proof).
            </p>
            <Textarea
              id="dd-empty-copy"
              value={emptyCopy}
              onChange={(e) => setEmptyCopy(e.target.value)}
              placeholder={codeDefault.emptyStateCopy}
              rows={3}
              disabled={!canEdit || saving}
            />
            <div className="flex items-center justify-between gap-2 pt-1">
              <DefaultBadge
                isOverride={row.overriddenFields.has('empty_state_copy')}
                defaultLabel={codeDefault.emptyStateCopy}
                onReset={() =>
                  resetSingleField(
                    buildPolicyKey(metric, 'empty_state_copy'),
                  )
                }
                canEdit={canEdit}
              />
              <Button
                size="sm"
                onClick={saveEmptyCopy}
                disabled={!canEdit || saving}
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                Save copy
              </Button>
            </div>
          </section>
        </div>

        <SheetFooter className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            onClick={resetAllOverrides}
            disabled={
              !canEdit || saving || row.overriddenFields.size === 0
            }
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Reset all overrides for this metric
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function DefaultBadge({
  isOverride,
  defaultLabel,
  onReset,
  canEdit,
}: {
  isOverride: boolean;
  defaultLabel: string;
  onReset: () => void;
  canEdit: boolean;
}) {
  if (!isOverride) {
    return (
      <p className="text-xs text-muted-foreground">
        Using code default:{' '}
        <code className="font-mono">{defaultLabel}</code>
      </p>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span>
        <Badge variant="default" className="mr-1">
          override
        </Badge>
        Default was{' '}
        <code className="font-mono text-muted-foreground">
          {defaultLabel}
        </code>
      </span>
      {canEdit && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onReset}
        >
          Reset to default
        </Button>
      )}
    </div>
  );
}
