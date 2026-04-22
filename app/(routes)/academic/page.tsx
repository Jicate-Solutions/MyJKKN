import { redirect } from 'next/navigation';

/**
 * Academic Management landing — redirects to the default tab (Academic Years).
 *
 * /academic previously 404'd because no page.tsx existed at the module root.
 * The sidebar "Academic Management" entry now lands here and is forwarded
 * to the first real page. URL-preserving: deep-linked routes still work.
 */
export default function AcademicIndex() {
  redirect('/academic/years');
}
