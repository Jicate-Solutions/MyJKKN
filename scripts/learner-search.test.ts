import assert from 'node:assert/strict';
import {
  buildLearnerSearchConditions
} from '../lib/utils/learner-search';

const advancedSearch = 'name:Jane Doe|roll:2024|email:jane@jkkn.ac.in';
const advancedConditions = buildLearnerSearchConditions(advancedSearch, {
  caseSensitive: false,
  exactMatch: false,
  searchFields: ['name', 'rollNumber', 'collegeEmail']
});

assert.deepEqual(advancedConditions, [
  'first_name.ilike.%Jane Doe%',
  'last_name.ilike.%Jane Doe%',
  'roll_number.ilike.%2024%',
  'college_email.ilike.%jane@jkkn.ac.in%'
]);

const exactEmailConditions = buildLearnerSearchConditions(
  'email:User@JKKN.ac.in',
  {
    caseSensitive: false,
    exactMatch: true,
    searchFields: ['collegeEmail']
  }
);

assert.deepEqual(exactEmailConditions, [
  'college_email.ilike.User@JKKN.ac.in'
]);

const fallbackConditions = buildLearnerSearchConditions('Riya', {
  caseSensitive: false,
  exactMatch: false,
  searchFields: ['name']
});

assert.deepEqual(fallbackConditions, [
  'first_name.ilike.%Riya%',
  'last_name.ilike.%Riya%'
]);

console.log('learner-search tests passed');
