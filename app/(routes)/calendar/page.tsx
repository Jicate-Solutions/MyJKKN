import { CalendarView } from './_components/calendar-view';
import { FeedSubscribe } from './_components/feed-subscribe';

export const metadata = { title: 'Calendar' };

export default function CalendarPage() {
  return (
    <div className="p-4 md:p-6">
      <FeedSubscribe />
      <CalendarView />
    </div>
  );
}
