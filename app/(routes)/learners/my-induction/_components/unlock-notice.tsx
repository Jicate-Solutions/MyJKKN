'use client';

// "The rest of MyJKKN unlocks after onboarding" notice.
//
// A pre-onboarding (induction-only) learner reaches My Induction, My Profile,
// Service Requests and AI Pulse, and nothing else: proxy.ts whitelists those
// paths and redirects the rest, and the sidebar/bottom nav hide the links that
// would only redirect. That restriction is deliberate — but nothing on screen
// ever said so, and eleven learners filed the same report ("only three options
// are visible, other options are not visible in dashboard": BUG-005921,
// BUG-005932 to BUG-005937, BUG-005939 to BUG-005941, BUG-005943).
//
// This component only explains the state. It changes no navigation, no
// permission and no gate.
//
// The signal is useIsInductionOnly() — the same hook components/Navbar/menu.tsx
// and components/BottomNav/bottom-navbar.tsx filter on, backed by
// fn_my_lifecycle_status() — so the notice and the shortened menu can never
// disagree about who is pre-onboarding. It is false for an activated learner
// and false for anyone who is not a learner at all (the RPC returns null), so
// this renders nothing in both cases.
import { Lock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useIsInductionOnly } from '@/hooks/use-my-lifecycle-status';

const BRAND = '#0b6d41';

export function UnlockNotice() {
  const isInductionOnly = useIsInductionOnly();

  if (!isInductionOnly) return null;

  return (
    <Alert className="border-[#0b6d41]/30 bg-[#0b6d41]/5">
      <Lock className="h-4 w-4" style={{ color: BRAND }} />
      <AlertTitle>You can see only the induction pages for now</AlertTitle>
      <AlertDescription>
        <p>
          The rest of MyJKKN — timetable, attendance, feedback and more — unlocks
          automatically once your onboarding is complete.
        </p>
        <p className="mt-1">
          If your onboarding finished more than a few days ago and this notice is
          still here, tell your class coordinator.
        </p>
      </AlertDescription>
    </Alert>
  );
}
