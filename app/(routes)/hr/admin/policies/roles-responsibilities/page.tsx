'use client';

// =====================================================================
// /hr/admin/policies/roles-responsibilities — Wave 3 W3-M2
// =====================================================================
// Backed by `hr.roles_responsibilities` (scope=institution).
// JSONB shape: { designations: [{ role_code, title, aliases,
//   applies_to_institutions, reports_to, direct_reports,
//   external_form_ref, responsibilities }] }
// =====================================================================

import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

import { PolicyEditorShell } from '../_shared/policy-editor-shell';

interface Designation {
  role_code: string;
  title: string;
  aliases: string[];
  applies_to_institutions: string[];
  reports_to: string | null;
  direct_reports: string[];
  external_form_ref: string | null;
  responsibilities: string[];
}

interface RolesValue {
  designations: Designation[];
}

const EMPTY_DESIGNATION: Designation = {
  role_code: '',
  title: '',
  aliases: [],
  applies_to_institutions: [],
  reports_to: null,
  direct_reports: [],
  external_form_ref: null,
  responsibilities: [],
};

function parseValue(raw: unknown): RolesValue {
  const obj = (raw || {}) as Partial<RolesValue>;
  const list = Array.isArray(obj.designations) ? obj.designations : [];
  return {
    designations: list.map((d: Partial<Designation>) => ({
      role_code: typeof d.role_code === 'string' ? d.role_code : '',
      title: typeof d.title === 'string' ? d.title : '',
      aliases: Array.isArray(d.aliases) ? d.aliases.map(String) : [],
      applies_to_institutions: Array.isArray(d.applies_to_institutions)
        ? d.applies_to_institutions.map(String)
        : [],
      reports_to: typeof d.reports_to === 'string' ? d.reports_to : null,
      direct_reports: Array.isArray(d.direct_reports)
        ? d.direct_reports.map(String)
        : [],
      external_form_ref:
        typeof d.external_form_ref === 'string' ? d.external_form_ref : null,
      responsibilities: Array.isArray(d.responsibilities)
        ? d.responsibilities.map(String)
        : [],
    })),
  };
}

export default function RolesResponsibilitiesPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="HR Policy — Roles & Responsibilities">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
            { label: 'Roles & Responsibilities' },
          ]}
        />
        <PolicyEditorShell<RolesValue>
          policyKey="hr.roles_responsibilities"
          pageTitle="Roles & Responsibilities"
          pageBlurb="Designation hierarchy and per-role responsibilities for the selected institution. Edit titles, reporting lines, and responsibility lists. Changes save to draft first; publish to make live."
          defaultValue={{ designations: [] }}
          parseValue={parseValue}
          renderEditor={(value, onChange, disabled) => (
            <RolesEditor value={value} onChange={onChange} disabled={disabled} />
          )}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Editor — dynamic list of designation cards.
// ---------------------------------------------------------------------------

function RolesEditor({
  value,
  onChange,
  disabled,
}: {
  value: RolesValue;
  onChange: (next: RolesValue) => void;
  disabled: boolean;
}) {
  const designations = value.designations;

  function updateAt(idx: number, patch: Partial<Designation>) {
    const next = designations.map((d, i) => (i === idx ? { ...d, ...patch } : d));
    onChange({ designations: next });
  }

  function removeAt(idx: number) {
    onChange({ designations: designations.filter((_, i) => i !== idx) });
  }

  function moveAt(idx: number, delta: number) {
    const target = idx + delta;
    if (target < 0 || target >= designations.length) return;
    const next = [...designations];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ designations: next });
  }

  function addDesignation() {
    onChange({ designations: [...designations, { ...EMPTY_DESIGNATION }] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Designations ({designations.length})
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addDesignation}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add designation
        </Button>
      </div>

      {designations.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          No designations configured. Click "Add designation" to start.
        </p>
      )}

      <div className="space-y-3">
        {designations.map((d, idx) => (
          <DesignationCard
            key={`${d.role_code}-${idx}`}
            designation={d}
            disabled={disabled}
            onChange={(patch) => updateAt(idx, patch)}
            onRemove={() => removeAt(idx)}
            onMoveUp={idx > 0 ? () => moveAt(idx, -1) : null}
            onMoveDown={
              idx < designations.length - 1 ? () => moveAt(idx, 1) : null
            }
          />
        ))}
      </div>
    </div>
  );
}

function DesignationCard({
  designation: d,
  disabled,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  designation: Designation;
  disabled: boolean;
  onChange: (patch: Partial<Designation>) => void;
  onRemove: () => void;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
}) {
  const responsibilitiesText = useMemo(
    () => d.responsibilities.join('\n'),
    [d.responsibilities],
  );

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Role code</Label>
            <Input
              value={d.role_code}
              onChange={(e) => onChange({ role_code: e.target.value })}
              placeholder="e.g. hod"
              disabled={disabled}
              className="font-mono text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Title</Label>
            <Input
              value={d.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="e.g. Head of Department"
              disabled={disabled}
            />
          </div>
          <div>
            <Label className="text-xs">Aliases (comma-separated)</Label>
            <Input
              value={d.aliases.join(', ')}
              onChange={(e) =>
                onChange({
                  aliases: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="HOD, Head"
              disabled={disabled}
            />
          </div>
          <div>
            <Label className="text-xs">Reports to (role_code)</Label>
            <Input
              value={d.reports_to ?? ''}
              onChange={(e) => onChange({ reports_to: e.target.value || null })}
              placeholder="e.g. principal_iqac_chairman"
              disabled={disabled}
              className="font-mono text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Direct reports (comma-separated role_codes)</Label>
            <Input
              value={d.direct_reports.join(', ')}
              onChange={(e) =>
                onChange({
                  direct_reports: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="e.g. professor, assistant_professor"
              disabled={disabled}
              className="font-mono text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">External form ref (URL)</Label>
            <Input
              type="url"
              value={d.external_form_ref ?? ''}
              onChange={(e) =>
                onChange({ external_form_ref: e.target.value || null })
              }
              placeholder="https://forms.office.com/r/…"
              disabled={disabled}
            />
          </div>
        </div>

        <Separator />

        <div>
          <Label className="text-xs">
            Responsibilities ({d.responsibilities.length}) — one per line
          </Label>
          <textarea
            className="mt-1 w-full rounded-md border bg-background p-2 text-sm font-mono"
            rows={Math.max(4, d.responsibilities.length + 1)}
            value={responsibilitiesText}
            onChange={(e) =>
              onChange({
                responsibilities: e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="One responsibility per line"
            disabled={disabled}
          />
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onMoveUp ?? undefined}
              disabled={disabled || !onMoveUp}
            >
              ↑ Up
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onMoveDown ?? undefined}
              disabled={disabled || !onMoveDown}
            >
              ↓ Down
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={disabled}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
