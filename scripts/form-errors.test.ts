import assert from 'node:assert/strict';
import type { FieldErrors } from 'react-hook-form';
import { getFirstErrorField } from '../lib/utils/form-errors';

type FormValues = {
  first_name: string;
  last_name: string;
  email: string;
};

const fieldOrder: Array<keyof FormValues> = [
  'first_name',
  'last_name',
  'email'
];

const errorsWithLastName = {
  last_name: { message: 'Required', type: 'required' },
  email: { message: 'Invalid', type: 'pattern' }
} as FieldErrors<FormValues>;

const errorsWithEmail = {
  email: { message: 'Invalid', type: 'pattern' }
} as FieldErrors<FormValues>;

const emptyErrors = {} as FieldErrors<FormValues>;

assert.equal(getFirstErrorField(errorsWithLastName, fieldOrder), 'last_name');
assert.equal(getFirstErrorField(errorsWithEmail, fieldOrder), 'email');
assert.equal(getFirstErrorField(emptyErrors, fieldOrder), undefined);

console.log('form-errors tests passed');
