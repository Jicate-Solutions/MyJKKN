// lib/services/resource-management/default-slots.ts
// Single source of truth for the product-default booking slots applied to
// every resource that has no admin-configured time_slot_config. Keeping these
// here means the three slots and the custom-picker bounds never drift across
// the generator, the booking service, the picker UI, and the resource form.

import type { TimeSlotConfig, CustomTimeSlot } from '@/types/resource-management';

// The three quick-pick chips shown for every resource. End at 17:00 (5 PM).
export const DEFAULT_CUSTOM_SLOTS: CustomTimeSlot[] = [
  { id: 'default-full',      name: 'Full Day',  start_time: '09:00', end_time: '17:00', max_capacity: 1, is_active: true },
  { id: 'default-morning',   name: 'Morning',   start_time: '09:00', end_time: '13:00', max_capacity: 1, is_active: true },
  { id: 'default-afternoon', name: 'Afternoon', start_time: '13:00', end_time: '17:00', max_capacity: 1, is_active: true },
];

// Bounds the free-form custom picker. Ends at 17:30 (5:30 PM) — intentionally
// wider than the chips so users can grab sub-ranges past 5 PM.
export const DEFAULT_OPERATING_WINDOW = { start: '09:00', end: '17:30' };

export const DEFAULT_TIME_SLOT_CONFIG: TimeSlotConfig = {
  operating_hours: { default: DEFAULT_OPERATING_WINDOW },
  slot_generation: 'custom',
  custom_slots: DEFAULT_CUSTOM_SLOTS,
};

export const CUSTOM_RANGE_STEP_MINUTES = 30; // picker granularity
export const CUSTOM_RANGE_MIN_MINUTES = 30;  // minimum booking duration
