'use client';

// =====================================================================
// /hr/admin/policies/academic-scope — Wave 3 W3-M2
// =====================================================================
// Backed by `hr.academic_scope` (scope=institution; was global, per
// Director lock 2026-05-15).
// JSONB shape: { responsibilities: string[], career_development_channels: string[] }
// =====================================================================

import { Plus, X } from 'lucide-react';
import { useState } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

import { PolicyEditorShell } from '../_shared/policy-editor-shell';

interface AcademicValue {
  responsibilities: string[];
  career_development_channels: string[];
}

function parseValue(raw: unknown): AcademicValue {
  const obj = (raw || {}) as Partial<AcademicValue>;
  return {
    responsibilities: Array.isArray(obj.responsibilities)
      ? obj.responsibilities.map(String)
      : [],
    career_development_channels: Array.isArray(obj.career_development_channels)
      ? obj.career_development_channels.map(String)
      : [],
  };
}

export default function AcademicScopePage() {
  return (
    <PermissionGuard module="hr.policies" action="view">
      <ContentLayout title="HR Policy — Academic Scope">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Administration' },
            { label: 'HR Policies' },
            { label: 'Academic Scope' },
          ]}
        />
        <PolicyEditorShell<AcademicValue>
          policyKey="hr.academic_scope"
          pageTitle="Academic Scope"
          pageBlurb="Faculty academic responsibilities and the career-development channels available to them. Both lists are editable; lower-snake-case is normalised on add."
          defaultValue={{ responsibilities: [], career_development_channels: [] }}
          parseValue={parseValue}
          renderEditor={(value, onChange, disabled) => (
            <AcademicEditor value={value} onChange={onChange} disabled={disabled} />
          )}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Editor — two editable string arrays.
// ---------------------------------------------------------------------------

function AcademicEditor({
  value,
  onChange,
  disabled,
}: {
  value: AcademicValue;
  onChange: (next: AcademicValue) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-8">
      <StringArrayEditor
        label="Faculty academic responsibilities"
        helpText="Buckets used to describe what faculty members are responsible for. Used by the auto-generated HR manual."
        items={value.responsibilities}
        disabled={disabled}
        onChange={(next) => onChange({ ...value, responsibilities: next })}
        placeholder="Add responsibility (e.g. classroom_teaching_modern_aids)"
      />
      <StringArrayEditor
        label="Career-development channels"
        helpText="Channels available to faculty for ongoing development (QIP, professional associations, etc.)."
        items={value.career_development_channels}
        disabled={disabled}
        onChange={(next) =>
          onChange({ ...value, career_development_channels: next })
        }
        placeholder="Add channel (e.g. QIP)"
      />
    </div>
  );
}

function StringArrayEditor({
  label,
  helpText,
  items,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  helpText: string;
  items: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const v = draft.trim().toLowerCase().replace(/\s+/g, '_');
    if (!v) return;
    if (items.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...items, v]);
    setDraft('');
  }

  function remove(item: string) {
    onChange(items.filter((x) => x !== item));
  }

  return (
    <section className="space-y-3">
      <div>
        <Label className="text-sm font-semibold">{label}</Label>
        <p className="text-xs text-muted-foreground">{helpText}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <Badge key={it} variant="secondary" className="pr-1 text-sm">
            <span className="font-mono">{it}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(it)}
                className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
                aria-label={`Remove ${it}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No items.</p>
        )}
      </div>
      {!disabled && (
        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            className="max-w-md"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={add}
            disabled={!draft.trim()}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
      )}
    </section>
  );
}
