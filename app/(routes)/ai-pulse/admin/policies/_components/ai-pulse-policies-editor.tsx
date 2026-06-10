'use client';

// Created: 2026-05-04 — AI Pulse module v3 (Wave B.6 Policy Admin UI)
//
// Editor for ai_pulse_policies (22 rows). Super-admin only — enforced by
// both <SuperAdminOnly> parent guard and RLS WRITE policy on the table.
//
// Per row, renders an inline editor based on data_type:
//   - int / float    → <Input type="number"> with min/max constraints
//   - bool           → toggle button (true ⇆ false)
//   - time           → <Input type="time">
//   - string         → <Input type="text">
//   - enum           → <Select> populated from enum_options
//   - jsonb / array  → <Textarea> with JSON validation on save
//
// Pattern reference: alert-thresholds editor (counselor rules), but
// expanded for the heterogeneous data_type field — AI Pulse policies are
// not all numeric.

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  useAiPulsePoliciesList,
  useUpdateAiPulsePolicy,
  type AiPulsePolicyRow,
} from '@/lib/services/ai-pulse/policies-service';

export function AiPulsePoliciesEditor() {
  const { data, isLoading, error } = useAiPulsePoliciesList();

  if (isLoading) {
    return (
      <div className='space-y-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className='h-32 w-full' />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className='rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive'>
        Failed to load AI Pulse policies. Reload the page to retry.
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
        No policies found. Run migration <code>20260502_create_ai_pulse_events_extension.sql</code> to seed the 22 default rows.
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground'>
        <strong>22 super-admin-tunable policies.</strong> Changes take effect immediately for all 8 colleges. Each edit is audit-logged with timestamp + user. Locked decision references in <code>locked_by_q</code> column trace each non-default to the originating /interview question.
      </div>
      {data.map((policy) => (
        <PolicyRow key={policy.id} policy={policy} />
      ))}
    </div>
  );
}

function PolicyRow({ policy }: { policy: AiPulsePolicyRow }) {
  const [draft, setDraft] = useState<string>(JSON.stringify(policy.value_jsonb));
  const [isDirty, setIsDirty] = useState(false);
  const updateMutation = useUpdateAiPulsePolicy();

  const handleChange = (next: string) => {
    setDraft(next);
    setIsDirty(next !== JSON.stringify(policy.value_jsonb));
  };

  const handleSave = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      toast.error('Invalid JSON value');
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: policy.id, valueJsonb: parsed });
      toast.success(`Updated ${policy.config_key}`);
      setIsDirty(false);
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <CardTitle className='text-base'>{policy.display_name}</CardTitle>
            <CardDescription className='mt-1'>{policy.description}</CardDescription>
          </div>
          <div className='flex flex-col items-end gap-1 text-right'>
            <code className='rounded bg-muted px-2 py-0.5 text-xs'>{policy.config_key}</code>
            <span className='text-xs text-muted-foreground'>type: {policy.data_type}</span>
            {policy.locked_by_q && (
              <span className='text-xs text-muted-foreground'>locked: {policy.locked_by_q}</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <PolicyValueInput
          policy={policy}
          draftJson={draft}
          onChange={handleChange}
        />
      </CardContent>
      <CardFooter className='justify-end gap-2'>
        <Button
          onClick={handleSave}
          disabled={!isDirty || updateMutation.isPending}
          size='sm'
        >
          {updateMutation.isPending ? (
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          ) : (
            <Save className='mr-2 h-4 w-4' />
          )}
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

function PolicyValueInput({
  policy,
  draftJson,
  onChange,
}: {
  policy: AiPulsePolicyRow;
  draftJson: string;
  onChange: (next: string) => void;
}) {
  // Parse the current draft JSON to get the inner value for type-specific UI.
  let parsedValue: unknown = null;
  try {
    parsedValue = JSON.parse(draftJson);
  } catch {
    parsedValue = null;
  }

  // bool: toggle
  if (policy.data_type === 'bool') {
    const checked = parsedValue === true;
    return (
      <div className='flex items-center gap-2'>
        <Button
          variant={checked ? 'default' : 'outline'}
          size='sm'
          onClick={() => onChange(JSON.stringify(true))}
        >
          true
        </Button>
        <Button
          variant={!checked ? 'default' : 'outline'}
          size='sm'
          onClick={() => onChange(JSON.stringify(false))}
        >
          false
        </Button>
      </div>
    );
  }

  // int / float: numeric input with min/max from policy
  if (policy.data_type === 'int' || policy.data_type === 'float') {
    return (
      <div className='space-y-1'>
        <Input
          type='number'
          step={policy.data_type === 'int' ? 1 : 0.01}
          min={policy.min_value ?? undefined}
          max={policy.max_value ?? undefined}
          value={typeof parsedValue === 'number' ? parsedValue : ''}
          onChange={(e) => onChange(JSON.stringify(Number(e.target.value)))}
        />
        {(policy.min_value !== null || policy.max_value !== null) && (
          <p className='text-xs text-muted-foreground'>
            Range: {policy.min_value ?? '−∞'} – {policy.max_value ?? '+∞'}
          </p>
        )}
      </div>
    );
  }

  // time: HH:MM input
  if (policy.data_type === 'time') {
    const timeValue = typeof parsedValue === 'string' ? parsedValue : '';
    return (
      <Input
        type='time'
        value={timeValue}
        onChange={(e) => onChange(JSON.stringify(e.target.value))}
      />
    );
  }

  // enum: Select dropdown from enum_options
  if (policy.data_type === 'enum' && policy.enum_options && policy.enum_options.length > 0) {
    const current = typeof parsedValue === 'string' ? parsedValue : '';
    return (
      <Select value={current} onValueChange={(v) => onChange(JSON.stringify(v))}>
        <SelectTrigger>
          <SelectValue placeholder='Select…' />
        </SelectTrigger>
        <SelectContent>
          {policy.enum_options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // string: text input
  if (policy.data_type === 'string') {
    const stringValue = typeof parsedValue === 'string' ? parsedValue : '';
    return (
      <Input
        type='text'
        value={stringValue}
        onChange={(e) => onChange(JSON.stringify(e.target.value))}
      />
    );
  }

  // jsonb / array: raw JSON textarea
  return (
    <div className='space-y-1'>
      <Label htmlFor={`policy-${policy.id}`} className='text-xs text-muted-foreground'>
        Raw JSON value
      </Label>
      <Textarea
        id={`policy-${policy.id}`}
        rows={4}
        value={draftJson}
        onChange={(e) => onChange(e.target.value)}
        className='font-mono text-xs'
      />
    </div>
  );
}
