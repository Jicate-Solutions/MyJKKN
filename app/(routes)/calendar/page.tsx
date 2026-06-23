import { CalendarView } from './_components/calendar-view';

export const metadata = { title: 'Calendar' };

export default function CalendarPage() {
  return (
    <div className="p-4 md:p-6">
      <CalendarView />
    </div>
  );
}
