import { redirect } from 'next/navigation';

/**
 * Family Moments hub landing — redirects to the default sub-page.
 *
 * /moments has two children (submit, campaigns); teachers (the largest
 * audience) land on Collect Messages. Required by the hub-page
 * reachability gate — a child-only directory 404s in the App Router.
 */
export default function MomentsIndex() {
  redirect('/moments/submit');
}
