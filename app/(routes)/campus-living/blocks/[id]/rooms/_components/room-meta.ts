// Shared display metadata for the hostel_rooms inventory columns that the
// generated supabase type has always carried but the campus-living UI never
// surfaced: room_purpose, tier_access, renovated, painting.
//
// Why a shared module: the rooms list, the room detail page, the Add/Edit
// dialog, the row-action "View Details" popup, and the bulk-upload preview all
// render these same values — keeping the label maps in one place stops them
// drifting apart (a recurring class of bug in this repo).
//
// room_purpose / tier_access are stored as lowercase text with a small known
// vocabulary (verified against live data 2026-06-03). renovated / painting are
// free-text status strings (e.g. "RENOVATED Pending (Window added)",
// "DONE PROPERLY", "LAST YEAR DONE") so they round-trip as plain text inputs —
// no enum, nothing to lose.

export interface SelectOption {
  value: string;
  label: string;
}

// Functional use of the room. 'student' = a normal allocatable resident room;
// everything else is a special-purpose room (no category / not for allocation).
export const ROOM_PURPOSE_OPTIONS: SelectOption[] = [
  { value: 'student', label: 'Student' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'office_room', label: 'Office Room' },
  { value: 'warden', label: 'Warden' },
  { value: 'mess_warden', label: 'Mess Warden' },
  { value: 'mess_staff', label: 'Mess Staff' },
  { value: 'nursing_staff', label: 'Nursing Staff' },
  { value: 'dental_staff', label: 'Dental Staff' },
  { value: 'sick_room', label: 'Sick Room' },
  { value: 'tv_hall', label: 'TV Hall' },
  { value: 'thinks', label: 'Thinks' },
];

// Quality tier the room belongs to. Mirrors hostel_rooms.tier_access.
export const TIER_ACCESS_OPTIONS: SelectOption[] = [
  { value: 'classic', label: 'Classic' },
  { value: 'premium', label: 'Premium' },
  { value: 'deluxe', label: 'Deluxe' },
  { value: 'either', label: 'Either' },
];

const purposeMap = new Map(ROOM_PURPOSE_OPTIONS.map((o) => [o.value, o.label]));
const tierMap = new Map(TIER_ACCESS_OPTIONS.map((o) => [o.value, o.label]));

// Title-case fallback so a value not in the known vocabulary (future drift)
// still renders readably instead of as raw snake_case.
const titleCase = (v: string) =>
  v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const formatRoomPurpose = (v: string | null | undefined): string =>
  v ? purposeMap.get(v) ?? titleCase(v) : '—';

export const formatTierAccess = (v: string | null | undefined): string =>
  v ? tierMap.get(v) ?? titleCase(v) : '—';

// A non-student room is special-purpose (Accounts, Warden, Mess Staff, …) and
// is badged distinctly in the table so operators can spot them at a glance.
export const isSpecialPurpose = (v: string | null | undefined): boolean =>
  !!v && v !== 'student';
