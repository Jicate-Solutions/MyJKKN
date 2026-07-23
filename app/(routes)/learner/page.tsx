// app/(routes)/learner/page.tsx
// Hub for the /learner namespace. Its only child today is /learner/idp
// ("My Development Plan"). A bare visit to /learner would otherwise 404 (Next.js
// App Router needs a page.tsx at every reachable directory — the hub-page-404
// class caught by the PR-scoped reachability gate). Redirect to the child.
// Auth is enforced upstream by proxy.ts (anon → /auth/login).
import { redirect } from 'next/navigation';

export default function LearnerHubPage() {
  redirect('/learner/idp');
}
