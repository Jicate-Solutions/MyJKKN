// ============================================
// STAFF PROFILE COMPLETION UTILITY
// ============================================
// Per-staff completion calculator — the staff analogue of
// lib/utils/profile-completion.ts (learners). Returns the SAME
// ProfileCompletionResult shape so the shared completion UI (progress bar +
// section breakdown + missing-field list) renders identically for staff.
//
// Field set MIRRORS the canonical staff completion definition used by the
// Staff dashboard's aggregate `profileCompletionRate` /
// `profileCompletionBreakdown` (lib/services/staff/staff-service.ts —
// getOverviewStats and getProfileAnalytics) — required (7) + optional (10).
// Keeping them in lock-step means a staff member's individual bar agrees
// with the dashboard's institution-wide rate. A fifth site,
// DASHBOARD_STAFF_COLUMNS in the same file, must SELECT every field these
// arrays measure, or the field reads `undefined` and counts as 100% missing
// with no error. If the dashboard field list changes, update this list too.
// ============================================

import { Staff } from '@/types/staff';
import { ProfileCompletionResult } from '@/lib/utils/profile-completion';

interface StaffFieldMetadata {
  field: keyof Staff;
  label: string;
  section: string;
}

/**
 * The fields that count toward a staff member's profile completion, grouped
 * into the same sections the staff detail page renders. Order within a section
 * is display order in the breakdown grid.
 */
const STAFF_FIELD_METADATA: StaffFieldMetadata[] = [
  // Basic Details
  { field: 'first_name', label: 'First Name', section: 'Basic Details' },
  { field: 'last_name', label: 'Last Name', section: 'Basic Details' },
  { field: 'date_of_birth', label: 'Date of Birth', section: 'Basic Details' },
  { field: 'blood_group', label: 'Blood Group', section: 'Basic Details' },
  { field: 'profile_picture', label: 'Profile Picture', section: 'Basic Details' },

  // Contact Details
  { field: 'email', label: 'Personal Email', section: 'Contact Details' },
  { field: 'phone', label: 'Phone', section: 'Contact Details' },
  { field: 'address', label: 'Address', section: 'Contact Details' },
  { field: 'state', label: 'State', section: 'Contact Details' },
  { field: 'district', label: 'District', section: 'Contact Details' },
  { field: 'pincode', label: 'PIN Code', section: 'Contact Details' },

  // Employment Details
  { field: 'designation', label: 'Designation', section: 'Employment Details' },
  { field: 'staff_id', label: 'Staff ID', section: 'Employment Details' },
  { field: 'date_of_joining', label: 'Date of Joining', section: 'Employment Details' },
  { field: 'institution_email', label: 'Institution Email', section: 'Employment Details' },
  { field: 'biometric_id', label: 'Biometric Code', section: 'Employment Details' },
  { field: 'biometric_institution_id', label: 'Biometric Machine', section: 'Employment Details' },
];

/**
 * A field is complete when it has a non-empty value. Mirrors the dashboard's
 * truthiness check (`if (s[field])`), but trims strings so whitespace-only
 * values don't count as filled.
 */
function isFieldComplete(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

/**
 * Calculate profile completion for a single staff record. Returns the same
 * shape as the learner calculator so the shared completion components can
 * render it unchanged.
 */
export function calculateStaffProfileCompletion(staff: Staff): ProfileCompletionResult {
  const sections = new Map<string, { completed: number; total: number }>();
  const missingFields: ProfileCompletionResult['missingFields'] = [];

  let totalCompleted = 0;

  for (const meta of STAFF_FIELD_METADATA) {
    if (!sections.has(meta.section)) {
      sections.set(meta.section, { completed: 0, total: 0 });
    }
    const section = sections.get(meta.section)!;
    section.total++;

    if (isFieldComplete(staff[meta.field])) {
      section.completed++;
      totalCompleted++;
    } else {
      missingFields.push({ field: meta.field, label: meta.label, section: meta.section });
    }
  }

  const sectionCompletions = Array.from(sections.entries()).map(([name, data]) => ({
    name,
    completed: data.completed,
    total: data.total,
    percentage: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
  }));

  const totalRequired = STAFF_FIELD_METADATA.length;
  const overallPercentage =
    totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0;

  return {
    overallPercentage,
    totalRequired,
    completed: totalCompleted,
    sections: sectionCompletions,
    missingFields,
  };
}
