// ============================================
// BULK LEARNER EDIT SERVICE
// ============================================
// Created: 2025-01-22
// Updated: 2025-01-22 - Added degree and section filter support
// Purpose: Handle bulk edit of active learners' incomplete data
// Filters: Institution → Degree → Department → Program → Semester → Section
// ============================================

import { createClient } from '@supabase/supabase-js';
import { LearnerValidationService, ValidationResult } from './learner-validation-service';
import {
  getLearnerFkResolvers,
  resolveLearnerFkFields,
  fkLabel,
  FK_FIELD_SPECS,
  FK_CONSUMED_KEYS,
} from './bulk-learner-fk-fields';
import {
  getReferenceResolvers,
  resolveLearnerReference,
  buildReferenceTypoHints,
  referenceHintKey,
  REFERENCE_CONSUMED_KEYS,
  REFERENCE_TYPE_EXCEL_LABEL,
  type ReferenceOutcome,
  type ReferenceResolvers,
  type ReferenceTypeKey,
} from './bulk-learner-reference-fields';

// Create admin client for database operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export interface BulkEditRow {
  rowNumber: number;
  data: any;
  validation: ValidationResult;
}

export interface BulkEditResult {
  success: boolean;
  total_rows: number;
  updated: number;
  skipped: number;
  failed: number;
  updated_learners: Array<{
    id: string;
    name: string;
    fields_updated: string[];
  }>;
  errors: Array<{
    row: number;
    id?: string;
    error: string;
  }>;
  /** What the reference columns actually did, so the result step can say so. */
  reference_summary: {
    linked: number;
    name_only: number;
    type_only: number;
    attributions_created: number;
    attributions_replaced: number;
    /** Lead rows written instead of the profile. Zero today — see processBulkEdit. */
    leads_updated: number;
  };
}

/**
 * Protected fields that cannot be updated via bulk edit
 */
const PROTECTED_FIELDS = new Set([
  'id',
  'institution_id',
  'lifecycle_status',
  'created_at',
  'created_by',
  'original_admission_id',
  'original_student_id',
  'migration_source',
  'migrated_at'
]);

interface FieldChange {
  field: string;
  fieldLabel: string;
  oldValue: any;
  newValue: any;
}

interface PreviewResult {
  exists: boolean;
  isActive: boolean;
  /**
   * Cells that carried a value but matched no lookup row (e.g. a quota label
   * that isn't in `quotas`). The field is skipped on write, so the reviewer has
   * to be told — silently dropping it is how the previous version hid problems.
   */
  warnings?: string[];
  // 2026-06-29: eligibility under the requested lifecycle scope. Active flow
  // requires active; the enquiry (non-active) flow requires NOT active. The
  // active routes ignore this field and keep reading `isActive`.
  eligible?: boolean;
  hasAccess: boolean;
  learnerName?: string;
  changes: FieldChange[];
  /**
   * Present only when the row carried reference cells. Drives the validate
   * step's "linked vs name-only" buckets and the consultant-commission banner.
   */
  reference?: {
    outcome: ReferenceOutcome;
    /** Tier 3 — a real name with no record behind it (old staff, old learner). */
    nameOnly?: { type: ReferenceTypeKey; name: string };
    /**
     * What trg_sync_learner_referral_to_attribution will do. Only ever set for
     * consultants — the trigger's EXISTS guard ignores staff and student ids.
     */
    attribution?: 'create' | 'replace';
  };
}

/**
 * Field labels for display
 */
const FIELD_LABELS: Record<string, string> = {
  first_name: 'First Name',
  last_name: 'Last Name',
  first_name_tamil: 'First Name (Tamil)',
  last_name_tamil: 'Last Name (Tamil)',
  date_of_birth: 'Date of Birth',
  gender: 'Gender',
  religion: 'Religion',
  community: 'Community',
  caste: 'Caste',
  aadhar_number: 'Aadhar Number',
  blood_group: 'Blood Group',
  abc_id: 'ABC ID',
  emis: 'EMIS Number',
  umis: 'UMIS Number',
  admission_year: 'Admission Year',
  father_name: 'Father Name',
  father_occupation: 'Father Occupation',
  father_mobile: 'Father Mobile',
  mother_name: 'Mother Name',
  mother_occupation: 'Mother Occupation',
  mother_mobile: 'Mother Mobile',
  annual_income: 'Annual Income',
  degree_id: 'Degree ID',
  department_id: 'Department ID',
  program_id: 'Program ID',
  semester_id: 'Semester ID',
  section_id: 'Section ID',
  academic_year_id: 'Academic Year ID',
  regulation_id: 'Regulation ID',
  batch_id: 'Batch ID',
  student_mobile: 'Student Mobile',
  college_email: 'College Email',
  student_email: 'Personal Email',
  permanent_address_street: 'Address Street',
  permanent_address_taluk: 'Address Taluk',
  permanent_address_district: 'Address District',
  permanent_address_pin_code: 'Address Pin Code',
  permanent_address_state: 'Address State',
  entry_type: 'Entry Type',
  scholarship_type: 'Scholarship Type',
  last_school: 'Last School',
  board_of_study: 'Board of Study',
  roll_number: 'Roll Number',
  register_number: 'Register Number',
  quota: 'Quota',
  student_photo_url: 'Photo URL',
  accommodation_type: 'Accommodation Type',
  bus_required: 'Bus Required',
  reference_type: 'Reference Type',
  reference_name: 'Reference Name',
  reference_contact: 'Reference Contact',
  // The typed reference. reference_type / reference_name are written as legacy
  // mirrors of these two and are deliberately NOT surfaced as separate preview
  // rows — one logical edit would otherwise render as six.
  referral_type: 'Reference Type',
  referred_by_name: 'Reference Person',
  referred_by_id: 'Reference Person',
  medical_cutoff_marks: 'Medical Cutoff Marks',
  engineering_cutoff_marks: 'Engineering Cutoff Marks',
  neet_roll_number: 'NEET Roll Number',
  neet_score: 'NEET Score',
  counseling_applied: 'Counseling Applied',
  counseling_number: 'Counseling Number'
};

/**
 * Reference columns that actually differ from what is stored.
 *
 * Returning only the diff is what keeps a re-uploaded, unedited template at
 * "no changes". Merging all six columns unconditionally would bump updated_at
 * on every row and report the whole sheet as updated — the same phantom-changes
 * failure bulk-learner-fk-fields.ts was written to fix, one field group over.
 */
function diffReferenceValues(
  values: Record<string, any>,
  existing: Record<string, any> | null | undefined
): Record<string, any> {
  const diff: Record<string, any> = {};
  for (const [key, value] of Object.entries(values)) {
    const stored = existing?.[key];
    const a = stored === null || stored === undefined ? '' : String(stored);
    const b = value === null || value === undefined ? '' : String(value);
    if (a !== b) diff[key] = value;
  }
  return diff;
}

/**
 * What trg_sync_learner_referral_to_attribution will do for this row.
 *
 * The trigger inserts a consultant_lead_attributions row at 100% primary only
 * when the new referred_by_id EXISTS in education_consultants, so staff and
 * student references have no commission effect at all.
 */
function classifyAttribution(
  values: Record<string, any>,
  existing: Record<string, any> | null | undefined,
  resolvers: ReferenceResolvers
): 'create' | 'replace' | undefined {
  const newId = values.referred_by_id;
  if (!newId) return undefined;
  const oldId = existing?.referred_by_id ?? null;
  if (oldId === newId) return undefined;
  if (resolvers.byId.get(String(newId).toLowerCase())?.type !== 'consultant') return undefined;
  return oldId ? 'replace' : 'create';
}

const referenceTypeLabel = (value: unknown): string =>
  REFERENCE_TYPE_EXCEL_LABEL[value as ReferenceTypeKey] ?? String(value ?? '');

/**
 * Bulk Edit Learner Service
 */
export class BulkLearnerEditService {
  /**
   * Preview changes for a single learner
   * Compares uploaded data with existing data and returns field-by-field changes
   */
  static async previewChanges(
    learnerId: string,
    uploadedData: any,
    userInstitutionId?: string,
    isSuperAdmin: boolean = false,
    requireActive: boolean = true
  ): Promise<PreviewResult> {
    // Validate learner exists and is active
    const learnerCheck = await LearnerValidationService.validateActiveLearner(learnerId);

    if (!learnerCheck.exists) {
      return {
        exists: false,
        isActive: false,
        eligible: false,
        hasAccess: false,
        changes: []
      };
    }

    // 2026-06-29: eligibility scope. Active flow requires active; the enquiry
    // (non-active) flow requires NOT active.
    const isEligible = requireActive ? learnerCheck.isActive : !learnerCheck.isActive;
    if (!isEligible) {
      return {
        exists: true,
        isActive: learnerCheck.isActive,
        eligible: false,
        hasAccess: false,
        learnerName: 'Unknown',
        changes: []
      };
    }

    // Check institution access
    const hasAccess = isSuperAdmin || !userInstitutionId ||
      learnerCheck.learner.institution_id === userInstitutionId;

    if (!hasAccess) {
      return {
        exists: true,
        isActive: learnerCheck.isActive,
        eligible: true,
        hasAccess: false,
        learnerName: 'Unknown',
        changes: []
      };
    }

    // Fetch full learner data
    const { data: existingLearner, error } = await supabaseAdmin
      .from('learners_profiles')
      .select('*')
      .eq('id', learnerId)
      .single();

    if (error || !existingLearner) {
      return {
        exists: true,
        isActive: learnerCheck.isActive,
        eligible: true,
        hasAccess: true,
        learnerName: 'Unknown',
        changes: []
      };
    }

    const learnerName = `${existingLearner.first_name} ${existingLearner.last_name || ''}`.trim();

    // FK-backed fields (Community / Caste / Quota / Accommodation Type /
    // Admission Year) store a uuid but travel through Excel as a readable
    // label. Resolve label -> id and compare id-to-id below.
    //
    // The previous version compared the uploaded label against
    // existingLearner['community'] etc. — TEXT columns dropped by the FK-only
    // migrations. Reading a missing column yields `undefined`, which rendered as
    // "(empty)" and differed from every populated cell, so a freshly downloaded
    // template round-tripped as thousands of phantom changes.
    const [resolvers, referenceResolvers] = await Promise.all([
      getLearnerFkResolvers(supabaseAdmin),
      getReferenceResolvers(supabaseAdmin),
    ]);
    const fk = resolveLearnerFkFields(uploadedData, resolvers, {
      institutionId: existingLearner.institution_id,
      existing: existingLearner,
    });

    // Compare fields and detect changes
    const changes: FieldChange[] = [];

    Object.entries(uploadedData).forEach(([key, newValue]) => {
      // Skip ID and protected fields
      if (key === 'id' || PROTECTED_FIELDS.has(key)) {
        return;
      }

      // Handled by the FK pass below — never by raw string comparison.
      if (FK_CONSUMED_KEYS.has(key)) {
        return;
      }

      // Same for the reference cells: (Type, ID, Person, Contact) resolve
      // together into six columns, so comparing them one-by-one against the
      // stored value would both miss the link and print raw uuids.
      if (REFERENCE_CONSUMED_KEYS.has(key)) {
        return;
      }

      // Skip if no new value provided
      if (newValue === undefined || newValue === null || newValue === '') {
        return;
      }

      const oldValue = existingLearner[key];

      // Compare values (handle different types)
      let isDifferent = false;

      if (typeof newValue === 'object' && typeof oldValue === 'object') {
        // For nested objects (tenth_marks, twelfth_marks)
        isDifferent = JSON.stringify(newValue) !== JSON.stringify(oldValue);
      } else {
        // Convert to strings for comparison
        const oldStr = oldValue === null || oldValue === undefined ? '' : String(oldValue);
        const newStr = String(newValue);
        isDifferent = oldStr !== newStr;
      }

      if (isDifferent) {
        changes.push({
          field: key,
          fieldLabel: FIELD_LABELS[key] || key,
          oldValue: oldValue === null || oldValue === undefined ? '(empty)' : oldValue,
          newValue: newValue
        });
      }
    });

    // FK pass — compare stored id against resolved id, but SHOW the labels so
    // the preview table stays readable rather than printing uuids.
    for (const spec of FK_FIELD_SPECS) {
      const newId = fk.ids[spec.idColumn];
      if (!newId) continue;

      const oldId = existingLearner[spec.idColumn] ?? null;
      if (oldId === newId) continue;

      changes.push({
        field: spec.idColumn,
        fieldLabel: spec.fieldLabel,
        oldValue: fkLabel(resolvers, spec, oldId) ?? '(empty)',
        newValue: fkLabel(resolvers, spec, newId) ?? newId
      });
    }

    // Reference pass — (Type, ID, Person, Contact) resolve together into the
    // typed triple plus its legacy mirror. Only two rows are surfaced here:
    // rendering all six would turn one logical edit into six preview lines.
    const reference = resolveLearnerReference(uploadedData, referenceResolvers, {
      existing: existingLearner,
    });
    const referenceDiff = diffReferenceValues(reference.values, existingLearner);

    if (referenceDiff.referral_type !== undefined) {
      changes.push({
        field: 'referral_type',
        fieldLabel: 'Reference Type',
        oldValue: existingLearner.referral_type
          ? referenceTypeLabel(existingLearner.referral_type)
          : '(empty)',
        newValue: referenceTypeLabel(referenceDiff.referral_type)
      });
    }

    if (
      referenceDiff.referred_by_name !== undefined ||
      referenceDiff.referred_by_id !== undefined
    ) {
      changes.push({
        field: 'referred_by_name',
        fieldLabel:
          reference.outcome === 'name_only' ? 'Reference Person (name only)' : 'Reference Person',
        oldValue: existingLearner.referred_by_name || '(empty)',
        newValue: reference.matched
          ? reference.matched.candidate.label
          : reference.values.referred_by_name || '(cleared)'
      });
    }

    if (referenceDiff.reference_contact !== undefined) {
      changes.push({
        field: 'reference_contact',
        fieldLabel: 'Reference Contact',
        oldValue: existingLearner.reference_contact || '(empty)',
        newValue: referenceDiff.reference_contact
      });
    }

    const warnings = [
      ...fk.unresolved.map(
        (u) => `${u.fieldLabel}: "${u.value}" matched no record — this field will be skipped.`
      ),
      ...reference.warnings
    ];

    return {
      exists: true,
      isActive: learnerCheck.isActive,
      eligible: true,
      hasAccess: true,
      learnerName,
      changes,
      reference:
        reference.outcome && Object.keys(referenceDiff).length > 0
          ? {
              outcome: reference.outcome,
              nameOnly: reference.nameOnly,
              attribution: classifyAttribution(referenceDiff, existingLearner, referenceResolvers)
            }
          : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Candidate lists + id lookup for the export template's reference dropdowns.
   * Routed through the service so the export keeps using one admin client and
   * the SAME lists the importer will match against — a dropdown offering an
   * option the importer can't resolve is worse than no dropdown.
   */
  static getReferenceLookups(): Promise<ReferenceResolvers> {
    return getReferenceResolvers(supabaseAdmin);
  }

  /**
   * Attach a "did you mean …?" suggestion to each name-only reference.
   *
   * This is what lets the reviewer tell a typo ("SURESH KUMR") from a genuinely
   * departed referrer ("K. BALAN, retired 2019") — both look identical
   * otherwise, and only one of them should be stored without a link.
   */
  static async buildReferenceHints(
    nameOnly: Array<{ type: ReferenceTypeKey; name: string }>
  ): Promise<Array<{ type: ReferenceTypeKey; name: string; hint: string | null }>> {
    if (nameOnly.length === 0) return [];
    const resolvers = await getReferenceResolvers(supabaseAdmin);
    const hints = buildReferenceTypoHints(nameOnly, resolvers);

    const seen = new Set<string>();
    const out: Array<{ type: ReferenceTypeKey; name: string; hint: string | null }> = [];
    for (const entry of nameOnly) {
      const key = referenceHintKey(entry.type, entry.name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ type: entry.type, name: entry.name, hint: hints.get(key) ?? null });
    }
    return out;
  }

  /**
   * Process bulk edit for exited learners
   * Only updates non-empty fields, preserves existing values for empty cells
   */
  static async processBulkEdit(
    rows: BulkEditRow[],
    userInstitutionId?: string,
    isSuperAdmin: boolean = false,
    userId?: string,
    requireActive: boolean = true
  ): Promise<BulkEditResult> {
    const result: BulkEditResult = {
      success: true,
      total_rows: rows.length,
      updated: 0,
      skipped: 0,
      failed: 0,
      updated_learners: [],
      errors: [],
      reference_summary: {
        linked: 0,
        name_only: 0,
        type_only: 0,
        attributions_created: 0,
        attributions_replaced: 0,
        leads_updated: 0
      }
    };

    // Community / Caste / Quota / Accommodation Type / Admission Year arrive as
    // readable labels (or as "<Field> ID" uuids); storage is the FK column only.
    // Resolved through the SAME helper the preview used, so what the reviewer
    // approved is exactly what gets written.
    const [resolvers, referenceResolvers] = await Promise.all([
      getLearnerFkResolvers(supabaseAdmin),
      getReferenceResolvers(supabaseAdmin)
    ]);

    // Lead guard. admission_leads is the authority for referral attribution:
    // trg_sync_lead_referral_to_learner_profile mirrors a lead onto its linked
    // profile, so a reference written to the profile alone would be silently
    // reverted the next time that lead is edited. No ACTIVE learner is
    // lead-linked today — all 1,470 links sit on pre-conversion lifecycle
    // stages — so this map comes back empty; it exists so that the day one IS
    // back-linked, the authority gets written instead of drifting.
    //
    // Chunked because a single .in() over thousands of uuids builds a URL long
    // enough for PostgREST to reject with a 400.
    const leadByProfileId = new Map<string, string>();
    const learnerIds = [...new Set(rows.map((r) => r.data?.id).filter(Boolean))];
    for (let i = 0; i < learnerIds.length; i += 200) {
      const { data: leadRows, error: leadError } = await supabaseAdmin
        .from('admission_leads')
        .select('id, learner_profile_id')
        .in('learner_profile_id', learnerIds.slice(i, i + 200));
      if (leadError) {
        console.warn('[bulk-edit] Lead lookup failed, writing profiles only:', leadError.message);
        break;
      }
      for (const lead of (leadRows ?? []) as any[]) {
        if (lead.learner_profile_id) leadByProfileId.set(lead.learner_profile_id, lead.id);
      }
    }

    for (const row of rows) {
      try {
        // Skip rows with validation errors
        if (!row.validation.isValid) {
          result.errors.push({
            row: row.rowNumber,
            id: row.data.id,
            error: row.validation.errors.map(e => e.message).join(', ')
          });
          result.failed++;
          continue;
        }

        const learnerId = row.data.id;

        // Validate learner exists and is active
        const learnerCheck = await LearnerValidationService.validateActiveLearner(learnerId);

        if (!learnerCheck.exists) {
          result.errors.push({
            row: row.rowNumber,
            id: learnerId,
            error: 'Learner not found'
          });
          result.failed++;
          continue;
        }

        // 2026-06-29: eligibility scope. Active flow requires active; the
        // enquiry (non-active) flow requires NOT active.
        const isEligible = requireActive ? learnerCheck.isActive : !learnerCheck.isActive;
        if (!isEligible) {
          result.errors.push({
            row: row.rowNumber,
            id: learnerId,
            error: requireActive
              ? 'Learner is not in active status'
              : 'Learner is an active student — edit it from the Profiles page'
          });
          result.failed++;
          continue;
        }

        // Check institution access (if not super admin)
        if (!isSuperAdmin && userInstitutionId) {
          if (learnerCheck.learner.institution_id !== userInstitutionId) {
            result.errors.push({
              row: row.rowNumber,
              id: learnerId,
              error: 'No access to this learner (different institution)'
            });
            result.failed++;
            continue;
          }
        }

        // Build partial update object (only non-empty fields)
        const updateData: any = {};
        const fieldsUpdated: string[] = [];

        Object.entries(row.data).forEach(([key, value]) => {
          // Skip ID and protected fields
          if (key === 'id' || PROTECTED_FIELDS.has(key)) {
            return;
          }

          // FK-backed fields are resolved below — never written raw. The label
          // columns they arrive in (community, caste, quota, …) no longer exist
          // on learners_profiles, so letting one through would fail the update.
          if (FK_CONSUMED_KEYS.has(key)) {
            return;
          }

          // Reference cells resolve together into six columns below. Letting
          // reference_type through raw would write the Excel label ('Consultant')
          // into a column whose CHECK only accepts the lowercase DB values.
          if (REFERENCE_CONSUMED_KEYS.has(key)) {
            return;
          }

          // Only update if value is provided (not empty)
          if (value !== undefined && value !== null && value !== '') {
            updateData[key] = value;
            fieldsUpdated.push(key);
          }
        });

        // Label (or "<Field> ID" uuid) -> FK column. Unresolvable labels are
        // left out entirely, preserving whatever the DB already holds; the
        // preview surfaced them as a warning before the user confirmed.
        const fk = resolveLearnerFkFields(row.data, resolvers, {
          institutionId: learnerCheck.learner.institution_id,
          existing: learnerCheck.learner,
        });
        for (const [column, id] of Object.entries(fk.ids)) {
          updateData[column] = id;
          fieldsUpdated.push(column);
        }

        // Reference pass — same resolver the preview ran, so what the reviewer
        // approved is what gets written. Only the columns that actually differ
        // are merged; re-uploading an unedited template must stay a no-op.
        const reference = resolveLearnerReference(row.data, referenceResolvers, {
          existing: learnerCheck.learner
        });
        const referenceDiff = diffReferenceValues(reference.values, learnerCheck.learner);
        for (const [column, value] of Object.entries(referenceDiff)) {
          updateData[column] = value;
          fieldsUpdated.push(column);
        }

        // Skip if no fields to update
        if (Object.keys(updateData).length === 0) {
          result.skipped++;
          continue;
        }

        // Update timestamp
        updateData.updated_at = new Date().toISOString();

        // Perform update.
        // Extra safety: never cross the active boundary. The active flow pins to
        // active; the enquiry (non-active) flow pins to everything-but-active.
        let updateQuery = supabaseAdmin
          .from('learners_profiles')
          .update(updateData)
          .eq('id', learnerId);
        updateQuery = requireActive
          ? updateQuery.eq('lifecycle_status', 'active')
          : updateQuery.neq('lifecycle_status', 'active');
        const { data: updatedLearner, error: updateError } = await updateQuery
          .select('id, first_name, last_name')
          .single();

        if (updateError) {
          result.errors.push({
            row: row.rowNumber,
            id: learnerId,
            error: `Update failed: ${updateError.message}`
          });
          result.failed++;
          continue;
        }

        result.updated++;
        result.updated_learners.push({
          id: updatedLearner.id,
          name: `${updatedLearner.first_name} ${updatedLearner.last_name || ''}`.trim(),
          fields_updated: fieldsUpdated
        });

        if (reference.outcome && Object.keys(referenceDiff).length > 0) {
          result.reference_summary[reference.outcome]++;
          const attribution = classifyAttribution(
            referenceDiff,
            learnerCheck.learner,
            referenceResolvers
          );
          if (attribution === 'create') result.reference_summary.attributions_created++;
          if (attribution === 'replace') result.reference_summary.attributions_replaced++;

          // Keep the lead in step when one exists, so its mirror trigger can't
          // revert what we just wrote. Empty map today — see the lookup above.
          const leadId = leadByProfileId.get(learnerId);
          if (leadId) {
            const { error: leadUpdateError } = await supabaseAdmin
              .from('admission_leads')
              .update({
                referral_type: reference.values.referral_type ?? null,
                referred_by_id: reference.values.referred_by_id ?? null,
                referred_by_name: reference.values.referred_by_name ?? null
              })
              .eq('id', leadId);

            if (leadUpdateError) {
              console.warn(
                `[bulk-edit] Profile ${learnerId} updated but its lead ${leadId} did not: ${leadUpdateError.message}`
              );
            } else {
              result.reference_summary.leads_updated++;
            }
          }
        }

      } catch (error) {
        console.error('[bulk-edit] Error processing row:', error);
        result.errors.push({
          row: row.rowNumber,
          id: row.data.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        result.failed++;
      }
    }

    result.success = result.failed === 0;

    // Log bulk edit activity (summary)
    try {
      if (userId) {
        const fieldsUpdated = [...new Set(result.updated_learners?.flatMap((l: any) => l.fields_updated || []) || [])];
        await supabaseAdmin.from('user_activity_logs').insert({
          user_id: userId,
          action_type: 'update',
          resource_type: 'learner',
          description: `Bulk edited ${result.updated || 0} learner profiles (${fieldsUpdated.join(', ')})`,
          institution_id: userInstitutionId || undefined,
          metadata: {
            sub_type: 'bulk_edit',
            updated_count: result.updated,
            failed_count: result.failed,
            skipped_count: result.skipped,
            fields_updated: fieldsUpdated,
            total_rows: rows.length,
          },
        });
      }
    } catch (logError) {
      console.error('[bulk-edit] Failed to log activity:', logError);
    }

    return result;
  }

  /**
   * Export active learners for bulk edit
   * Returns current data with empty/missing fields highlighted
   * Uses pagination to fetch ALL records (no limit)
   */
  static async exportActiveForEdit(
    institutionId?: string,
    includeComplete: boolean = false,
    degreeId?: string,
    departmentId?: string,
    programId?: string,
    semesterId?: string,
    sectionId?: string,
    lifecycleScope: 'active' | 'non_active' = 'active'
  ): Promise<any[]> {
    console.log('[bulk-edit] Export parameters:', {
      institutionId,
      includeComplete,
      degreeId,
      departmentId,
      programId,
      semesterId,
      sectionId
    });

    // Build base query
    // 2026-05-02 (Phase C-8): added admission_year_obj join so the Excel
    // export can derive the legacy integer from the FK once Phase D drops the
    // admission_year column.
    const buildQuery = () => {
      let query = supabaseAdmin
        .from('learners_profiles')
        .select(`
          *,
          institution:institutions(id, name),
          degree:degrees(id, degree_name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters(id, semester_name),
          section:sections(id, section_name),
          academic_year:academic_years(id, academic_year_name),
          regulation:regulations(id, regulation_year, regulation_code),
          batch:batches(id, batch_name),
          admission_year_obj:admission_years!admission_year_id(year),
          quota_ref:quotas!quota_id(name),
          community_ref:community_categories!community_category_id(code),
          caste_ref:castes!caste_id(name),
          accommodation_ref:accommodation_types!accommodation_type_id(name)
        `);

      // 2026-06-29: scope by lifecycle status. 'active' = Profiles page (default,
      // unchanged). 'non_active' = Enquiries page (every admission lifecycle stage
      // except active).
      if (lifecycleScope === 'non_active') {
        query = query.neq('lifecycle_status', 'active');
      } else {
        query = query.eq('lifecycle_status', 'active');
      }

      // Filter by institution if specified
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      // Filter by degree if specified
      if (degreeId) {
        query = query.eq('degree_id', degreeId);
      }

      // Filter by department if specified
      if (departmentId) {
        query = query.eq('department_id', departmentId);
      }

      // Filter by program if specified
      if (programId) {
        query = query.eq('program_id', programId);
      }

      // Filter by semester if specified
      if (semesterId) {
        query = query.eq('semester_id', semesterId);
      }

      // Filter by section if specified
      if (sectionId) {
        query = query.eq('section_id', sectionId);
      }

      // Filter by profile completeness if requested (include NULL as incomplete).
      // Only meaningful for the active scope; enquiries are inherently incomplete
      // and are always returned in full.
      if (lifecycleScope === 'active' && !includeComplete) {
        query = query.or('is_profile_complete.eq.false,is_profile_complete.is.null');
      }

      return query;
    };

    // Fetch ALL records using pagination (no limit)
    const BATCH_SIZE = 1000;
    let allLearners: any[] = [];
    let offset = 0;
    let hasMore = true;

    console.log('[bulk-edit] Starting paginated fetch with batch size:', BATCH_SIZE);

    while (hasMore) {
      const query = buildQuery()
        .range(offset, offset + BATCH_SIZE - 1)
        .order('created_at', { ascending: false });

      const { data: batch, error } = await query;

      if (error) {
        console.error('[bulk-edit] Error fetching learners batch:', error);
        throw new Error(`Failed to fetch learners: ${error.message}`);
      }

      if (batch && batch.length > 0) {
        allLearners = allLearners.concat(batch);
        console.log(`[bulk-edit] Fetched batch: ${batch.length} records (total so far: ${allLearners.length})`);

        // Check if there are more records
        if (batch.length < BATCH_SIZE) {
          hasMore = false;
        } else {
          offset += BATCH_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    console.log('[bulk-edit] Export complete. Total learners fetched:', allLearners.length);

    return allLearners;
  }
}
