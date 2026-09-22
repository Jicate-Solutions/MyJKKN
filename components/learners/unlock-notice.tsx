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
import { useMyLifecycleStatus } from '@/hooks/use-my-lifecycle-status';
import { inductionWaitFor } from '@/lib/constants/induction-access';

const BRAND = '#0b6d41';

export function UnlockNotice() {
  const { data: status } = useMyLifecycleStatus();
  const wait = inductionWaitFor(status);

  // Renders nothing for an activated learner, for anyone who is not a learner
  // (the RPC returns null), and while the status is still loading.
  if (!wait) return null;

  return (
    <Alert className="border-[#0b6d41]/30 bg-[#0b6d41]/5">
      <Lock className="h-4 w-4" style={{ color: BRAND }} />
      <AlertTitle>
        {wait === 'awaiting_admission'
          ? 'You can see only the induction pages until you are admitted'
          : 'You can see only the induction pages for now'}
      </AlertTitle>
      <AlertDescription>
        {wait === 'awaiting_admission' ? (
          <>
            <p>
              Your application is with the admissions team. The rest of MyJKKN —
              timetable, attendance, feedback and more — opens once your
              admission is confirmed.
            </p>
            <p className="mt-1">
              Nothing here is missing or broken, and there is nothing you need to
              fix. For anything about your application, talk to the admissions
              office.
            </p>
          </>
        ) : (
          <>
            <p>
              You are admitted. The rest of MyJKKN — timetable, attendance,
              feedback and more — opens once your onboarding is completed and
              your account is activated by the college.
            </p>
            <p className="mt-1">
              If your onboarding finished more than a few days ago and this
              notice is still here, tell your class coordinator.
            </p>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
