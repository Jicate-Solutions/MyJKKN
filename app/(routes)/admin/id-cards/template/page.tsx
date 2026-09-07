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
// The old "Photo fallback" tab was removed, and since 2026-09-03 there is no
// fallback to configure: no institutional photograph means the card is refused
// (Guard 3, lib/services/id-cards/reprint-eligibility.ts). The explainer says so.
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
            A card is <strong>not printed at all</strong> for anyone without a photograph
            the institution took. A picture from the person&apos;s own login account does
            not count, and there is no way to override it — a card showing initials where
            a face belongs proves nothing at a gate, so the print screen refuses and says
            whose photograph is missing. Use <strong>Photo Check</strong> to see who is
            affected before anyone queues.
          </p>
        </>
      }
      // Gate via Role Management (id_cards.templates.edit) instead of the
      // hardcoded super_admin shell — matches the nav mapping
      // (id_cards.templates.view) and the id_card_templates RLS, so custom
      // roles like ID Card Manager reach the page without being admins.
      permissionKey="id_cards.templates.edit"
    >
      <IdCardTemplateEditor />
    </PolicyPageShell>
  );
}
