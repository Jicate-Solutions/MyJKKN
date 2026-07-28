import { Suspense } from 'react';
import { SettingsAdmin } from './_components/settings-admin';

export const metadata = { title: 'Calendar · Settings' };

export default function CalendarSettingsPage() {
  return (
    <div className="p-4 md:p-6">
      {/* Suspense boundary required: SettingsAdmin's useTabParam() reads useSearchParams(). */}
      <Suspense fallback={null}>
        <SettingsAdmin />
      </Suspense>
    </div>
  );
}
