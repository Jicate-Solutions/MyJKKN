// lib/utils/admission-fees-activity-templates.ts
// Activity log templates for admission fee structure events (Plan 2)

export const AdmissionFeesActivityTemplates = {
  fee_structure: {
    created:   (name: string) => `Created fee structure "${name}"`,
    updated:   (name: string) => `Updated fee structure "${name}"`,
    archived:  (name: string) => `Archived fee structure "${name}"`,
    activated: (name: string) => `Activated fee structure "${name}"`,
  },
  fee_structure_item: {
    added:   (cat: string, amount: number) => `Added line item: ${cat} ₹${amount.toLocaleString()}`,
    updated: (cat: string, amount: number) => `Updated line item: ${cat} ₹${amount.toLocaleString()}`,
    removed: (cat: string)                  => `Removed line item: ${cat}`,
  },
  fee_adjustment: {
    added:    (reason: string, delta: number) =>
      `Adjustment added: ${reason}, delta ₹${delta.toLocaleString()}`,
    updated:  (reason: string, delta: number) =>
      `Adjustment updated: ${reason}, delta ₹${delta.toLocaleString()}`,
    removed:  (reason: string) => `Adjustment removed: ${reason}`,
    reversed: (reason: string) => `Adjustment reversed: ${reason}`,
  },
  enquiry: {
    fee_resolved:      (count: number, total: number) =>
      `Resolved ${count} fee items totalling ₹${total.toLocaleString()}`,
    fee_match_failed:  () =>
      `Fee structure lookup failed — no matching matrix combo`,
    legacy_fee_adopted: (count: number, total: number) =>
      `Adopted matrix-derived fees: ${count} items totalling ₹${total.toLocaleString()}`,
  },
  lookup: {
    value_mapped_via_dqr: (table: string, observed: string, mappedTo: string) =>
      `Mapped ${table}.${observed} → ${mappedTo} via DQR`,
  },
  lifecycle: {
    account_transition: (billsGenerated: number) =>
      `Moved to Account stage; ${billsGenerated} bill${billsGenerated !== 1 ? 's' : ''} generated`,
  },
  documents: {
    received: (docType: string, via: string) =>
      `Document received: ${docType} (via ${via})`,
  },
  bill: {
    auto_generated: (count: number) =>
      `Auto-generated ${count} bill${count !== 1 ? 's' : ''} via account transition`,
  },
};
