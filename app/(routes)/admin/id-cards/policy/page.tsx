// ============================================================================
// ID CARDS — POLICY (Super-Admin)
// ============================================================================
// Created: 2026-05-07 (Phase 1B — UI layer).
//
// Configures the platform_policies rows that drive the ID-card print agent:
//   • Encoding toggles (magstripe / chip / RFID) with hardware-presence flags
//   • Station endpoint URL (where the on-prem print agent listens)
//   • Ribbon type (YMCKO / YMCKOK / monochrome)
//   • Printer sides (1 or 2)
//
// Uses SettingsPanel (Shape B) from lib/admin/policy-shell.
// Reads via GET /api/id-cards/policy (Agent C). Stubs with sensible defaults
// if the route isn't live yet (404 → stub).
// ============================================================================

export const navMeta = { label: 'ID Card Policy', icon: 'CreditCard' } as const;

import { IdCardPolicyPanel } from '@/components/admin/id-cards/id-card-policy-panel';
import { PolicyPageShell } from '@/lib/admin/policy-shell';

export default function IdCardPolicyPage() {
  return (
    <PolicyPageShell
      title="ID Card Printer — Configuration"
      explainer={
        <>
          <h3 className="mb-2 text-sm font-semibold">What this page controls</h3>
          <p>
            These settings tell MyJKKN how to talk to the ID card printer in each
            college. Change a setting here and every card printed after that point
            uses the new value — no software deployment needed.
          </p>
          <p className="mt-2">
            Hardware flags (e.g., &quot;Magnetic stripe encoder installed?&quot;) must match what
            is physically installed on the printer. Setting a feature as enabled when
            the hardware isn&apos;t there will not damage the printer, but the encoding
            section of the card will be silently skipped.
          </p>
        </>
      }
      permission="super_admin"
    >
      <IdCardPolicyPanel />
    </PolicyPageShell>
  );
}
