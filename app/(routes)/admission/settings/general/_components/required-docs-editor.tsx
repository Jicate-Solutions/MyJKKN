'use client';

// ============================================================================
// required-docs-editor.tsx
// ----------------------------------------------------------------------------
// Plan 6 / Task 4 — Chip-list editor for the required-documents checklist
// gating the status='account' transition. Backed by
// admission_settings_per_institution.required_documents_for_account_transition
// (jsonb string[]).
//
// UX: list current docs as removable chips; an Input + Add button below adds
// a new doc_type. Each mutation persists immediately via
// AdmissionSettingsService.setRequiredDocuments.
// ----------------------------------------------------------------------------
// Spec §10.3  · Plan: 2026-05-05-admission-fees-plan-06 Task 4
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';

import { AdmissionSettingsService } from '@/lib/services/admission/admission-settings-service';

interface Props {
  institutionId: string;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_');
}

export function RequiredDocsEditor({ institutionId }: Props) {
  const [docs, setDocs] = useState<string[] | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!institutionId) return;
    let cancelled = false;
    AdmissionSettingsService.getByInstitution(institutionId)
      .then((s) => {
        if (cancelled) return;
        setDocs(
          Array.isArray(s?.required_documents_for_account_transition)
            ? (s!.required_documents_for_account_transition as string[])
            : [],
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[required-docs-editor] getByInstitution:', err);
        setDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  const sortedDocs = useMemo(() => (docs ? [...docs] : []), [docs]);

  const persist = async (next: string[]) => {
    setSaving(true);
    try {
      await AdmissionSettingsService.setRequiredDocuments(institutionId, next);
      setDocs(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save documents');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    const v = normalize(draft);
    if (!v) return;
    if (docs?.includes(v)) {
      toast.error(`"${v}" is already in the list`);
      return;
    }
    setDraft('');
    await persist([...(docs ?? []), v]);
  };

  const handleRemove = async (doc: string) => {
    await persist((docs ?? []).filter((d) => d !== doc));
  };

  if (docs === null) {
    return (
      <div className="rounded border p-4 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="rounded border p-4 space-y-3">
      <div>
        <div className="font-medium">Required Documents</div>
        <div className="text-sm text-muted-foreground">
          Documents that must be received before a lead can move to{' '}
          <code>status = &lsquo;account&rsquo;</code>. Use snake_case
          identifiers (e.g. <code>pan</code>, <code>aadhaar</code>,{' '}
          <code>parent_id</code>).
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {sortedDocs.length === 0 && (
          <span className="text-xs text-muted-foreground">
            No required documents configured yet.
          </span>
        )}
        {sortedDocs.map((doc) => (
          <Badge
            key={doc}
            variant="outline"
            className="flex items-center gap-1 px-2 py-1 font-mono text-xs"
          >
            {doc}
            <button
              type="button"
              onClick={() => void handleRemove(doc)}
              disabled={saving}
              className="ml-1 -mr-1 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              aria-label={`Remove ${doc}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. tc_certificate"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleAdd();
            }
          }}
          disabled={saving || !institutionId}
          className="max-w-xs"
        />
        <Button
          type="button"
          size="sm"
          onClick={() => void handleAdd()}
          disabled={saving || !draft.trim() || !institutionId}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
      </div>
    </div>
  );
}
