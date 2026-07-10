// Sports Tournaments — shared status badge styling for the list table,
// row-actions "Change Status" submenu and the mobile card. Kept in its own
// module so columns.tsx ↔ row-actions.tsx don't import each other.

import type { EventStatus } from '@/types/events';

export const STATUS_CONFIG: Record<EventStatus, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100' },
  planning: { label: 'Planning', color: 'text-blue-600', bg: 'bg-blue-50' },
  preparation: { label: 'Preparation', color: 'text-amber-600', bg: 'bg-amber-50' },
  execution: { label: 'Execution', color: 'text-orange-600', bg: 'bg-orange-50' },
  live: { label: 'LIVE', color: 'text-red-600', bg: 'bg-red-50' },
  post_event: { label: 'Post Event', color: 'text-purple-600', bg: 'bg-purple-50' },
  archived: { label: 'Archived', color: 'text-gray-500', bg: 'bg-gray-50' },
  cancelled: { label: 'Cancelled', color: 'text-red-500', bg: 'bg-red-50' },
};
