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
  lookup: {
    value_mapped_via_dqr: (table: string, observed: string, mappedTo: string) =>
      `Mapped ${table}.${observed} → ${mappedTo} via DQR`,
  },
};
