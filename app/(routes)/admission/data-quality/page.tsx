import { redirect } from 'next/navigation';

/**
 * Data Quality landing — redirects to the default sub-page (Data Profiling).
 *
 * /admission/data-quality previously 404'd because no page.tsx existed.
 * AdmissionNav's "Data Quality" tab now lands here and is forwarded.
 */
export default function DataQualityIndex() {
  redirect('/admission/data-quality/data-profiling');
}
