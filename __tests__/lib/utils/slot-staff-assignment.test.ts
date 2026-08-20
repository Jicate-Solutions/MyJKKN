/**
 * Regression tests for slot staff-assignment matching.
 *
 * BUG (reported 2026-08-10 by MISS. THENMOZHI V, thenmozhi.v@jkkn.ac.in,
 * Staff Counselor, Pharmacology, JKKN College of Pharmacy): "Periods not
 * showing" on /academic/attendance, with the captured console log reading
 * "Number of periods found: 1". A period was found and then not rendered.
 *
 * Root cause chain, all verified against production:
 *   1. available-periods-cards renders only periods for which
 *      attendancePermissions.get(timetable_slot_id) === true. That map is
 *      built in attendance/page.tsx from canMarkAttendanceForSlot, whose first
 *      tier is isStaffAssignedToSlot.
 *   2. isStaffAssignedToSlot loads the slot from timetables.timetable_data and
 *      looks for the staff in slot.staff_members and
 *      slot.sub_slots[].staff_members.
 *   3. staff_members is not persisted. It is built by
 *      getAvailablePeriodsForDate when it hydrates staff_ids against the staff
 *      table. Across every active timetable in production: 12,296 slots,
 *      12,296 with staff_ids, 12,296 with primary_staff_id, 0 with
 *      staff_members. The check therefore could not succeed for any standard
 *      period, for any staff member. Only the practical branch (written
 *      against practical_config, which IS stored) could return true.
 *   4. Tier 2 (checkHODDepartmentAccess) requires profiles.role === 'hod'; tier
 *      3 (checkFacultyAttendancePermission) reads custom_roles for
 *      profiles.role alone. Her profiles.role is 'staff_counselor'
 *      (academic.attendance.mark = false), so both denied — even though she
 *      holds a secondary 'hod' role in user_roles (mark = true), which is what
 *      canAccess() unions and what let her reach the search UI in the first
 *      place.
 *
 * So the period was fetched (the search path matched her via staff_ids), then
 * hidden (the marking path could not), and the empty state read
 * "You are not assigned to teach any periods for this class on the selected
 * date" — about the very periods she is the primary staff for.
 *
 * These tests pin the assignment predicate to the fields that are actually
 * stored, so what a user is shown and what they may mark cannot drift apart
 * again.
 */

import { describe, it, expect } from 'vitest';
import { isStaffAssignedToRawSlot } from '@/lib/utils/academic/slot-staff-assignment';

// Real production identifiers from the report.
const THENMOZHI_STAFF_ID = '5a4e3be9-f84b-488b-a654-2a3c2aee3e40';
const OTHER_STAFF_ID = 'cb30e0e6-9ddc-4c55-8e22-500f1cfaf802';

/**
 * timetable 32214ba4 (PHARMD, semester b8f51b77), MONDAY, period 4f897756.
 * Copied verbatim from production. This is the shape that made the search
 * report "1 period found" and the screen show none.
 */
const STANDARD_SLOT = {
  slot_id: 'ffa5d636-7f3d-4248-af05-9b32474ca2bc',
  course_id: '0197799f-a1bc-4854-93d5-0ccadb81361d',
  slot_date: null,
  staff_ids: [THENMOZHI_STAFF_ID],
  sub_slots: [],
  is_combined: false,
  period_mode: 'standard',
  section_ids: ['356415aa-744f-44b7-b5fb-d8b20f579dc4'],
  is_break_slot: false,
  is_subdivided: false,
  practical_config: null,
  primary_staff_id: THENMOZHI_STAFF_ID
};

/**
 * timetable c98cb87d, FRIDAY, period 7e23e9fb — a combined class. The slot
 * itself has no staff; each sub-slot carries its own teacher.
 */
const COMBINED_SLOT = {
  slot_id: '8a34d809-d515-497d-a876-9c70e5060179',
  course_id: null,
  staff_ids: [],
  sub_slots: [
    {
      course_id: '549190bb-bbc9-49b3-87c6-447ad3961177',
      staff_ids: [OTHER_STAFF_ID],
      sub_slot_order: 1
    },
    {
      course_id: '8dcb8ad4-7b04-4089-b723-12b69bd5c33e',
      staff_ids: [THENMOZHI_STAFF_ID],
      sub_slot_order: 2
    }
  ],
  is_combined: true,
  period_mode: 'standard',
  section_ids: [],
  practical_config: null,
  primary_staff_id: null
};

/**
 * timetable c98cb87d, MONDAY, period 7e23e9fb — a practical. Staff live per
 * batch under practical_config, keyed by course id.
 */
const PRACTICAL_SLOT = {
  slot_id: 'a1d3c9c2-0000-4000-8000-000000000001',
  staff_ids: [],
  sub_slots: [],
  period_mode: 'practical',
  primary_staff_id: null,
  practical_config: {
    rotation_type: 'manual',
    staff_mapping: {},
    batches: [
      {
        batch_id: 'batch_1782280401218',
        batch_name: 'Batch A',
        staff_mapping: {
          'dc0a6989-4390-43ce-9eaf-26d421c63157': [
            'a6c1b108-76ea-4e27-9201-0822f32a4082',
            THENMOZHI_STAFF_ID
          ]
        }
      },
      {
        batch_id: 'batch_1782280401795',
        batch_name: 'Batch B',
        staff_mapping: {
          '4c6d2d52-32e3-40a7-8625-355fbf94f6b9': [
            'e3fc73a2-891b-421a-81da-fd17a3870730'
          ]
        }
      }
    ]
  }
};

describe('isStaffAssignedToRawSlot', () => {
  describe('slots as they are actually stored in timetable_data', () => {
    it('matches the assigned staff on a standard slot (the reported bug)', () => {
      // Before the fix this returned false: the slot has no `staff_members`,
      // so the period was fetched by the search and then hidden by the
      // permission gate.
      expect(isStaffAssignedToRawSlot(STANDARD_SLOT, THENMOZHI_STAFF_ID)).toBe(
        true
      );
    });

    it('matches via primary_staff_id even when staff_ids is empty', () => {
      const slot = { ...STANDARD_SLOT, staff_ids: [] };
      expect(isStaffAssignedToRawSlot(slot, THENMOZHI_STAFF_ID)).toBe(true);
    });

    it('matches via staff_ids even when primary_staff_id is null', () => {
      const slot = { ...STANDARD_SLOT, primary_staff_id: null };
      expect(isStaffAssignedToRawSlot(slot, THENMOZHI_STAFF_ID)).toBe(true);
    });

    it('matches a sub-slot teacher on a combined class', () => {
      expect(isStaffAssignedToRawSlot(COMBINED_SLOT, THENMOZHI_STAFF_ID)).toBe(
        true
      );
    });

    it('matches a practical assigned through practical_config batches', () => {
      expect(isStaffAssignedToRawSlot(PRACTICAL_SLOT, THENMOZHI_STAFF_ID)).toBe(
        true
      );
    });
  });

  describe('hydrated slots from the search path', () => {
    it('still matches a slot carrying staff_members instead of staff_ids', () => {
      const hydrated = {
        staff_ids: [],
        primary_staff_id: null,
        staff_members: [{ id: THENMOZHI_STAFF_ID, first_name: 'THENMOZHI' }]
      };
      expect(isStaffAssignedToRawSlot(hydrated, THENMOZHI_STAFF_ID)).toBe(true);
    });

    it('still matches a hydrated sub-slot teacher', () => {
      const hydrated = {
        staff_ids: [],
        sub_slots: [
          { staff_members: [{ id: THENMOZHI_STAFF_ID }], staff_ids: [] }
        ]
      };
      expect(isStaffAssignedToRawSlot(hydrated, THENMOZHI_STAFF_ID)).toBe(true);
    });
  });

  describe('does not over-grant', () => {
    it('rejects a staff member who teaches none of the slot', () => {
      expect(
        isStaffAssignedToRawSlot(STANDARD_SLOT, 'b36e6f3a-9430-43f3-a972-6a3de6ae6eba')
      ).toBe(false);
    });

    it('rejects a staff member absent from every sub-slot', () => {
      expect(
        isStaffAssignedToRawSlot(COMBINED_SLOT, '08f54b8c-534e-46b2-a463-5c32138db688')
      ).toBe(false);
    });

    it('rejects a staff member absent from every practical batch', () => {
      expect(
        isStaffAssignedToRawSlot(PRACTICAL_SLOT, 'd7db496a-d2ce-4e3b-be33-268791998cb3')
      ).toBe(false);
    });

    it('does not read practical_config on a standard period', () => {
      // A slot left with stale practical_config but switched to standard must
      // not authorise its old batch staff.
      const stale = { ...PRACTICAL_SLOT, period_mode: 'standard' };
      expect(isStaffAssignedToRawSlot(stale, THENMOZHI_STAFF_ID)).toBe(false);
    });

    it('returns false rather than throwing on a missing slot or id', () => {
      expect(isStaffAssignedToRawSlot(null, THENMOZHI_STAFF_ID)).toBe(false);
      expect(isStaffAssignedToRawSlot(undefined, THENMOZHI_STAFF_ID)).toBe(false);
      expect(isStaffAssignedToRawSlot(STANDARD_SLOT, null)).toBe(false);
      expect(isStaffAssignedToRawSlot(STANDARD_SLOT, '')).toBe(false);
    });

    it('tolerates malformed practical_config without throwing', () => {
      const malformed = {
        period_mode: 'practical',
        practical_config: { batches: [null, { staff_mapping: 'nonsense' }, {}] }
      };
      expect(isStaffAssignedToRawSlot(malformed, THENMOZHI_STAFF_ID)).toBe(false);
    });
  });
});

