'use client';

/**
 * Parent Portal — client session context.
 *
 * Holds the parent identity + linked children (fetched once from
 * /api/parent/children, since the session cookie is HttpOnly) and the
 * active-child selection. The active learner id is persisted in the
 * non-HttpOnly `pp_active_learner` cookie so it survives reloads, and is
 * included in every child-scoped React Query key so switching children never
 * shows another child's cached data (see project memory on cross-cache safety).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Cookies from 'js-cookie';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import {
  ParentChildrenService,
  ParentApiError,
} from '@/lib/services/parent/parent-children-service';
import { Button } from '@/components/ui/button';
import { ParentAuthService } from '@/lib/services/parent/parent-auth-service';
import type { ParentChild, ParentSession } from '@/types/parent-portal';

// Client-safe constant (do NOT import from parent-jwt — that pulls `jose` into
// the client bundle). Must match PARENT_ACTIVE_LEARNER_COOKIE in parent-jwt.ts.
const ACTIVE_LEARNER_COOKIE = 'pp_active_learner';

interface ParentSessionContextValue {
  parent: ParentSession | null;
  children: ParentChild[];
  activeLearnerId: string | null;
  activeChild: ParentChild | null;
  setActiveLearner: (learnerId: string) => void;
  isLoading: boolean;
  isError: boolean;
  refetchChildren: () => void;
  logout: () => Promise<void>;
}

const ParentSessionContext = createContext<ParentSessionContextValue | null>(null);

export function ParentSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['parent-children'],
    queryFn: () => ParentChildrenService.getChildren(),
    ...QUERY_CONFIG.STABLE_DATA,
    retry: false, // a 401 here means "not logged in" — don't hammer
  });

  const childList = useMemo(() => data?.data ?? [], [data]);

  // Start null on BOTH server and the first client render, then read the cookie
  // after mount. Reading it synchronously in useState would return null on the
  // server but the real id on the client, causing a hydration mismatch on every
  // child-scoped parent page (server renders the "empty" branch, client the
  // "loading" branch). Deferring to an effect keeps the first paint identical.
  const [activeLearnerId, setActiveLearnerId] = useState<string | null>(null);
  useEffect(() => {
    const saved = Cookies.get(ACTIVE_LEARNER_COOKIE);
    if (saved) setActiveLearnerId(saved);
  }, []);

  // Default the active child to the primary (or first) once children load, and
  // self-heal if the persisted id is no longer linked.
  useEffect(() => {
    if (!childList.length) return;
    const stillValid =
      activeLearnerId && childList.some((c) => c.learnerProfileId === activeLearnerId);
    if (!stillValid) {
      const fallback =
        childList.find((c) => c.isPrimary)?.learnerProfileId ??
        childList[0].learnerProfileId;
      setActiveLearnerId(fallback);
      Cookies.set(ACTIVE_LEARNER_COOKIE, fallback, { expires: 30, sameSite: 'lax' });
    }
  }, [childList, activeLearnerId]);

  const setActiveLearner = (learnerId: string) => {
    setActiveLearnerId(learnerId);
    Cookies.set(ACTIVE_LEARNER_COOKIE, learnerId, { expires: 30, sameSite: 'lax' });
    // Drop child-scoped caches so the new child's data is fetched fresh.
    queryClient.invalidateQueries({
      predicate: (q) => {
        const key = q.queryKey;
        return Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('parent-');
      },
    });
  };

  const logout = async () => {
    try {
      await ParentAuthService.logout();
    } finally {
      Cookies.remove(ACTIVE_LEARNER_COOKIE);
      queryClient.clear(); // cross-user cache safety
      router.replace('/parent/login');
    }
  };

  const value: ParentSessionContextValue = {
    parent: data?.parent ?? null,
    children: childList,
    activeLearnerId,
    activeChild:
      childList.find((c) => c.learnerProfileId === activeLearnerId) ?? null,
    setActiveLearner,
    isLoading,
    isError,
    refetchChildren: refetch,
    logout,
  };

  // A live login whose learner record is missing: every data call would 401
  // while the login itself stays valid, so show one clear card (with a way
  // out) instead of empty pages.
  const notLinked = error instanceof ParentApiError && error.code === 'not_linked';

  return (
    <ParentSessionContext.Provider value={value}>
      {notLinked ? <ParentNotLinkedCard message={error.message} onLogout={logout} /> : children}
    </ParentSessionContext.Provider>
  );
}

function ParentNotLinkedCard({
  message,
  onLogout,
}: {
  message: string;
  onLogout: () => Promise<void>;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <div
        role="alert"
        className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm"
      >
        <h1 className="text-lg font-semibold text-foreground">Account not linked yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-6 w-full"
          onClick={() => void onLogout()}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function useParentSession(): ParentSessionContextValue {
  const ctx = useContext(ParentSessionContext);
  if (!ctx) {
    throw new Error('useParentSession must be used within a ParentSessionProvider');
  }
  return ctx;
}
