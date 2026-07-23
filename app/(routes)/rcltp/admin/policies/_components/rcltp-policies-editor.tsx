'use client';

// =====================================================================
// RcltpPoliciesEditor
// =====================================================================
// Director-facing editor for the rcltp.* rows in platform_policies.
//
// REUSES, does not reinvent:
//   * The typed-widget pattern from the PDE Clinical Reasoning policy
//     editor (app/(routes)/pde/admin/policies/clinical-reasoning) — it
//     dispatches on each row's ui_widget column and renders ui_consequence
//     + ui_cascade. We import its 5 widget components and its UI* types
//     verbatim so there is ONE widget implementation, not two.
//   * The platform_policies read/write goes through RcltpPoliciesService
//     (lib/services/rcltp/policies-service.ts), which follows the canonical
//     rcltp service convention (createClientSupabaseClient + static methods +
//     react-hot-toast).
//
// Difference from the clinical_reasoning editor: this one ALSO shows
// is_active=false rows. The MyJKKN-pending policies (band mastery threshold,
// composite scoring weights, NIPUN wpm targets) are seeded inactive with
// placeholder values until MyJKKN supplies validated numbers — the Director
// must still see and (eventually) activate them, so they cannot be hidden.
// Inactive rows are clearly badged "Inactive — awaiting MyJKKN".
//
// Caller scope: super_admin only (wrapped by <SuperAdminOnly> in page.tsx;
// platform_policies UPDATE RLS enforces it server-side too).
// =====================================================================

import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Database, Loader2, Save } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Reuse the EXISTING typed-widget components + types from the clinical
// reasoning module — single source of truth for ui_widget rendering.
import { NumberWidget } from '@/app/(routes)/pde/admin/policies/clinical-reasoning/_components/widgets/NumberWidget';
import { DropdownWidget } from '@/app/(routes)/pde/admin/policies/clinical-reasoning/_components/widgets/DropdownWidget';
import { TextareaWidget } from '@/app/(routes)/pde/admin/policies/clinical-reasoning/_components/widgets/TextareaWidget';
import { ToggleWidget } from '@/app/(routes)/pde/admin/policies/clinical-reasoning/_components/widgets/ToggleWidget';
import { MultiSelectWidget } from '@/app/(routes)/pde/admin/policies/clinical-reasoning/_components/widgets/MultiSelectWidget';

import {
  useRcltpPoliciesList,
  useUpdateRcltpPolicy,
  type RcltpPolicyRow,
} from '@/lib/services/rcltp/policies-service';

// ---------------------------------------------------------------------------
// Widget dispatcher — single source of truth for ui_widget -> Component.
// Mirrors the clinical_reasoning dispatcher; data_type='object' rows are
// seeded with ui_widget 'json'/'textarea', both handled by TextareaWidget.
// ---------------------------------------------------------------------------

function WidgetDispatcher({
  row,
  workingValue,
  onChange,
  disabled,
}: {
  row: RcltpPolicyRow;
  workingValue: unknown;
  onChange: (next: unknown) => void;
  disabled: boolean;
}) {
  switch (row.ui_widget) {
    case 'number':
      return <NumberWidget value={workingValue} onChange={onChange} disabled={disabled} />;
    case 'dropdown':
      return (
        <DropdownWidget
          value={workingValue}
          options={row.ui_options ?? []}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'textarea':
    case 'json':
      // 'json' covers data_type='object' rows (allocation map, wpm map).
      // TextareaWidget round-trips JSON via JSON.stringify when the value
      // is not a plain string, so the Director edits raw JSON for these.
      return (
        <TextareaWidget value={workingValue} onChange={onChange} disabled={disabled} />
      );
    case 'toggle':
      return <ToggleWidget value={workingValue} onChange={onChange} disabled={disabled} />;
    case 'multi_select':
      return (
        <MultiSelectWidget
          value={workingValue}
          options={row.ui_options ?? []}
          onChange={onChange}
          disabled={disabled}
        />
      );
    default:
      return (
        <div className='rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground'>
          Unsupported widget kind: <code>{row.ui_widget ?? 'null'}</code>. Edit
          this policy directly in Supabase or contact engineering to add a
          widget renderer.
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Single-policy edit card
// ---------------------------------------------------------------------------

function PolicyRowCard({ row }: { row: RcltpPolicyRow }) {
  const [working, setWorking] = useState<unknown>(row.value);
  const updateMutation = useUpdateRcltpPolicy();

  // For 'json'/'textarea' rows the widget hands back a STRING; parse it so we
  // store a real JSONB object, and surface invalid JSON instead of saving a
  // string where an object is expected.
  const expectsJson =
    (row.ui_widget === 'json' || row.ui_widget === 'textarea') &&
    row.data_type === 'object';

  const dirty = JSON.stringify(row.value) !== JSON.stringify(working);
  const saving = updateMutation.isPending;

  async function handleSave() {
    if (!dirty || saving) return;
    let toPersist: unknown = working;
    if (expectsJson && typeof working === 'string') {
      try {
        toPersist = JSON.parse(working);
      } catch {
        toast.error(`Invalid JSON for ${row.policy_key} — fix the value and try again.`);
        return;
      }
    }
    try {
      await updateMutation.mutateAsync({ policyKey: row.policy_key, value: toPersist });
      toast.success(`Saved: ${row.policy_key}. Effective immediately.`);
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function handleRevert() {
    setWorking(row.value);
  }

  const cascade = row.ui_cascade ?? [];

  return (
    <Card className={!row.is_active ? 'border-amber-400/60' : undefined}>
      <CardHeader className='pb-3'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <CardTitle className='text-base font-semibold'>
              {row.description ?? row.policy_key}
            </CardTitle>
            <CardDescription>
              Key: <code className='text-xs'>{row.policy_key}</code>
            </CardDescription>
          </div>
          {!row.is_active && (
            <Badge variant='outline' className='border-amber-500 text-amber-700 dark:text-amber-400'>
              Inactive — awaiting MyJKKN
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <WidgetDispatcher
          row={row}
          workingValue={working}
          onChange={setWorking}
          disabled={saving}
        />

        {row.ui_consequence && (
          <div className='rounded-md border-l-4 border-blue-500 bg-blue-50 p-3 text-xs text-blue-900 dark:bg-blue-950 dark:text-blue-100'>
            <strong className='block font-semibold'>What this affects:</strong>
            <span className='italic'>{row.ui_consequence}</span>
          </div>
        )}

        {cascade.length > 0 && (
          <div className='space-y-1.5'>
            <div className='text-xs font-medium text-muted-foreground'>
              Cascading effects:
            </div>
            <div className='flex flex-wrap gap-1.5'>
              {cascade.map((c, i) => (
                <Badge
                  key={`${row.id}-cascade-${i}`}
                  variant={
                    c.severity === 'high'
                      ? 'destructive'
                      : c.severity === 'medium'
                        ? 'default'
                        : 'secondary'
                  }
                  className='text-[10px]'
                >
                  {c.effect}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className='flex items-center justify-end gap-2 border-t pt-3'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={handleRevert}
            disabled={!dirty || saving}
          >
            Revert
          </Button>
          <Button
            type='button'
            size='sm'
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? (
              <Loader2 className='h-3.5 w-3.5 animate-spin mr-1' />
            ) : (
              <Save className='h-3.5 w-3.5 mr-1' />
            )}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main editor — groups by ui_category, renders one PolicyRowCard per row
// ---------------------------------------------------------------------------

// Stable display order for the rcltp categories (matches the seed's grouping).
const CATEGORY_ORDER = [
  'Assessment Scheduling',
  'Assessment Integrity',
  'Adaptive Practice',
  'Scoring',
  'Bands',
  'Voice & Audio',
  'Consent & Privacy',
  'Notifications',
  'Language',
];

export function RcltpPoliciesEditor() {
  const { data: rows, isLoading, error } = useRcltpPoliciesList();

  if (isLoading) {
    return (
      <div className='mt-6 space-y-4'>
        <Skeleton className='h-8 w-72' />
        <Skeleton className='h-48 w-full' />
        <Skeleton className='h-48 w-full' />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant='destructive' className='mt-6'>
        <AlertTriangle className='h-4 w-4' />
        <AlertTitle>Failed to load RCLTP policies</AlertTitle>
        <AlertDescription>
          Reload the page to retry. {error instanceof Error ? error.message : ''}
        </AlertDescription>
      </Alert>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <Alert className='mt-6'>
        <Database className='h-4 w-4' />
        <AlertTitle>No RCLTP policies seeded</AlertTitle>
        <AlertDescription>
          Expected rows under <code>rcltp.*</code>. Apply migration{' '}
          <code>20260614100000_rcltp_policies_seed.sql</code> via the Supabase
          Management API.
        </AlertDescription>
      </Alert>
    );
  }

  // Group by category.
  const grouped = new Map<string, RcltpPolicyRow[]>();
  for (const r of rows) {
    const cat = r.ui_category ?? 'Uncategorized';
    const bucket = grouped.get(cat) ?? [];
    bucket.push(r);
    grouped.set(cat, bucket);
  }

  const sortedCategories = [...grouped.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const inactiveCount = rows.filter((r) => !r.is_active).length;

  return (
    <div className='mt-6 space-y-8'>
      <Alert>
        <Database className='h-4 w-4' />
        <AlertTitle>RCLTP — Director Controls</AlertTitle>
        <AlertDescription>
          {rows.length} policies grouped into {sortedCategories.length}{' '}
          categories. Each policy takes effect immediately on save — no deploy
          required. These are the global defaults; per-institution overrides
          are read by the same <code>fn_get_policy</code> scope mechanism.
          {inactiveCount > 0 && (
            <>
              {' '}
              <strong>{inactiveCount}</strong> policy
              {inactiveCount === 1 ? ' is' : 'ies are'} inactive with placeholder
              values awaiting MyJKKN-validated numbers — the module uses its
              built-in defaults until an admin activates them.
            </>
          )}
        </AlertDescription>
      </Alert>

      {sortedCategories.map((category) => {
        const bucket = grouped.get(category) ?? [];
        return (
          <section key={category} className='space-y-3'>
            <h2 className='text-lg font-bold text-foreground'>{category}</h2>
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
              {bucket.map((row) => (
                <PolicyRowCard key={row.id} row={row} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
