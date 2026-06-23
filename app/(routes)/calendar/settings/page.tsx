import { SettingsAdmin } from './_components/settings-admin';

export const metadata = { title: 'Calendar · Settings' };

export default function CalendarSettingsPage() {
  return (
    <div className="p-4 md:p-6">
      <SettingsAdmin />
    </div>
  );
}
