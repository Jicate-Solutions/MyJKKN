'use client';

// ============================================================================
// Edit Access Dialog — create/update a consultant_portal_access_policy row.
// Created: 2026-05-13.
//
// Used by portal-access-data-table. Renders a form for rule_type,
// principal_type, principal_value, display_label, is_active, notes.
// Surfaces PG constraint errors verbatim (e.g. unique-index violation on
// duplicate (rule_type, principal_type, principal_value) combinations).
// ============================================================================

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PRINCIPAL_TYPE_OPTIONS,
  RULE_TYPE_OPTIONS,
  upsertAccessRule,
  type ConsultantPortalAccessRow,
  type PortalAccessPrincipalType,
  type PortalAccessRuleType,
} from '@/lib/services/admission/consultant-portal-access-service';

interface EditAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ConsultantPortalAccessRow | null;
  defaultRuleType: PortalAccessRuleType;
  onSaved: () => void;
}

interface FormState {
  rule_type: PortalAccessRuleType;
  principal_type: PortalAccessPrincipalType;
  principal_value: string;
  display_label: string;
  is_active: boolean;
  notes: string;
}

function emptyForm(defaultRuleType: PortalAccessRuleType): FormState {
  return {
    rule_type: defaultRuleType,
    principal_type: 'role',
    principal_value: '',
    display_label: '',
    is_active: true,
    notes: '',
  };
}

function principalPlaceholder(type: PortalAccessPrincipalType): string {
  switch (type) {
    case 'role':
      return 'e.g. super_admin, consultant, director';
    case 'permission':
      return 'e.g. admission.consultants.portal.view';
    case 'user':
      return 'profiles.id UUID';
  }
}

function principalHint(type: PortalAccessPrincipalType): string {
  switch (type) {
    case 'role':
      return 'A role_key string. Matched against profiles.role (legacy column) OR custom_roles.role_key (modern). Both are checked at runtime.';
    case 'permission':
      return 'A permission key. The user is matched if any of their custom_roles grants this permission.';
    case 'user':
      return 'A profiles.id UUID. Grants access to one specific person — useful for narrow, audited exceptions.';
  }
}

export function EditAccessDialog({
  open,
  onOpenChange,
  row,
  defaultRuleType,
  onSaved,
}: EditAccessDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm(defaultRuleType));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (row) {
      setForm({
        rule_type: row.rule_type,
        principal_type: row.principal_type,
        principal_value: row.principal_value,
        display_label: row.display_label,
        is_active: row.is_active,
        notes: row.notes ?? '',
      });
    } else {
      setForm(emptyForm(defaultRuleType));
    }
  }, [open, row, defaultRuleType]);

  const isEditing = row !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.principal_value.trim()) {
      toast.error('Principal value is required');
      return;
    }
    if (!form.display_label.trim()) {
      toast.error('Display label is required');
      return;
    }
    setSaving(true);
    try {
      await upsertAccessRule({
        id: row?.id,
        rule_type: form.rule_type,
        principal_type: form.principal_type,
        principal_value: form.principal_value.trim(),
        display_label: form.display_label.trim(),
        is_active: form.is_active,
        notes: form.notes.trim() ? form.notes.trim() : null,
      });
      toast.success(isEditing ? 'Rule updated' : 'Rule added');
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save rule';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit access rule' : 'Add access rule'}
          </DialogTitle>
          <DialogDescription>
            Grant or revoke consultant-portal access for a role, permission,
            or specific user. Changes apply on the next request after a 60-
            second cache miss.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rule_type">Rule type</Label>
            <Select
              value={form.rule_type}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, rule_type: v as PortalAccessRuleType }))
              }
              disabled={isEditing /* rule_type immutable on edit */}
            >
              <SelectTrigger id="rule_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RULE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {
                RULE_TYPE_OPTIONS.find((o) => o.value === form.rule_type)
                  ?.hint
              }
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="principal_type">Principal type</Label>
            <Select
              value={form.principal_type}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  principal_type: v as PortalAccessPrincipalType,
                }))
              }
              disabled={isEditing /* principal_type immutable on edit */}
            >
              <SelectTrigger id="principal_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRINCIPAL_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {principalHint(form.principal_type)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="principal_value">Value</Label>
            <Input
              id="principal_value"
              value={form.principal_value}
              onChange={(e) =>
                setForm((f) => ({ ...f, principal_value: e.target.value }))
              }
              placeholder={principalPlaceholder(form.principal_type)}
              disabled={isEditing /* immutable; turn off + add new instead */}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="display_label">Display label</Label>
            <Input
              id="display_label"
              value={form.display_label}
              onChange={(e) =>
                setForm((f) => ({ ...f, display_label: e.target.value }))
              }
              placeholder="e.g. Director (preview-as)"
              required
            />
            <p className="text-xs text-muted-foreground">
              Human-readable name shown in the table and audit log.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              placeholder="Optional context — when/why this rule was added"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label htmlFor="is_active" className="text-sm">
                Active
              </Label>
              <p className="text-xs text-muted-foreground">
                Inactive rules are kept as an audit record but ignored by the
                gate.
              </p>
            </div>
            <Switch
              id="is_active"
              checked={form.is_active}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, is_active: v }))
              }
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Add rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
