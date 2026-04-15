'use client';

import { CalendarDays } from 'lucide-react';
import { CampusLivingComingSoon } from '../_components/coming-soon';

export default function CampusLivingCalendarPage() {
  return (
    <CampusLivingComingSoon
      title="Campus Living Calendar"
      description="Unified calendar view of leaves, gate passes, maintenance windows, mess menu cycles, and community events."
      feature="campus_living.calendar"
      icon={CalendarDays}
      bullets={[
        'Month / week / day views powered by react-big-calendar',
        'Colour-coded event categories (leave, gate pass, maintenance, event)',
        'Drag-to-reschedule maintenance windows and community events',
        'Export to iCal for wardens and block coordinators',
      ]}
    />
  );
}
