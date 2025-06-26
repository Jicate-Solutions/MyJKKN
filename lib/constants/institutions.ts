// lib/constants/institutions.ts

export const INSTITUTION_TYPES = [
  { value: 'self', label: 'Self' },
  { value: 'autonomous', label: 'Autonomous' },
  { value: 'aided', label: 'Aided' }
] as const;

export const INSTITUTION_CATEGORIES = [
  { value: 'ug', label: 'UG' },
  { value: 'pg', label: 'PG' },
  { value: 'ug_pg', label: 'UG & PG' }
] as const;

export const TIMETABLE_TYPES = [
  { value: 'day_order', label: 'Day Order' },
  { value: 'week_order', label: 'Week Order' }
] as const;

export const DEPARTMENT_TYPES = [
  'transportation',
  'administration',
  'accounts',
  'admission',
  'placement',
  'antiRagging'
] as const;
