import { redirect } from 'next/navigation';

/**
 * Learn landing — redirects to the default page.
 *
 * /learn previously 404'd because no page.tsx existed at the module
 * root. Added as part of the nav-landing-pages sweep (follow-up to #348).
 */
export default function LearnIndex() {
  redirect('/learn/quests');
}
