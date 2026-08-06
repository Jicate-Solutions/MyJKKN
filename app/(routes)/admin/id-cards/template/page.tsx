// ============================================================================
// ID CARDS — TEMPLATE (Super-Admin)
// ============================================================================
// Created: 2026-05-07 (Phase 1B — UI layer). Rewired: 2026-07-25.
//
// Two tabs:
//   1. Card design — per-template artwork upload (Canva workflow)
//   2. Field mappings — per-template field_mappings jsonb (card-field →
//      db-column), served by /api/id-cards/template/[id]/mappings
//
// The old "Photo fallback" tab was removed — the fallback chain is fixed in
// the print engine (lib/id-cards/render-data.ts); a note explains it.
// Sides badge at top reads id_card.printer.sides via /api/id-cards/policy.
// ============================================================================

export const navMeta = { label: 'ID Card Template', icon: 'Layout' } as const;

import { PolicyPageShell } from '@/lib/admin/policy-shell';
import { IdCardTemplateEditor } from '@/components/admin/id-cards/id-card-template-editor';

export default function IdCardTemplatePage() {
  return (
    <PolicyPageShell
      title="ID Card Template — Card design and field mappings"
      explainer={
        <>
          <h3 className="mb-2 text-sm font-semibold">What this page controls</h3>
          <p>
            The <strong>Card design</strong> tab gives each template its own
            printed artwork — upload a design and learner details print on top.
          </p>
          <p className="mt-2">
            The <strong>Field mappings</strong> tab decides what data from the
            learner record appears on each part of the printed card (name, roll
            number, course, etc.). Each card field maps to one database column,
            saved per template.
          </p>
          <p className="mt-2">
            When a learner has no photo, MyJKKN automatically falls back to the
            account avatar and finally to printed initials — this order is
            fixed in the print engine.
          </p>
        </>
      }
      permission="super_admin"
    >
      <IdCardTemplateEditor />
    </PolicyPageShell>
  );
}
