/**
 * Canonical notification categories available in the Send Notification form.
 *
 * Admins see these as both:
 *   - Dropdown options when creating a notification (admin/notifications/new)
 *   - Filter tabs when browsing notifications (admin/notifications)
 *
 * The admin feed ADDITIONALLY surfaces any "organic" categories emitted
 * directly by modules (e.g. "Dashboard:Rescue" from the lead-rescue cron),
 * so tab coverage is always {canonical} ∪ {categories actually in use}.
 *
 * Adding a new category? Just append to this list — both the form and the
 * filter tabs pick it up automatically.
 */
export const NOTIFICATION_CATEGORIES = [
  'General',
  'Announcement',
  'Reminder',
  'Alert',
  'Event',
  'Update',
  'Maintenance',
  'Action Required'
] as const;

export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];

/**
 * Lookup canonical category label by case-insensitive key match.
 * Returns null if the key doesn't match any canonical category — caller
 * should fall back to displaying the raw value.
 */
export function getCanonicalCategoryLabel(
  key: string
): string | null {
  if (!key) return null;
  const lower = key.toLowerCase().trim();
  const match = NOTIFICATION_CATEGORIES.find(
    (c) => c.toLowerCase() === lower
  );
  return match ?? null;
}
