// ============================================================================
// lib/id-cards/field-report.ts
// Created: 2026-09-07 — the per-field "what would print wrong" report.
//
// Built by GET /api/id-cards/templates/:id/render?include=fields and read by
// the preview dialogs (single learner, bulk selection, cohort batch). One row
// per value the card draws, front then back:
//   • value === null  → the card prints that field BLANK (painted red).
//   • problem set     → the value is present but wrong. Today that is the
//     permanent address, classified by address-quality.ts on the SAME five
//     columns the card joins — so the Address Check page and the print
//     preview can never disagree about a record.
//
// Back rows are reported only when the template has a back side: a field the
// card never prints is not "missing". Institution-level rows (contacts,
// principal) are reported once per card too, because a batch whose template
// lost its principal signature must show it on every card, not nowhere.
//
// Pure — no I/O — so it is unit-tested directly (__tests__/lib/id-cards/
// field-report.test.ts) and safe to import from either side of the wire.
// ============================================================================

import type { CardFieldReport } from '@/types/id-cards';
import type { CardPersonData } from './render-data';
import {
  ADDRESS_ISSUE_META,
  assessAddress,
  needsHumanDecision,
  type AddressAssessment
} from './address-quality';

function present(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  return v === '' ? null : v;
}

export interface FieldReportInput {
  person: CardPersonData;
  validUntilLabel: string;
  /** The photo fallback chain produced a picture. */
  photoResolved: boolean;
  /** The QR payload rendered (fail-soft generator may return null). */
  qrResolved: boolean;
  /** The template's principal signature image was fetched. */
  signatureResolved: boolean;
  backConfigured: boolean;
}

/**
 * Which address findings block a card. "Needs a person" (critical / high:
 * two PIN codes, a phone in the street, filler text, pasted labels, junk
 * characters) always does. Of the medium findings only "cut off on every
 * layout" does — a merely-long or duplicated address prints readable, and
 * flagging 87% of a college red would hide the records that matter.
 */
export function addressProblemOf(assessment: AddressAssessment): {
  problem: string;
  severity: 'critical' | 'high' | 'medium';
  fix: string;
} | null {
  const blocking = assessment.issues.filter(
    (code) =>
      ADDRESS_ISSUE_META[code].severity !== 'medium' || code === 'over_printable_length'
  );
  if (blocking.length === 0) return null;
  const severity = needsHumanDecision(assessment) ? (assessment.severity as 'critical' | 'high') : 'medium';
  const labels = blocking.map((code) => ADDRESS_ISSUE_META[code].label);
  if (assessment.conflictingPinCodes.length > 1) {
    labels[labels.indexOf(ADDRESS_ISSUE_META.pin_conflict.label)] =
      `${ADDRESS_ISSUE_META.pin_conflict.label} (${assessment.conflictingPinCodes.join(' / ')})`;
  }
  return {
    problem: labels.join('; '),
    severity,
    fix: ADDRESS_ISSUE_META[blocking[0]].fix
  };
}

/**
 * Every value the card draws, with null where the render would leave a blank
 * and `problem` where the value is present but wrong.
 */
export function buildFieldReport(input: FieldReportInput): CardFieldReport[] {
  const { person, validUntilLabel, photoResolved, qrResolved, signatureResolved, backConfigured } =
    input;
  const isLearner = person.kind === 'learner';

  const front: CardFieldReport[] = [
    { key: 'name', label: 'Name', side: 'front', value: present(person.fullName) },
    isLearner
      ? { key: 'roll_number', label: 'Roll Number', side: 'front', value: present(person.rollNumber) }
      : { key: 'staff_id', label: 'Team member ID', side: 'front', value: present(person.staffId) },
    isLearner
      ? { key: 'course', label: 'Course', side: 'front', value: present(person.courseName) }
      : { key: 'designation', label: 'Designation', side: 'front', value: present(person.designation) },
    { key: 'department', label: 'Department', side: 'front', value: present(person.departmentName) },
    { key: 'institution', label: 'Institution', side: 'front', value: present(person.institutionName) },
    ...(isLearner
      ? [{ key: 'study_period', label: 'Study Period', side: 'front' as const, value: present(person.studyPeriod) }]
      : []),
    { key: 'valid_until', label: 'Valid Until', side: 'front', value: present(validUntilLabel) },
    { key: 'photo', label: 'Photo', side: 'front', value: photoResolved ? 'Available' : null },
    { key: 'qr_code', label: 'QR Code', side: 'front', value: qrResolved ? 'Available' : null }
  ];

  // The principal block is template-owned. Only a template that INTENDS a
  // principal block (a name or a signature image configured) can be missing
  // its signature — a template without one is not incomplete.
  if (present(person.principalName) || present(person.principalSignatureUrl)) {
    front.push({
      key: 'principal_name',
      label: 'Principal Name',
      side: 'front',
      value: present(person.principalName)
    });
    front.push({
      key: 'principal_signature',
      label: 'Principal Signature',
      side: 'front',
      value: signatureResolved ? 'Available' : null
    });
  }

  if (!backConfigured) return front;

  const addressRow: CardFieldReport = {
    key: 'address',
    label: 'Address',
    side: 'back',
    value: present(person.address)
  };
  if (isLearner && person.addressParts) {
    const found = addressProblemOf(assessAddress(person.addressParts));
    if (found) {
      addressRow.problem = found.problem;
      addressRow.problem_severity = found.severity;
      addressRow.problem_fix = found.fix;
    }
  }

  const back: CardFieldReport[] = [
    { key: 'blood_group', label: 'Blood Group', side: 'back', value: present(person.bloodGroup) },
    { key: 'date_of_birth', label: 'Date of Birth', side: 'back', value: present(person.dateOfBirthLabel) },
    ...(isLearner
      ? [
          { key: 'guardian', label: 'Guardian Name', side: 'back' as const, value: present(person.guardianName) },
          { key: 'guardian_phone', label: 'Guardian Phone', side: 'back' as const, value: present(person.guardianPhone) }
        ]
      : []),
    addressRow,
    { key: 'contact_phone', label: 'Contact Phone', side: 'back', value: present(person.contactPhone) },
    { key: 'barcode', label: 'Barcode (ID code)', side: 'back', value: present(person.idCode) },
    { key: 'institution_email', label: 'Institution Email', side: 'back', value: present(person.institutionEmail) },
    { key: 'institution_phone', label: 'Institution Phone', side: 'back', value: present(person.institutionPhone) },
    { key: 'institution_address', label: 'Institution Address', side: 'back', value: present(person.institutionAddress) }
  ];
  return [...front, ...back];
}

/** Rows the card would print blank. */
export function missingFields(fields: readonly CardFieldReport[]): CardFieldReport[] {
  return fields.filter((f) => f.value === null);
}

/** Rows whose value is present but flagged wrong (address quality). */
export function problemFields(fields: readonly CardFieldReport[]): CardFieldReport[] {
  return fields.filter((f) => f.value !== null && Boolean(f.problem));
}
