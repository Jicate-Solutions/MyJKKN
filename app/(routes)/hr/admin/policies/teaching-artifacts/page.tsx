'use client';

// =====================================================================
// /hr/admin/policies/teaching-artifacts — Wave 3 W3-M2
// =====================================================================
// Backed by `hr.teaching_artifacts` (scope=institution; was global, per
// Director lock 2026-05-15).
// JSONB shape:
//   { required_artifacts: string[], optional_artifacts: string[] }
//
// We support a required/optional split via a per-row toggle. The seed
// only writes required_artifacts; the UI auto-creates optional_artifacts
// on first toggle. parseValue tolerates either present-or-missing.
// =====================================================================

import { ArrowLeftRight, Plus, X } from 'lucide-react';
import { useState } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

import { PolicyEditorShell } from '../_shared/policy-editor-shell';

interface ArtifactsValue {
  required_artifacts: string[];
  optional_artifacts: string[];
}

function parseValue(raw: unknown): ArtifactsValue {
  const obj = (raw || {}) as Partial<ArtifactsValue>;
  return {
    required_artifacts: Array.isArray(obj.required_artifacts)
      ? obj.required_artifacts.map(String)
      : [],
    optional_artifacts: Array.isArray(obj.optional_artifacts)
      ? obj.optional_artifacts.map(String)
      : [],
  };
}

export default function TeachingArtifactsPage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="HR Policy — Teaching Artifacts">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
            { label: 'Teaching Artifacts' },
          ]}
        />
        <PolicyEditorShell<ArtifactsValue>
          policyKey="hr.teaching_artifacts"
          pageTitle="Teaching Artifacts"
          pageBlurb="Course planning artifacts faculty must prepare and maintain. Toggle each item between required and optional. Used by the auto-generated HR manual."
          defaultValue={{ required_artifacts: [], optional_artifacts: [] }}
          parseValue={parseValue}
          renderEditor={(value, onChange, disabled) => (
            <ArtifactsEditor value={value} onChange={onChange} disabled={disabled} />
          )}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Editor — two arrays with toggle between them.
// ---------------------------------------------------------------------------

function ArtifactsEditor({
  value,
  onChange,
  disabled,
}: {
  value: ArtifactsValue;
  onChange: (next: ArtifactsValue) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState('');

  function addRequired() {
    const v = draft.trim().toLowerCase().replace(/\s+/g, '_');
    if (!v) return;
    if (
      value.required_artifacts.includes(v) ||
      value.optional_artifacts.includes(v)
    ) {
      setDraft('');
      return;
    }
    onChange({
      ...value,
      required_artifacts: [...value.required_artifacts, v],
    });
    setDraft('');
  }

  function remove(item: string, kind: 'required' | 'optional') {
    if (kind === 'required') {
      onChange({
        ...value,
        required_artifacts: value.required_artifacts.filter((x) => x !== item),
      });
    } else {
      onChange({
        ...value,
        optional_artifacts: value.optional_artifacts.filter((x) => x !== item),
      });
    }
  }

  function toggle(item: string, kind: 'required' | 'optional') {
    if (kind === 'required') {
      onChange({
        required_artifacts: value.required_artifacts.filter((x) => x !== item),
        optional_artifacts: [...value.optional_artifacts, item],
      });
    } else {
      onChange({
        required_artifacts: [...value.required_artifacts, item],
        optional_artifacts: value.optional_artifacts.filter((x) => x !== item),
      });
    }
  }

  return (
    <div className="space-y-8">
      <Section
        label="Required artifacts"
        helpText="Faculty MUST prepare and maintain these. Audited via the HR module."
        items={value.required_artifacts}
        kind="required"
        disabled={disabled}
        onRemove={remove}
        onToggle={toggle}
        emptyLabel="No required artifacts."
        badgeVariant="default"
      />
      <Section
        label="Optional artifacts"
        helpText="Encouraged but not required. Toggle into required to enforce."
        items={value.optional_artifacts}
        kind="optional"
        disabled={disabled}
        onRemove={remove}
        onToggle={toggle}
        emptyLabel="No optional artifacts."
        badgeVariant="outline"
      />

      {!disabled && (
        <div className="space-y-2 border-t pt-4">
          <Label className="text-sm font-semibold">Add new artifact</Label>
          <p className="text-xs text-muted-foreground">
            New artifacts start as required. Toggle to move to optional after adding.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addRequired();
                }
              }}
              placeholder="Add artifact (e.g. lab_record_book)"
              className="max-w-md"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRequired}
              disabled={!draft.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add as required
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  helpText,
  items,
  kind,
  disabled,
  onRemove,
  onToggle,
  emptyLabel,
  badgeVariant,
}: {
  label: string;
  helpText: string;
  items: string[];
  kind: 'required' | 'optional';
  disabled: boolean;
  onRemove: (item: string, kind: 'required' | 'optional') => void;
  onToggle: (item: string, kind: 'required' | 'optional') => void;
  emptyLabel: string;
  badgeVariant: 'default' | 'outline';
}) {
  return (
    <section className="space-y-3">
      <div>
        <Label className="text-sm font-semibold">
          {label} ({items.length})
        </Label>
        <p className="text-xs text-muted-foreground">{helpText}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <Badge
            key={it}
            variant={badgeVariant}
            className="pr-1 text-sm"
          >
            <span className="font-mono">{it}</span>
            {!disabled && (
              <>
                <button
                  type="button"
                  onClick={() => onToggle(it, kind)}
                  className="ml-1 rounded-full p-0.5 hover:bg-accent"
                  aria-label={`Toggle ${it} to ${kind === 'required' ? 'optional' : 'required'}`}
                  title={`Move to ${kind === 'required' ? 'optional' : 'required'}`}
                >
                  <ArrowLeftRight className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(it, kind)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20"
                  aria-label={`Remove ${it}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
          </Badge>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground italic">{emptyLabel}</p>
        )}
      </div>
    </section>
  );
}
