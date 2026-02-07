import assert from 'node:assert/strict';
import type { StaffFilters } from '../types/staff';
import {
  buildStaffSearchConditions,
  buildStaffSearchQuery,
  resolveStaffFiltersForUser
} from '../lib/utils/staff-search';

const searchQuery = buildStaffSearchQuery(
  {
    nameQuery: '  Alice Johnson ',
    emailQuery: '',
    institutionEmailQuery: '  alice@jkkn.ac.in  ',
    staffIdQuery: '',
    designationQuery: '  HOD '
  },
  {
    name: true,
    email: false,
    institutionEmail: true,
    staffId: false,
    designation: true
  }
);

assert.equal(
  searchQuery,
  'name:Alice Johnson|institution_email:alice@jkkn.ac.in|designation:HOD'
);

const conditions = buildStaffSearchConditions(searchQuery, {
  caseSensitive: false,
  exactMatch: false
});

assert.deepEqual(conditions, [
  'first_name.ilike.%Alice Johnson%',
  'last_name.ilike.%Alice Johnson%',
  'institution_email.ilike.%alice@jkkn.ac.in%',
  'designation.ilike.%HOD%'
]);

const baseFilters: StaffFilters = {
  department_id: 'dept-123',
  institution_id: 'inst-legacy'
};

const resolvedFilters = resolveStaffFiltersForUser(baseFilters, {
  role: 'hod',
  institution_id: 'inst-locked'
});

assert.equal(resolvedFilters.institution_id, 'inst-locked');
assert.equal(resolvedFilters.department_id, 'dept-123');
assert.equal(baseFilters.institution_id, 'inst-legacy');

console.log('staff-search tests passed');
