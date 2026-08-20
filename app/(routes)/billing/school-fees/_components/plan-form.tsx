'use client';

// plan-form.tsx
//
// Shared create/edit form for one class's fee plan. Wraps FeeGridEditor with
// the plan name, a save action, and the lock rules.
//
// TERM COLUMNS COME FROM THE YEAR'S TERM CALENDAR, not from a constant. That
// keeps the grid and the due dates in step: if a school runs two terms, the
// editor shows two columns and generation raises two bills. When no calendar
// exists yet the editor falls back to the 3-term default and the page warns.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Lock, Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

import { useSchoolFeeHeads } from '@/hooks/school-fees/use-school-fee-heads';
import { useSchoolTermCalendars } from '@/hooks/school-fees/use-school-term-calendars';
import { useSchoolFeePlans } from '@/hooks/school-fees/use-school-fee-plans';

import {
  FeeGridEditor,
  editorRowsToItems,
  itemsToEditorRows,
  type FeeGridEditorRow,
} from './fee-grid-editor';
import { DEFAULT_TERM_COUNT, type SchoolFeePlanWithItems } from '@/types/school-fees';

interface PlanFormProps {
  mode: 'create' | 'edit';
  institutionId: string;
  academicYearId: string;
  programId: string;
  className: string;
  yearName: string;
  plan?: SchoolFeePlanWithItems | null;
  canEdit: boolean;
}

export function PlanForm({
  mode,
  institutionId,
  academicYearId,
  programId,
  className,
  yearName,
  plan,
  canEdit,
}: PlanFormProps) {
  const router = useRouter();
  const { heads, loading: loadingHeads } = useSchoolFeeHeads();
  const { terms: calendarTerms } = useSchoolTermCalendars(institutionId, academicYearId);
  const { createPlan, updatePlan, loading: saving } = useSchoolFeePlans();

  const isLocked = Boolean(plan?.locked_at);
  const editable = canEdit && !isLocked;

  const termNumbers = useMemo(() => {
    if (calendarTerms.length > 0) {
      return [...calendarTerms].map((t) => t.term_number).sort((a, b) => a - b);
    }
    return Array.from({ length: DEFAULT_TERM_COUNT }, (_, i) => i + 1);
  }, [calendarTerms]);

  const [name, setName] = useState(plan?.name ?? `${className} — ${yearName}`);
  const [notes, setNotes] = useState(plan?.notes ?? '');
  const [rows, setRows] = useState<FeeGridEditorRow[]>(() =>
    plan ? itemsToEditorRows(plan.items, []) : [],
  );

  // Heads load after the first paint, so a plan opened for edit initially has
  // rows whose category_name came from the joined item rather than the
  // catalogue. Fill in any gaps once heads arrive — derived, not an effect.
  const displayRows = useMemo(() => {
    if (heads.length === 0) return rows;
    return rows.map((r) =>
      r.category_name === 'Unknown head'
        ? {
            ...r,
            category_name:
              heads.find((h) => h.id === r.billing_category_id)?.category_name ?? r.category_name,
          }
        : r,
    );
  }, [rows, heads]);

  const items = useMemo(() => editorRowsToItems(displayRows, termNumbers), [displayRows, termNumbers]);

  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);

    if (!name.trim()) {
      setError('Give the plan a name.');
      return;
    }
    if (items.length === 0) {
      setError('Add at least one fee head with an amount before saving.');
      return;
    }

    try {
      if (mode === 'create') {
        await createPlan({
          institution_id: institutionId,
          program_id: programId,
          academic_year_id: academicYearId,
          name: name.trim(),
          status: 'draft',
          notes: notes.trim() || null,
          items,
        });
      } else if (plan) {
        await updatePlan(plan.id, { name: name.trim(), notes: notes.trim() || null, items });
      }
      router.push('/billing/school-fees');
    } catch (e) {
      // The hook already toasts; keep the message on screen too, because the
      // grid is long enough that a toast can scroll out of view.
      setError(e instanceof Error ? e.message : 'Failed to save the fee plan');
    }
  }

  return (
    <div className="space-y-6">
      {isLocked ? (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertTitle>This plan is locked</AlertTitle>
          <AlertDescription>
            Bills have already been generated from it, so the amounts are frozen. Use{' '}
            <strong>New version</strong> on the plan list to change them — the existing bills stay
            intact and unpaid ones can be re-issued from the new version.
          </AlertDescription>
        </Alert>
      ) : null}

      {calendarTerms.length === 0 ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>No term calendar for this year</AlertTitle>
          <AlertDescription>
            The grid is showing the default {DEFAULT_TERM_COUNT} terms. Set the term calendar so the
            columns match the school&apos;s real terms and bills get due dates.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex flex-wrap items-center gap-2">
            {className}
            <Badge variant="outline">{yearName}</Badge>
            {plan ? <Badge variant="secondary">v{plan.version}</Badge> : null}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plan-name">Plan name</Label>
              <Input
                id="plan-name"
                value={name}
                disabled={!editable}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-notes">Notes (optional)</Label>
              <Textarea
                id="plan-notes"
                rows={2}
                value={notes}
                disabled={!editable}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {loadingHeads ? (
            <p className="text-sm text-muted-foreground">Loading fee heads…</p>
          ) : (
            <FeeGridEditor
              heads={heads}
              terms={termNumbers}
              rows={displayRows}
              canEdit={editable}
              onChange={setRows}
            />
          )}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => router.push('/billing/school-fees')}>
              Back to plans
            </Button>
            <div className="flex-1" />
            <Button onClick={handleSave} disabled={!editable || saving}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? 'Saving…' : mode === 'create' ? 'Create draft plan' : 'Save changes'}
            </Button>
          </div>

          {!canEdit ? (
            <p className="text-xs text-muted-foreground">
              You have read-only access. Editing fee plans requires the
              <code className="mx-1">school_fees.manage</code> permission.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
