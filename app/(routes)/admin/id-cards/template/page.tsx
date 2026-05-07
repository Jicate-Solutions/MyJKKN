// ============================================================================
// ID CARDS — TEMPLATE (Super-Admin)
// ============================================================================
// Created: 2026-05-07 (Phase 1B — UI layer).
//
// Two tabs:
//   1. Field mappings — LookupTable (Shape C) mapping card-field → db-column
//   2. Photo fallback — CascadeStepList (Shape A) ordered fallback chain
//
// Single/double-sided toggle at top ties to id_card.printer.sides policy.
// ============================================================================

export const navMeta = { label: 'ID Card Template', icon: 'Layout' } as const;

import { PolicyPageShell } from '@/lib/admin/policy-shell';
import { IdCardTemplateEditor } from '@/components/admin/id-cards/id-card-template-editor';

export default function IdCardTemplatePage() {
  return (
    <PolicyPageShell
      title="ID Card Template — Field mappings and photo fallback"
      explainer={
        <>
          <h3 className="mb-2 text-sm font-semibold">What this page controls</h3>
          <p>
            The <strong>Field mappings</strong> tab decides what data from the
            student record appears on each part of the printed card (name, roll
            number, course, etc.). Each card field maps to one database column.
          </p>
          <p className="mt-2">
            The <strong>Photo fallback</strong> tab decides what happens when a
            student doesn&apos;t have a photo. MyJKKN tries each source in the
            order shown — the first one that has a photo is used.
          </p>
        </>
      }
      permission="super_admin"
    >
      <IdCardTemplateEditor />
    </PolicyPageShell>
  );
}
