// ============================================================================
// ID CARDS — PRINT QUEUE (Admin or Super-Admin)
// ============================================================================
// Created: 2026-05-07 (Phase 1B — UI layer).
//
// Live view of id_card_print_jobs. Auto-refreshes every 5 seconds.
// Reads via GET /api/id-cards/jobs (Agent C). Stubs with empty list on 404.
//
// Status badges:
//   pending      → grey
//   rendering    → blue
//   sent_to_agent → yellow
//   printed      → green
//   failed       → red
// ============================================================================

export const navMeta = { label: 'ID Card Print Queue', icon: 'Printer' } as const;

import { PolicyPageShell } from '@/lib/admin/policy-shell';
import { IdCardPrintQueue } from '@/components/admin/id-cards/id-card-print-queue';

export default function IdCardPrintQueuePage() {
  return (
    <PolicyPageShell
      title="ID Card Print Queue"
      explainer={
        <>
          <h3 className="mb-2 text-sm font-semibold">What this page shows</h3>
          <p>
            Every ID card print request appears here as a job. MyJKKN renders
            the card, sends it to the on-premises print station, and updates
            the status as each step completes. This page refreshes automatically
            every 5 seconds.
          </p>
          <p className="mt-2">
            If a job shows <strong>Failed</strong>, check the result message for
            the reason. Common causes: print station unreachable, ribbon out,
            card feeder empty.
          </p>
        </>
      }
      permission="admin_or_super_admin"
    >
      <IdCardPrintQueue />
    </PolicyPageShell>
  );
}
