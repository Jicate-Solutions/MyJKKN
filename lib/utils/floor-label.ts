// One place for how a hostel floor number reads. Before hostel_floors existed
// this lived as a hardcoded ['Ground Floor','1st Floor','2nd Floor','3rd Floor']
// array in four files, so a 5th floor rendered as "Floor 4" and had no filter chip.

/** 0 → "Ground Floor", 1 → "1st Floor", 2 → "2nd Floor", 11 → "11th Floor"… */
export function floorLabel(floor: number): string {
  if (floor === 0) return 'Ground Floor';
  const suffix =
    floor % 10 === 1 && floor % 100 !== 11 ? 'st'
    : floor % 10 === 2 && floor % 100 !== 12 ? 'nd'
    : floor % 10 === 3 && floor % 100 !== 13 ? 'rd'
    : 'th';
  return `${floor}${suffix} Floor`;
}

/** The admin's custom floor name when set, else the ordinal label. */
export function floorDisplayName(floor: number, name?: string | null): string {
  return name?.trim() || floorLabel(floor);
}
