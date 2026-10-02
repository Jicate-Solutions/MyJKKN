'use client';

/**
 * The Director's amounts for "Suggest a revised salary" on Employee Salaries —
 * one box per department (his ruling of 29 September 2026).
 *
 *   - Each box is the rupees a month added for each whole year at JKKN, for
 *     everybody in that department. An EMPTY box means NO suggestion for
 *     anybody in it. A blank box is saved as "not set", never as 0.
 *   - Years before JKKN count at half that amount, only when recorded.
 *   - A doctorate adds nothing, and the figure is not capped at the band top.
 *
 * WHO. Super admins can open this page and look. ONLY the Director list may
 * change it (ruling of 30 September 2026): everyone else sees the boxes
 * disabled, a plain note, and no save buttons. The server refuses a save from
 * anyone else in any case (the route, and the database guard behind it).
 *
 * Same lifecycle as the other HR policy editors: give a reason of at least 5
 * characters, Save draft or Publish; every save goes to hr_policy_audit_log.
 * Everything goes through /api/hr/payroll/salary-suggestion-rule, never a
 * browser read of the policy table, because the amounts are pay figures.
 *
 * Saving here changes nobody's pay. It only changes what the Suggest panel
 * works out.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, Info, Lock, RotateCcw, Save, Search, Send } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useSalarySuggestionRule,
  useSaveSalarySuggestionRule,
  type RuleDepartment,
  type RuleRow,
} from '@/hooks/hr/use-salary-suggestion-rule';
import { isSalarySuggestionRuleEmpty, parseSalarySuggestionRule } from '@/lib/hr/salary-suggestion';
import { formToRule, ruleToForm, type RuleForm } from '@/lib/hr/salary-suggestion-rule-form';

function statusOf(row: RuleRow | null): { label: string; tone: 'default' | 'secondary' | 'outline' } {
  if (!row) return { label: 'Not set', tone: 'outline' };
  if (row.publicationState === 'draft_only') return { label: 'Draft saved, not published', tone: 'secondary' };
  const blank = isSalarySuggestionRuleEmpty(parseSalarySuggestionRule(row.value));
  if (row.publicationState === 'draft_pending') {
    return { label: blank ? 'Not set, newer draft waiting' : 'Published, newer draft waiting', tone: 'secondary' };
  }
  return blank ? { label: 'Not set', tone: 'outline' } : { label: 'Published', tone: 'default' };
}

function groupByCollege(departments: RuleDepartment[]): Array<{ college: string; items: RuleDepartment[] }> {
  const groups = new Map<string, RuleDepartment[]>();
  for (const d of departments) {
    const list = groups.get(d.institutionName) ?? [];
    list.push(d);
    groups.set(d.institutionName, list);
  }
  return Array.from(groups, ([college, items]) => ({ college, items }));
}

export function SalarySuggestionRuleEditor() {
  const { data, isLoading, error } = useSalarySuggestionRule({ enabled: true });
  const save = useSaveSalarySuggestionRule();

  const [form, setForm] = useState<RuleForm | null>(null);
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState('');

  const row = data?.row ?? null;
  const canEdit = data?.canEdit === true;
  const departments = useMemo(() => data?.departments ?? [], [data]);
  const names = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, `${d.name} (${d.institutionName})`])),
    [departments]
  );

  // What is stored: the pending draft when there is one, else the published rule.
  const stored = useMemo(() => ruleToForm(row ? (row.draftValue ?? row.value) : null), [row]);
  const working = form ?? stored;
  const dirty = form !== null;
  const { rule, errors } = formToRule(working, names);
  const reasonOk = reason.trim().length >= 5;
  const canSave = canEdit && dirty && reasonOk && errors.length === 0 && !save.isPending;
  // A saved draft can be published as it stands, without touching a box.
  const hasDraft = row !== null && row.publicationState !== 'published';
  const canPublish = canEdit && (dirty || hasDraft) && reasonOk && errors.length === 0 && !save.isPending;
  const status = statusOf(row);

  const filled = departments.filter((d) => (working.byDepartment[d.id] ?? '').trim() !== '').length;
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? departments.filter((d) => `${d.name} ${d.institutionName}`.toLowerCase().includes(needle))
    : departments;

  function setAmount(id: string, text: string) {
    setForm({ ...working, byDepartment: { ...working.byDepartment, [id]: text } });
  }

  async function persist(action: 'save_draft' | 'publish') {
    try {
      const res = await save.mutateAsync({ action, rule, reason: reason.trim() });
      setForm(null);
      setReason('');
      if (res.auditError) {
        toast.error(`Saved, but the change could not be written to the audit log: ${res.auditError}`);
      } else {
        toast.success(action === 'publish' ? 'Published.' : 'Draft saved.');
      }
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (isLoading) {
    return (
      <div className='mt-6 space-y-4'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-48 w-full' />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant='destructive' className='mt-6'>
        <AlertTriangle className='h-4 w-4' />
        <AlertTitle>Could not load the amounts</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='mt-6 space-y-6'>
      <Alert>
        <Info className='h-4 w-4' />
        <AlertTitle>How a suggested salary is worked out</AlertTitle>
        <AlertDescription>
          <p>
            It starts from the band floor for the person&apos;s job title, then adds the amount below for
            each whole year at JKKN in their department. Years before JKKN, when they are recorded, count at
            half that amount. A doctorate adds nothing. A figure above the top of the band is kept, with a
            red warning.
          </p>
          <p className='mt-1'>
            An empty box means no suggestion for anybody in that department. A 0 means a year at JKKN adds
            nothing there. It changes nobody&apos;s pay.
          </p>
        </AlertDescription>
      </Alert>

      {!canEdit && (
        <Alert data-testid='read-only-note'>
          <Lock className='h-4 w-4' />
          <AlertTitle>You can look only</AlertTitle>
          <AlertDescription>
            Only the Director can change these amounts. The boxes below show what is saved.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <CardTitle>Amount per year at JKKN, by department</CardTitle>
              <CardDescription>
                Rupees a month for each whole year at JKKN. {filled} of {departments.length} departments have
                an amount.
              </CardDescription>
            </div>
            <Badge variant={status.tone} data-testid='rule-status'>
              {status.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='relative max-w-sm'>
            <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder='Find a department or college'
              aria-label='Find a department or college'
              className='pl-8'
            />
          </div>

          {departments.length === 0 && (
            <p className='text-sm text-muted-foreground'>No active departments were found in the HR colleges.</p>
          )}

          {groupByCollege(shown).map((group) => (
            <section key={group.college} className='space-y-2'>
              <h3 className='text-sm font-semibold'>{group.college || 'College not recorded'}</h3>
              <div className='divide-y rounded-md border'>
                {group.items.map((d) => {
                  const inputId = `dept-${d.id}`;
                  return (
                    <div key={d.id} className='flex flex-wrap items-center justify-between gap-3 px-3 py-2'>
                      <Label htmlFor={inputId} className='text-sm font-normal'>
                        {d.name}
                      </Label>
                      <Input
                        id={inputId}
                        inputMode='decimal'
                        placeholder='Not set'
                        value={working.byDepartment[d.id] ?? ''}
                        disabled={!canEdit}
                        onChange={(e) => setAmount(d.id, e.target.value)}
                        className='w-full max-w-[10rem] tabular-nums sm:w-40'
                        data-testid='department-amount'
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <div className='space-y-1 border-t pt-6'>
            <Label htmlFor='round-to' className='text-xs'>
              Round the figure to the nearest
            </Label>
            <Input
              id='round-to'
              inputMode='decimal'
              value={working.roundTo}
              placeholder='100'
              disabled={!canEdit}
              onChange={(e) => setForm({ ...working, roundTo: e.target.value })}
              className='max-w-xs'
            />
            <p className='text-xs text-muted-foreground'>Blank rounds to the nearest ₹100.</p>
          </div>

          {errors.length > 0 && (
            <Alert variant='destructive'>
              <AlertTriangle className='h-4 w-4' />
              <AlertDescription>
                {errors.map((e) => (
                  <p key={e}>{e}</p>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {canEdit && (
            <>
              <div className='space-y-2 border-t pt-4'>
                <Label htmlFor='reason'>
                  Reason for change <span className='text-destructive'>*</span>
                </Label>
                <Textarea
                  id='reason'
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder='Why you are making this change (at least 5 characters). It is kept in the audit log.'
                  rows={2}
                />
                {(dirty || hasDraft) && !reasonOk && (
                  <p className='text-xs text-destructive'>Reason must be at least 5 characters.</p>
                )}
              </div>

              <div className='flex flex-wrap items-center justify-end gap-2 border-t pt-4'>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() => {
                    setForm(null);
                    setReason('');
                  }}
                  disabled={!dirty || save.isPending}
                >
                  <RotateCcw className='mr-1 h-3.5 w-3.5' />
                  Revert
                </Button>
                <Button type='button' variant='outline' size='sm' onClick={() => persist('save_draft')} disabled={!canSave}>
                  <Save className='mr-1 h-3.5 w-3.5' />
                  {save.isPending ? 'Saving…' : 'Save draft'}
                </Button>
                <Button type='button' size='sm' onClick={() => persist('publish')} disabled={!canPublish}>
                  <Send className='mr-1 h-3.5 w-3.5' />
                  Publish
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
