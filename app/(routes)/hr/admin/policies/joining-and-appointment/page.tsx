'use client';

// =====================================================================
// /hr/admin/policies/joining-and-appointment — Wave 3 W3-M5b
// =====================================================================
// Backed by `hr.joining_and_appointment` (scope=institution).
// JSONB shape (spec §12):
//   {
//     required_documents: Array<{ key, required, count?, any_one_of? }>,
//     appointment: { default_type, ..., naac_guideline_alignment_required },
//     process_steps: string[],
//     appointing_authority: { primary, approver, committee_recommendation_required }
//   }
//
// NOTE: The legacy /hr/admin/required-documents page (Wave 1.5) reads from
// the hr_required_documents table. Refactor to read from this policy's
// required_documents catalog is scheduled in W3-M10. Both surfaces coexist
// until that refactor lands.
// =====================================================================

import { Plus, X, GripVertical } from 'lucide-react';
import { useState } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

import { PolicyEditorShell } from '../_shared/policy-editor-shell';

interface RequiredDocument {
  key: string;
  required: boolean;
  count?: number;
  any_one_of?: string[];
}

interface JoiningValue {
  required_documents: RequiredDocument[];
  appointment: {
    default_type: string;
    outsourcing_to_contract_approver: string;
    reservation_compliance: string;
    nondiscrimination_axes: string[];
    letter_termination_notice_clause: boolean;
    naac_guideline_alignment_required: boolean;
  };
  process_steps: string[];
  appointing_authority: {
    primary: string;
    approver: string;
    committee_recommendation_required: boolean;
  };
}

const DEFAULT_VALUE: JoiningValue = {
  required_documents: [],
  appointment: {
    default_type: 'tenure_based_scaled_contract',
    outsourcing_to_contract_approver: 'Director',
    reservation_compliance: 'Government_guidelines',
    nondiscrimination_axes: ['race', 'sex', 'religion'],
    letter_termination_notice_clause: true,
    naac_guideline_alignment_required: true,
  },
  process_steps: [],
  appointing_authority: {
    primary: 'Principal',
    approver: 'MD',
    committee_recommendation_required: true,
  },
};

function parseValue(raw: unknown): JoiningValue {
  const obj = (raw || {}) as Partial<JoiningValue>;
  const app = obj.appointment || ({} as Partial<JoiningValue['appointment']>);
  const auth = obj.appointing_authority || ({} as Partial<JoiningValue['appointing_authority']>);
  return {
    required_documents: Array.isArray(obj.required_documents)
      ? (obj.required_documents as RequiredDocument[]).map((d) => ({
          key: String(d.key || ''),
          required: d.required !== false,
          count: typeof d.count === 'number' ? d.count : undefined,
          any_one_of: Array.isArray(d.any_one_of) ? d.any_one_of.map(String) : undefined,
        }))
      : [],
    appointment: {
      default_type: String(app.default_type || DEFAULT_VALUE.appointment.default_type),
      outsourcing_to_contract_approver: String(
        app.outsourcing_to_contract_approver || DEFAULT_VALUE.appointment.outsourcing_to_contract_approver,
      ),
      reservation_compliance: String(
        app.reservation_compliance || DEFAULT_VALUE.appointment.reservation_compliance,
      ),
      nondiscrimination_axes: Array.isArray(app.nondiscrimination_axes)
        ? app.nondiscrimination_axes.map(String)
        : DEFAULT_VALUE.appointment.nondiscrimination_axes,
      letter_termination_notice_clause: app.letter_termination_notice_clause !== false,
      naac_guideline_alignment_required: app.naac_guideline_alignment_required !== false,
    },
    process_steps: Array.isArray(obj.process_steps) ? obj.process_steps.map(String) : [],
    appointing_authority: {
      primary: String(auth.primary || DEFAULT_VALUE.appointing_authority.primary),
      approver: String(auth.approver || DEFAULT_VALUE.appointing_authority.approver),
      committee_recommendation_required:
        auth.committee_recommendation_required !== false,
    },
  };
}

export default function JoiningAndAppointmentPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="HR Policy — Joining & Appointment">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
            { label: 'Joining & Appointment' },
          ]}
        />
        <PolicyEditorShell<JoiningValue>
          policyKey="hr.joining_and_appointment"
          pageTitle="Joining & Appointment"
          pageBlurb="Required documents catalog, appointment defaults, joining process steps, and appointing authority. Drives both the HR manual and (after W3-M10 refactor) the Required Documents admin page."
          defaultValue={DEFAULT_VALUE}
          parseValue={parseValue}
          renderEditor={(value, onChange, disabled) => (
            <JoiningEditor value={value} onChange={onChange} disabled={disabled} />
          )}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function JoiningEditor({
  value,
  onChange,
  disabled,
}: {
  value: JoiningValue;
  onChange: (next: JoiningValue) => void;
  disabled: boolean;
}) {
  const [newDocKey, setNewDocKey] = useState('');
  const [newStep, setNewStep] = useState('');

  function addDoc() {
    const k = newDocKey.trim().toLowerCase().replace(/\s+/g, '_');
    if (!k || value.required_documents.some((d) => d.key === k)) {
      setNewDocKey('');
      return;
    }
    onChange({
      ...value,
      required_documents: [...value.required_documents, { key: k, required: true }],
    });
    setNewDocKey('');
  }

  function removeDoc(key: string) {
    onChange({
      ...value,
      required_documents: value.required_documents.filter((d) => d.key !== key),
    });
  }

  function toggleDocRequired(key: string) {
    onChange({
      ...value,
      required_documents: value.required_documents.map((d) =>
        d.key === key ? { ...d, required: !d.required } : d,
      ),
    });
  }

  function moveDoc(key: string, dir: -1 | 1) {
    const idx = value.required_documents.findIndex((d) => d.key === key);
    if (idx < 0) return;
    const next = [...value.required_documents];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange({ ...value, required_documents: next });
  }

  function addStep() {
    const s = newStep.trim().toLowerCase().replace(/\s+/g, '_');
    if (!s || value.process_steps.includes(s)) {
      setNewStep('');
      return;
    }
    onChange({ ...value, process_steps: [...value.process_steps, s] });
    setNewStep('');
  }

  function removeStep(s: string) {
    onChange({ ...value, process_steps: value.process_steps.filter((x) => x !== s) });
  }

  return (
    <div className="space-y-8">
      {/* Required Documents */}
      <section className="space-y-3">
        <div>
          <Label className="text-sm font-semibold">
            Required documents ({value.required_documents.length})
          </Label>
          <p className="text-xs text-muted-foreground">
            Documents a new hire must submit on or before joining. Toggle each
            between required and optional. Reorder to match the joining checklist.
          </p>
        </div>
        <div className="space-y-2">
          {value.required_documents.map((doc, idx) => (
            <div
              key={doc.key}
              className="flex items-center gap-2 rounded-md border border-border bg-card p-2"
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  disabled={disabled || idx === 0}
                  onClick={() => moveDoc(doc.key, -1)}
                  className="p-0.5 disabled:opacity-30"
                  aria-label="Move up"
                >
                  <GripVertical className="h-3 w-3 rotate-90" />
                </button>
              </div>
              <div className="flex-1">
                <div className="font-mono text-sm">{doc.key}</div>
                {doc.any_one_of && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    any one of: {doc.any_one_of.join(', ')}
                  </div>
                )}
                {doc.count !== undefined && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    count: {doc.count}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Required</Label>
                <Switch
                  checked={doc.required}
                  onCheckedChange={() => toggleDocRequired(doc.key)}
                  disabled={disabled}
                  aria-label={`Toggle ${doc.key} required`}
                />
              </div>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeDoc(doc.key)}
                  aria-label={`Remove ${doc.key}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
          {value.required_documents.length === 0 && (
            <p className="text-xs italic text-muted-foreground">
              No documents configured yet.
            </p>
          )}
        </div>
        {!disabled && (
          <div className="flex items-center gap-2 border-t pt-3">
            <Input
              type="text"
              value={newDocKey}
              onChange={(e) => setNewDocKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDoc();
                }
              }}
              placeholder="Add document (e.g. pan_card)"
              className="max-w-md"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addDoc}
              disabled={!newDocKey.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add document
            </Button>
          </div>
        )}
      </section>

      {/* Appointment defaults */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">Appointment defaults</Label>
          <p className="text-xs text-muted-foreground">
            The standard contract style and the equity / NAAC commitments JKKN
            applies to every new hire.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Default contract type</Label>
            <Input
              value={value.appointment.default_type}
              onChange={(e) =>
                onChange({
                  ...value,
                  appointment: { ...value.appointment, default_type: e.target.value },
                })
              }
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Outsourcing-to-contract approver</Label>
            <Input
              value={value.appointment.outsourcing_to_contract_approver}
              onChange={(e) =>
                onChange({
                  ...value,
                  appointment: {
                    ...value.appointment,
                    outsourcing_to_contract_approver: e.target.value,
                  },
                })
              }
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Non-discrimination axes</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {value.appointment.nondiscrimination_axes.map((axis) => (
                <Badge key={axis} variant="outline" className="text-xs">
                  {axis}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">Termination notice clause</div>
              <p className="text-xs text-muted-foreground">
                Letter must contain explicit notice-period clause.
              </p>
            </div>
            <Switch
              checked={value.appointment.letter_termination_notice_clause}
              onCheckedChange={(c) =>
                onChange({
                  ...value,
                  appointment: { ...value.appointment, letter_termination_notice_clause: c },
                })
              }
              disabled={disabled}
            />
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">NAAC alignment required</div>
              <p className="text-xs text-muted-foreground">
                Appointments must align with NAAC accreditation guidelines.
              </p>
            </div>
            <Switch
              checked={value.appointment.naac_guideline_alignment_required}
              onCheckedChange={(c) =>
                onChange({
                  ...value,
                  appointment: {
                    ...value.appointment,
                    naac_guideline_alignment_required: c,
                  },
                })
              }
              disabled={disabled}
            />
          </div>
        </div>
      </section>

      {/* Process steps */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">
            Joining process steps ({value.process_steps.length})
          </Label>
          <p className="text-xs text-muted-foreground">
            Ordered checklist HR walks every new hire through on joining day.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {value.process_steps.map((s, i) => (
            <Badge key={s} variant="secondary" className="pr-1 text-sm">
              <span className="font-mono">
                {i + 1}. {s}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeStep(s)}
                  className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
                  aria-label={`Remove ${s}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {value.process_steps.length === 0 && (
            <p className="text-xs italic text-muted-foreground">No steps yet.</p>
          )}
        </div>
        {!disabled && (
          <div className="flex items-center gap-2">
            <Input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addStep();
                }
              }}
              placeholder="Add step (e.g. assign_email)"
              className="max-w-md"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addStep}
              disabled={!newStep.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add step
            </Button>
          </div>
        )}
      </section>

      {/* Appointing authority */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <Label className="text-sm font-semibold">Appointing authority</Label>
          <p className="text-xs text-muted-foreground">
            Who proposes the appointment, who finally approves, and whether a
            committee recommendation is mandatory.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Primary (proposer)</Label>
            <Input
              value={value.appointing_authority.primary}
              onChange={(e) =>
                onChange({
                  ...value,
                  appointing_authority: {
                    ...value.appointing_authority,
                    primary: e.target.value,
                  },
                })
              }
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Final approver</Label>
            <Input
              value={value.appointing_authority.approver}
              onChange={(e) =>
                onChange({
                  ...value,
                  appointing_authority: {
                    ...value.appointing_authority,
                    approver: e.target.value,
                  },
                })
              }
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2 flex items-center justify-between rounded-md bg-muted/40 p-3">
            <div>
              <div className="text-sm font-medium">Committee recommendation required</div>
              <p className="text-xs text-muted-foreground">
                When ON, the appointing authority cannot finalize a hire
                without a selection-committee recommendation on file.
              </p>
            </div>
            <Switch
              checked={value.appointing_authority.committee_recommendation_required}
              onCheckedChange={(c) =>
                onChange({
                  ...value,
                  appointing_authority: {
                    ...value.appointing_authority,
                    committee_recommendation_required: c,
                  },
                })
              }
              disabled={disabled}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
