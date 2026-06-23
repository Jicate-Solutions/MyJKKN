import { HolidaysAdmin } from './_components/holidays-admin';

export const metadata = { title: 'Calendar · Holidays' };

export default function CalendarHolidaysPage() {
  return (
    <div className="p-4 md:p-6">
      <HolidaysAdmin />
    </div>
  );
}
