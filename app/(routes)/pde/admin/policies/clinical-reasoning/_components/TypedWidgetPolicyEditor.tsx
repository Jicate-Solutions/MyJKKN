'use client';

// =====================================================================
// TypedWidgetPolicyEditor
// =====================================================================
// Reusable typed-widget editor for platform_policies rows. Reads each
// row's ui_widget and dispatches to the matching widget component.
// Each row also renders ui_consequence (warning box) + ui_cascade
// (effect chips). Groups rows by ui_category.
//
// Per reference_prototype_policies_typed_widget_metadata.md — widget
// switching keyed off ui_widget. Per
// feedback_director_calibrates_tighter_than_recommended.md — every
// save records updated_by + updated_at for audit survival.
//
// Caller scope: Director + institution_admin only (wrapped by
// <SuperAdminOnly> in page.tsx).
// =====================================================================

import { useState } from 'react';
import { AlertTriangle, Database, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

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

import {
  useClinicalReasoningPolicies,
  type ClinicalReasoningPolicyRow,
} from '@/hooks/admin/use-clinical-reasoning-policies';

import { NumberWidget } from './widgets/NumberWidget';
import { DropdownWidget } from './widgets/DropdownWidget';
import { TextareaWidget } from './widgets/TextareaWidget';
import { ToggleWidget } from './widgets/ToggleWidget';
import { MultiSelectWidget } from './widgets/MultiSelectWidget';

// ---------------------------------------------------------------------------
// Widget dispatcher — single source of truth for ui_widget -> Component
// ---------------------------------------------------------------------------

interface WidgetDispatcherProps {
  row: ClinicalReasoningPolicyRow;
  workingValue: unknown;
  onChange: (next: unknown) => void;
  disabled: boolean;
}

function WidgetDispatcher({
  row,
  workingValue,
  onChange,
  disabled,
}: WidgetDispatcherProps) {
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
        <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
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

function PolicyRowCard({
  row,
  onSave,
}: {
  row: ClinicalReasoningPolicyRow;
  onSave: (newValue: unknown) => Promise<void>;
}) {
  const [working, setWorking] = useState<unknown>(row.value);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(row.value) !== JSON.stringify(working);

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(working);
      toast.success(`Saved: ${row.policy_key}. Effective immediately.`);
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  function handleRevert() {
    setWorking(row.value);
  }

  // Render cascade chips by severity
  const cascade = row.ui_cascade ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          {row.description ?? row.policy_key}
        </CardTitle>
        <CardDescription>
          Key: <code className="text-xs">{row.policy_key}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <WidgetDispatcher
          row={row}
          workingValue={working}
          onChange={setWorking}
          disabled={saving}
        />

        {row.ui_consequence && (
          <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 p-3 text-xs text-blue-900 dark:bg-blue-950 dark:text-blue-100">
            <strong className="block font-semibold">What this affects:</strong>
            <span className="italic">{row.ui_consequence}</span>
          </div>
        )}

        {cascade.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Cascading effects:
            </div>
            <div className="flex flex-wrap gap-1.5">
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
                  className="text-[10px]"
                >
                  {c.effect}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRevert}
            disabled={!dirty || saving}
          >
            Revert
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main editor — groups by category, renders one PolicyRowCard per row
// ---------------------------------------------------------------------------

export function TypedWidgetPolicyEditor() {
  const { loading, error, groupedByCategory, savePolicy, rows } =
    useClinicalReasoningPolicies();

  if (loading) {
    return (
      <div className="mt-6 space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Failed to load clinical_reasoning policies</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (rows.length === 0) {
    return (
      <Alert className="mt-6">
        <Database className="h-4 w-4" />
        <AlertTitle>No clinical_reasoning policies seeded</AlertTitle>
        <AlertDescription>
          Expected 8+ rows under <code>clinical_reasoning.*</code>. Apply
          migration{' '}
          <code>20260522_clinical_reasoning_policies_seed.sql</code> via
          Supabase Management API.
        </AlertDescription>
      </Alert>
    );
  }

  const categoryOrder = [
    'Caps & Limits',
    'AI Provider',
    'AI Behavior',
    'Scoring',
    'Accreditation',
    'Faculty Workflow',
  ];
  const sortedCategories = [...groupedByCategory.keys()].sort((a, b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <div className="mt-6 space-y-8">
      <Alert>
        <Database className="h-4 w-4" />
        <AlertTitle>PDE Clinical Reasoning — Director Controls</AlertTitle>
        <AlertDescription>
          {rows.length} policies grouped into {sortedCategories.length}{' '}
          categories. Each policy takes effect immediately on save — no deploy
          required. Every change is audit-stamped with your identity.
        </AlertDescription>
      </Alert>

      {sortedCategories.map((category) => {
        const bucket = groupedByCategory.get(category) ?? [];
        return (
          <section key={category} className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">{category}</h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {bucket.map((row) => (
                <PolicyRowCard
                  key={row.id}
                  row={row}
                  onSave={(newValue) => savePolicy(row.policy_key, newValue)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
