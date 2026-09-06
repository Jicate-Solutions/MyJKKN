'use client';

// =====================================================================
// /hr/admin/policies/grievance-cell — Wave 3 W3-M6b
// =====================================================================
// Backed by `hr.grievance_cell` (scope=institution; classification=major).
// JSONB shape (spec §31):
//   {
//     "dept_level_constituted_by": "HOD",
//     "institution_level_constituted_by": "Principal",
//     "gic": {
//       "chairperson": "Principal",
//       "member_composition": "per_statutes",
//       "against_workplace_harassment": boolean
//     }
//   }
// =====================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import { PolicyEditorShell } from '../_shared/policy-editor-shell';

export const navMeta = {
  label: 'Grievance Cell',
  icon: 'ShieldAlert',
} as const;

interface GrievanceCellValue {
  dept_level_constituted_by: string;
  institution_level_constituted_by: string;
  gic: {
    chairperson: string;
    member_composition: string;
    against_workplace_harassment: boolean;
  };
}

const DEFAULT_VALUE: GrievanceCellValue = {
  dept_level_constituted_by: 'HOD',
  institution_level_constituted_by: 'Principal',
  gic: {
    chairperson: 'Principal',
    member_composition: 'per_statutes',
    against_workplace_harassment: true,
  },
};

function parseValue(raw: unknown): GrievanceCellValue {
  const obj = (raw || {}) as Partial<GrievanceCellValue>;
  const gic = (obj.gic || {}) as Partial<GrievanceCellValue['gic']>;
  return {
    dept_level_constituted_by:
      typeof obj.dept_level_constituted_by === 'string'
        ? obj.dept_level_constituted_by
        : DEFAULT_VALUE.dept_level_constituted_by,
    institution_level_constituted_by:
      typeof obj.institution_level_constituted_by === 'string'
        ? obj.institution_level_constituted_by
        : DEFAULT_VALUE.institution_level_constituted_by,
    gic: {
      chairperson:
        typeof gic.chairperson === 'string' ? gic.chairperson : DEFAULT_VALUE.gic.chairperson,
      member_composition:
        typeof gic.member_composition === 'string'
          ? gic.member_composition
          : DEFAULT_VALUE.gic.member_composition,
      against_workplace_harassment:
        typeof gic.against_workplace_harassment === 'boolean'
          ? gic.against_workplace_harassment
          : DEFAULT_VALUE.gic.against_workplace_harassment,
    },
  };
}

export default function GrievanceCellPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="HR Policy — Grievance Cell">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Grievance Cell
            configuration determines harassment-complaint escalation and is
            classified as a major policy.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="HR Policy — Grievance Cell">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
            { label: 'Grievance Cell' },
          ]}
        />
        <PolicyEditorShell<GrievanceCellValue>
          policyKey="hr.grievance_cell"
          pageTitle="Grievance Cell"
          pageBlurb="Two-tier grievance escalation: department-level (constituted by HOD) and institution-level (constituted by Principal). The Grievance Investigation Committee (GIC) handles serious complaints including workplace harassment."
          defaultValue={DEFAULT_VALUE}
          parseValue={parseValue}
          renderEditor={(value, onChange, disabled) => (
            <GrievanceEditor value={value} onChange={onChange} disabled={disabled} />
          )}
        />
      </ContentLayout>
    </SuperAdminOnly>
  );
}

function GrievanceEditor({
  value,
  onChange,
  disabled,
}: {
  value: GrievanceCellValue;
  onChange: (next: GrievanceCellValue) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <Label className="text-sm font-semibold">
          Department-level grievance committee — constituted by
        </Label>
        <p className="text-xs text-muted-foreground">
          The role that forms department-level grievance committees. Typically
          the Head of Department (HOD).
        </p>
        <Input
          value={value.dept_level_constituted_by}
          onChange={(e) =>
            onChange({ ...value, dept_level_constituted_by: e.target.value })
          }
          disabled={disabled}
          placeholder="HOD"
          className="max-w-md"
        />
      </section>

      <section className="space-y-2 border-t pt-6">
        <Label className="text-sm font-semibold">
          Institution-level grievance committee — constituted by
        </Label>
        <p className="text-xs text-muted-foreground">
          The role that forms institution-level grievance committees. Typically
          the Principal.
        </p>
        <Input
          value={value.institution_level_constituted_by}
          onChange={(e) =>
            onChange({
              ...value,
              institution_level_constituted_by: e.target.value,
            })
          }
          disabled={disabled}
          placeholder="Principal"
          className="max-w-md"
        />
      </section>

      <section className="space-y-4 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">
            Grievance Investigation Committee (GIC)
          </Label>
          <p className="text-xs text-muted-foreground">
            Permanent committee that investigates serious complaints (including
            workplace harassment).
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Chairperson</Label>
          <Input
            value={value.gic.chairperson}
            onChange={(e) =>
              onChange({
                ...value,
                gic: { ...value.gic, chairperson: e.target.value },
              })
            }
            disabled={disabled}
            placeholder="Principal"
            className="max-w-md"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Member composition</Label>
          <Input
            value={value.gic.member_composition}
            onChange={(e) =>
              onChange({
                ...value,
                gic: { ...value.gic, member_composition: e.target.value },
              })
            }
            disabled={disabled}
            placeholder="per_statutes"
            className="max-w-md"
          />
          <p className="text-xs text-muted-foreground">
            How members are chosen. &quot;per_statutes&quot; means as defined in
            the institution&apos;s governing statutes.
          </p>
        </div>

        <div className="flex items-start gap-3">
          <Switch
            checked={value.gic.against_workplace_harassment}
            onCheckedChange={(checked) =>
              onChange({
                ...value,
                gic: { ...value.gic, against_workplace_harassment: checked },
              })
            }
            disabled={disabled}
          />
          <div>
            <Label className="text-sm">Handles workplace harassment</Label>
            <p className="text-xs text-muted-foreground">
              When on, the GIC has jurisdiction over workplace harassment
              complaints (in addition to other grievances).
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
