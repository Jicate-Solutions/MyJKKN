// components/shared/report-tag-result.ts
//
// Tells the author what a tag request actually did — shared by the event review
// thread and the reservation thread so both say the same thing. The important
// case is `notNotified`: access was granted but the alert did not go out, and
// the author must know to press Resend rather than assume the person was told.

import toast from 'react-hot-toast';
import type { TagPeopleResult } from '@/lib/services/shared/comment-threads';

const join = (names: string[]) => names.join(', ');

export function reportTagResult(result: TagPeopleResult, thread: 'booking' | 'event') {
  if (result.notified.length > 0) {
    toast.success(`Tagged and notified ${join(result.notified)}`);
  }
  if (result.reminded.length > 0) {
    toast.success(`Reminder sent to ${join(result.reminded)}`);
  }
  if (result.recentlyNotified.length > 0) {
    toast(`${join(result.recentlyNotified)} was notified moments ago — not sent again.`);
  }
  if (result.notNotified.length > 0) {
    toast.error(
      `Tagged ${join(result.notNotified)}, but the alert did not go out. Use Resend on their tag to try again.`,
      { duration: 8000 },
    );
  }
  if (result.skipped.length > 0) {
    toast.error(
      `Not tagged (not a team member of this ${thread}'s institution): ${join(result.skipped)}`,
    );
  }
}
