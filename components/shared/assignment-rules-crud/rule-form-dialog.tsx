'use client';

// rule-form-dialog.tsx
// Create/Edit dialog for admission_assignment_rules.
// Mirrors: app/(routes)/admission/settings/assignment-rules/_components/row-actions.tsx
// Uses textarea for criteria/action JSONB — UX polish deferred to follow-up PR.
//
// Rule-type dropdown is sourced from the assignment_rule_type_registry table
// (Director's standing rule 2026-04-29 — every policy decision = config row).
// Adding a new rule strategy is a SQL row, not a code deploy.

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAssignmentRuleMutations } from '@/hooks/admission';
import { useRuleTypes } from '@/hooks/admission/use-rule-types';
import type {
  AssignmentRule,
  AssignmentRuleType,
  CreateAssignmentRuleInput,
  UpdateAssignmentRuleInput,
} from '@/lib/services/admission/assignment-rules-service';

// Fallback used only if the registry fetch fails — keeps the form usable.
// Mirrors the seeded keys in supabase/migrations/20260506181402_create_assignment_rule_type_registry.sql.
const FALLBACK_RULE_TYPES: { value: AssignmentRuleType; label: string }[] = [
  { value: 'program', label: 'Program' },
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'location', label: 'Location' },
  { value: 'score', label: 'Score' },
  { value: 'source', label: 'Source' },
  { value: 'workload', label: 'Workload' },
];

const DEFAULT_CRITERIA = JSON.stringify(
  [{ field: 'source', operator: 'equals', value: '' }],
  null,
  2
);

const DEFAULT_ACTION = JSON.stringify(
  { type: 'round_robin', fallback: 'unassigned' },
  null,
  2
);

interface RuleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
  /** If provided, pre-fills form for editing */
  rule?: AssignmentRule;
  onSuccess?: () => void;
}

export function RuleFormDialog({
  open,
  onOpenChange,
  institutionId,
  rule,
  onSuccess,
}: RuleFormDialogProps) {
  const isEditing = !!rule;
  const { createRule, updateRule, isCreating, isUpdating } =
    useAssignmentRuleMutations();
  const {
    ruleTypes: registryRuleTypes,
    isLoading: isLoadingRuleTypes,
    error: ruleTypesError,
  } = useRuleTypes();

  // Build the dropdown option list. Prefer registry rows; fall back to the
  // hardcoded list only when the registry fetch errored AND we have nothing
  // cached to render.
  const ruleTypeOptions: { value: string; label: string }[] = registryRuleTypes.length
    ? registryRuleTypes.map((r) => ({ value: r.rule_type_key, label: r.display_label }))
    : FALLBACK_RULE_TYPES.map((t) => ({ value: t.value, label: t.label }));

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('10');
  const [isActive, setIsActive] = useState(true);
  // ruleType holds whatever rule_type_key the registry exposes — kept as a
  // wider string so future custom keys (added via /admin/counselors/rule-types)
  // type-check without code changes. The known-union keys still satisfy this.
  const [ruleType, setRuleType] = useState<AssignmentRuleType | string>('round_robin');
  const [criteriaJson, setCriteriaJson] = useState(DEFAULT_CRITERIA);
  const [actionJson, setActionJson] = useState(DEFAULT_ACTION);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Populate form when editing
  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setDescription(rule.description ?? '');
      setPriority(String(rule.priority));
      setIsActive(rule.is_active);
      setRuleType(rule.type ?? 'round_robin');
      setCriteriaJson(JSON.stringify(rule.criteria, null, 2));
      setActionJson(JSON.stringify(rule.action, null, 2));
    } else {
      setName('');
      setDescription('');
      setPriority('10');
      setIsActive(true);
      setRuleType('round_robin');
      setCriteriaJson(DEFAULT_CRITERIA);
      setActionJson(DEFAULT_ACTION);
    }
    setJsonError(null);
  }, [rule, open]);

  const parseJson = (
    value: string,
    label: string
  ): unknown | null => {
    try {
      return JSON.parse(value);
    } catch {
      setJsonError(`Invalid JSON in ${label}`);
      return null;
    }
  };

  const handleSubmit = async () => {
    setJsonError(null);
    const criteria = parseJson(criteriaJson, 'Criteria');
    if (criteria === null) return;
    const action = parseJson(actionJson, 'Action');
    if (action === null) return;

    try {
      if (isEditing && rule) {
        const input: UpdateAssignmentRuleInput = {
          name,
          description: description || undefined,
          priority: Number(priority),
          is_active: isActive,
          criteria: criteria as AssignmentRule['criteria'],
          action: action as AssignmentRule['action'],
        };
        await updateRule.mutateAsync({ id: rule.id, input });
      } else {
        const input: CreateAssignmentRuleInput = {
          institution_id: institutionId,
          name,
          description: description || undefined,
          priority: Number(priority),
          is_active: isActive,
          criteria: criteria as AssignmentRule['criteria'],
          action: action as AssignmentRule['action'],
        };
        await createRule.mutateAsync(input);
      }
      onOpenChange(false);
      onSuccess?.();
    } catch {
      // Errors handled by mutation (toast)
    }
  };

  const isBusy = isCreating || isUpdating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Assignment Rule' : 'New Assignment Rule'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the rule details below.'
              : 'Create a new lead assignment rule for this institution.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Name */}
          <div className="grid gap-1.5">
            <Label htmlFor="rule-name">Rule Name *</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering leads to team A"
              disabled={isBusy}
            />
          </div>

          {/* Description */}
          <div className="grid gap-1.5">
            <Label htmlFor="rule-description">Description</Label>
            <Input
              id="rule-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              disabled={isBusy}
            />
          </div>

          {/* Priority + Type row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="rule-priority">Priority</Label>
              <Input
                id="rule-priority"
                type="number"
                min={1}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={isBusy}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-type">Rule Type</Label>
              <Select
                value={ruleType}
                onValueChange={(v) => setRuleType(v)}
                disabled={isBusy || isLoadingRuleTypes}
              >
                <SelectTrigger id="rule-type">
                  {isLoadingRuleTypes ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading…
                    </span>
                  ) : (
                    <SelectValue />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {ruleTypeOptions.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ruleTypesError && registryRuleTypes.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Could not load rule-type registry — showing default list.
                </p>
              )}
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="rule-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={isBusy}
            />
            <Label htmlFor="rule-active">Active</Label>
          </div>

          {/* Criteria JSONB */}
          <div className="grid gap-1.5">
            <Label htmlFor="rule-criteria">
              Criteria{' '}
              <span className="text-xs text-muted-foreground">(JSON array)</span>
            </Label>
            <Textarea
              id="rule-criteria"
              value={criteriaJson}
              onChange={(e) => setCriteriaJson(e.target.value)}
              className="font-mono text-xs min-h-[100px]"
              disabled={isBusy}
            />
          </div>

          {/* Action JSONB */}
          <div className="grid gap-1.5">
            <Label htmlFor="rule-action">
              Action{' '}
              <span className="text-xs text-muted-foreground">(JSON object)</span>
            </Label>
            <Textarea
              id="rule-action"
              value={actionJson}
              onChange={(e) => setActionJson(e.target.value)}
              className="font-mono text-xs min-h-[80px]"
              disabled={isBusy}
            />
          </div>

          {jsonError && (
            <p className="text-sm text-destructive">{jsonError}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isBusy}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isBusy || !name.trim()}>
            {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Save Changes' : 'Create Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
