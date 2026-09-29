'use client';

/**
 * The Director's rule for "Suggest a revised salary" on Employee Salaries.
 *
 * Same lifecycle as the other HR policy editors (PolicyEditorShell): pick a
 * scope, edit, give a reason of at least 5 characters, Save draft or Publish;
 * every save is written to hr_policy_audit_log. Two differences, because this
 * rule starts with NO rows at all:
 *   - a scope can be group-wide (every college without its own rule), and the
 *     first save creates the row;
 *   - everything goes through /api/hr/payroll/salary-suggestion-rule, never a
 *     browser read of the policy table, because the rule holds rupee amounts.
 *
 * A BLANK BOX IS SAVED AS "NOT SET", NEVER AS 0 (formToRule). The suggestion
 * treats a missing amount as "counts nothing and says so", and a rule with no
 * amounts at all as "rule not set".
 *
 * Saving here changes nobody's pay. It only changes what the Suggest panel
 * works out.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, Info, Plus, RotateCcw, Save, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  useSalarySuggestionRule,
  useSaveSalarySuggestionRule,
  type RuleRow,
} from '@/hooks/hr/use-salary-suggestion-rule';
import {
  SUGGESTION_EXTRA_SOURCES,
  isSalarySuggestionRuleEmpty,
  parseSalarySuggestionRule,
} from '@/lib/hr/salary-suggestion';
import {
  blankExtra,
  formToRule,
  ruleToForm,
  type RuleForm,
  type RuleFormExtra,
} from '@/lib/hr/salary-suggestion-rule-form';

const GROUP = 'group';

function statusOf(
  row: RuleRow | undefined,
  isGroup: boolean
): { label: string; tone: 'default' | 'secondary' | 'outline' } {
  if (!row) return { label: 'Not set', tone: 'outline' };
  if (row.publicationState === 'draft_only') return { label: 'Draft saved, not published', tone: 'secondary' };
  // A published row with no amount in it is "not set", and for a college it
  // means the group-wide rule applies — say that rather than "Published".
  const blank = isSalarySuggestionRuleEmpty(parseSalarySuggestionRule(row.value));
  if (row.publicationState === 'draft_pending') {
    return {
      label: blank ? 'Not set, newer draft waiting' : 'Published, newer draft waiting',
      tone: 'secondary',
    };
  }
  if (blank) {
    return { label: isGroup ? 'Not set' : 'Not set — the group-wide rule applies', tone: 'outline' };
  }
  return { label: 'Published', tone: 'default' };
}

function MoneyField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder = 'Not set',
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className='space-y-1'>
      <Label htmlFor={id} className='text-xs'>
        {label}
      </Label>
      <Input
        id={id}
        inputMode='decimal'
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className='max-w-xs'
      />
      <p className='text-xs text-muted-foreground'>{hint}</p>
    </div>
  );
}

export function SalarySuggestionRuleEditor() {
  const { data, isLoading, error } = useSalarySuggestionRule({ enabled: true });
  const save = useSaveSalarySuggestionRule();

  const [scope, setScope] = useState<string>(GROUP);
  const [form, setForm] = useState<RuleForm | null>(null);
  const [reason, setReason] = useState('');

  const row = useMemo(
    () =>
      (data?.rows ?? []).find((r) =>
        scope === GROUP ? r.scopeType === 'global' : r.scopeType === 'institution' && r.scopeId === scope
      ),
    [data, scope]
  );

  // What is stored: the pending draft when there is one, else the published rule.
  const stored = useMemo(
    () => ruleToForm(row ? (row.draftValue ?? row.value) : null),
    [row]
  );
  const working = form ?? stored;
  const dirty = form !== null;
  const { rule, errors } = formToRule(working);
  const reasonOk = reason.trim().length >= 5;
  const canSave = dirty && reasonOk && errors.length === 0 && !save.isPending;
  // A saved draft can be published as it stands, without touching a field.
  const hasDraft = row !== undefined && row.publicationState !== 'published';
  const canPublish = (dirty || hasDraft) && reasonOk && errors.length === 0 && !save.isPending;
  const status = statusOf(row, scope === GROUP);

  function edit(next: Partial<RuleForm>) {
    setForm({ ...working, ...next });
  }
  function editExtra(i: number, next: Partial<RuleFormExtra>) {
    const extras = working.extras.map((e, j) => {
      if (j !== i) return e;
      const merged = { ...e, ...next };
      // A doctorate always needs the Director's approval (18 Sep 2026 ruling).
      if (merged.source === 'doctorate') merged.needsApproval = true;
      return merged;
    });
    edit({ extras });
  }

  function changeScope(next: string) {
    setScope(next);
    setForm(null);
    setReason('');
  }

  async function persist(action: 'save_draft' | 'publish') {
    try {
      const res = await save.mutateAsync({ scope, action, rule, reason: reason.trim() });
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
        <AlertTitle>Could not load the rule</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='mt-6 space-y-6'>
      <Alert>
        <Info className='h-4 w-4' />
        <AlertTitle>Salary suggestion rule</AlertTitle>
        <AlertDescription>
          How the &ldquo;Suggest a revised salary&rdquo; action on Employee Salaries works out a figure:
          it starts from the band floor for the person&apos;s job title and adds what you set here.
          It changes nobody&apos;s pay. A blank box means &ldquo;not set&rdquo;, not 0.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Which colleges</CardTitle>
          <CardDescription>
            The group-wide rule applies to every college that has not published one of its own.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={scope} onValueChange={changeScope}>
            <SelectTrigger className='max-w-md' aria-label='Which colleges'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GROUP}>Group-wide (every college without its own)</SelectItem>
              {(data?.institutions ?? []).map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <CardTitle>The rule</CardTitle>
              <CardDescription>
                {scope === GROUP
                  ? 'For every college without its own rule.'
                  : 'For this college only. Leave every amount blank to use the group-wide rule.'}
              </CardDescription>
            </div>
            <Badge variant={status.tone} data-testid='rule-status'>
              {status.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className='space-y-8'>
          <section className='space-y-4'>
            <MoneyField
              id='per-year-jkkn'
              label='Rupees a month for each whole year at JKKN'
              hint={"Counted from each person's date of joining."}
              value={working.perYearAtJkkn}
              onChange={(v) => edit({ perYearAtJkkn: v })}
            />

            <div className='flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3'>
              <div>
                <div className='text-sm font-medium'>Count experience before JKKN</div>
                <p className='mt-0.5 text-xs text-muted-foreground'>
                  Only when it is recorded on their profile. The profile holds total years;
                  the years at JKKN are taken off it. A person with nothing recorded is never
                  treated as having none.
                </p>
              </div>
              <Switch
                checked={working.priorCounts}
                onCheckedChange={(c) => edit({ priorCounts: c })}
                aria-label='Count experience before JKKN'
              />
            </div>

            <MoneyField
              id='per-year-prior'
              label='Rupees a month for each year before JKKN'
              hint='Used only when the switch above is on.'
              value={working.perYearPrior}
              onChange={(v) => edit({ perYearPrior: v })}
            />
          </section>

          <section className='space-y-3 border-t pt-6'>
            <div>
              <Label className='text-sm font-semibold'>Other things that count</Label>
              <p className='text-xs text-muted-foreground'>
                A doctorate always needs your approval case by case: it is shown as
                &ldquo;eligible&rdquo; and never added to the figure on its own.
              </p>
            </div>

            {working.extras.length === 0 && (
              <p className='text-sm text-muted-foreground'>Nothing else counts yet.</p>
            )}

            {working.extras.map((extra, i) => (
              <div key={i} className='grid gap-3 rounded-md border p-3 sm:grid-cols-2'>
                <div className='space-y-1'>
                  <Label htmlFor={`extra-label-${i}`} className='text-xs'>
                    Name
                  </Label>
                  <Input
                    id={`extra-label-${i}`}
                    value={extra.label}
                    placeholder='e.g. Doctorate'
                    onChange={(e) => editExtra(i, { label: e.target.value })}
                  />
                </div>
                <div className='space-y-1'>
                  <Label className='text-xs'>What to check</Label>
                  <Select value={extra.source} onValueChange={(v) => editExtra(i, { source: v })}>
                    <SelectTrigger aria-label={`What to check for item ${i + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUGGESTION_EXTRA_SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-1'>
                  <Label htmlFor={`extra-amount-${i}`} className='text-xs'>
                    Rupees a month
                  </Label>
                  <Input
                    id={`extra-amount-${i}`}
                    inputMode='decimal'
                    placeholder='Not set'
                    value={extra.amount}
                    onChange={(e) => editExtra(i, { amount: e.target.value })}
                  />
                </div>
                {extra.source === 'research_papers' && (
                  <div className='space-y-1'>
                    <Label htmlFor={`extra-min-${i}`} className='text-xs'>
                      At least this many papers
                    </Label>
                    <Input
                      id={`extra-min-${i}`}
                      inputMode='numeric'
                      placeholder='1'
                      value={extra.minCount}
                      onChange={(e) => editExtra(i, { minCount: e.target.value })}
                    />
                  </div>
                )}
                <div className='flex items-center justify-between gap-3 sm:col-span-2'>
                  <label className='flex items-center gap-2 text-sm'>
                    <Switch
                      checked={extra.needsApproval}
                      disabled={extra.source === 'doctorate'}
                      onCheckedChange={(c) => editExtra(i, { needsApproval: c })}
                      aria-label={`Item ${i + 1} needs the Director's approval`}
                    />
                    Needs the Director&apos;s approval (not added to the figure)
                  </label>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={() => edit({ extras: working.extras.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className='mr-1 h-3.5 w-3.5' />
                    Remove
                  </Button>
                </div>
              </div>
            ))}

            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => edit({ extras: [...working.extras, blankExtra()] })}
            >
              <Plus className='mr-1 h-3.5 w-3.5' />
              Add something that counts
            </Button>
          </section>

          <section className='space-y-4 border-t pt-6'>
            <div className='flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3'>
              <div>
                <div className='text-sm font-medium'>Never suggest above the band maximum</div>
                <p className='mt-0.5 text-xs text-muted-foreground'>
                  When on, a figure above the top of the person&apos;s band is brought down to it.
                </p>
              </div>
              <Switch
                checked={working.capAtBandMax}
                onCheckedChange={(c) => edit({ capAtBandMax: c })}
                aria-label='Never suggest above the band maximum'
              />
            </div>
            <MoneyField
              id='round-to'
              label='Round the figure to the nearest'
              hint='Blank rounds to the nearest ₹100.'
              value={working.roundTo}
              placeholder='100'
              onChange={(v) => edit({ roundTo: v })}
            />
          </section>

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
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => persist('save_draft')}
              disabled={!canSave}
            >
              <Save className='mr-1 h-3.5 w-3.5' />
              {save.isPending ? 'Saving…' : 'Save draft'}
            </Button>
            <Button type='button' size='sm' onClick={() => persist('publish')} disabled={!canPublish}>
              <Send className='mr-1 h-3.5 w-3.5' />
              Publish
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
