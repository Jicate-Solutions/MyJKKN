// ============================================================================
// ID CARDS — MORNING PAGE
// ============================================================================
// Created: 2026-08-14.
//
// Campus card scanning (mess doors, hostel gate, ID cards) will produce tens
// of thousands of rows. This is the page that is read INSTEAD of them: about
// a dozen exception lines, who is outside right now, and a coverage meter
// that states plainly how much of the scanning could actually be verified by
// a human.
//
// GATE — stated precisely, because an earlier version of this comment claimed
// a parity that does not exist. This page is gated on the GRANULAR key
// `id_cards.jobs.view`, which is the key the ID Cards sidebar entry is mapped
// to. The Print Queue page is gated differently — by ROLE
// (AdminPermissionGuard: administrator / super admin) — so a per-college
// admin granted `id_cards.jobs.view` can read THIS page and not that one.
// That is deliberate: a Principal reading their own morning page is the point.
//
// What such a reader sees, stated rather than assumed: the gate-pass,
// meal-scan and learner sections are row-level-security scoped to their own
// institution, so those are their own people. Two sections are cluster-wide by
// design — the failed-print-job lines (RLS on id_card_print_jobs is
// permission-scoped, not institution-scoped; no learner details are selected)
// and the coverage table, which exists precisely to compare colleges. Tighten
// to `permission="admin_or_super_admin"` if that cluster view should be
// Director-only.
//
// The gate-pass and meal-scan sections additionally need their own
// campus_living.* keys; where the reader lacks one, the page says which key is
// missing instead of showing an empty panel.
// ============================================================================

export const navMeta = { label: 'ID Card Morning Page', icon: 'Sunrise' } as const;

import { PolicyPageShell } from '@/lib/admin/policy-shell';
import { IdCardMorningPage } from '@/components/admin/id-cards/id-card-morning-page';

export default function IdCardMorningRoute() {
  return (
    <PolicyPageShell
      title="Morning Page"
      explainer={
        <>
          <h3 className="mb-2 text-sm font-semibold">What this page is</h3>
          <p>
            One read, once a morning. It answers three questions and nothing else: what needs a
            person today, who is outside the campus right now, and how much of yesterday&apos;s
            scanning could actually be trusted.
          </p>
          <p className="mt-2">
            It is deliberately not a log. Individual scans live on the Print Queue, the mess records
            and the gate-pass screens; this page only surfaces what somebody has to act on.
          </p>
          <p className="mt-2">
            The coverage meter reports what a person could have checked, not what the scanner
            accepted. A card&apos;s QR is only a number, so a photograph of somebody else&apos;s card
            scans identically — the picture on the operator&apos;s screen is the real control. Where
            there is no picture, the page says so rather than rounding the gap away.
          </p>
        </>
      }
      permissionKey="id_cards.jobs.view"
    >
      <IdCardMorningPage />
    </PolicyPageShell>
  );
}
