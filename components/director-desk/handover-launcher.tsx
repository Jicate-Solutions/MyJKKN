'use client';

// ============================================================================
// The floating hand-over control. Mounted once in app/(routes)/layout.tsx, so
// it is available on every authenticated page without any per-route wiring.
//
// VISIBILITY IS A SERVER ANSWER, NOT A STYLE
// ------------------------------------------
// Whether this renders at all is decided by fn_can_hand_over() — the same
// function the create RPC calls before it writes anything. Three consequences,
// all deliberate:
//
//   * Nobody else's browser ever holds this markup. The component returns null,
//     so there is no hidden node to unhide in DevTools and no client-side flag
//     to flip. A `hidden` class would have been a lie: the control would still
//     be one CSS edit away for anyone curious.
//   * The button and the write agree by construction. If the gate ever changes,
//     both sides change together, because there is only one gate.
//   * Fail-closed. A network error, a missing function (the spine migration not
//     applied yet), an expired session — every one of them lands on `false` and
//     renders nothing. Showing a button that cannot work is worse than showing
//     none, because the Director would only find out at submit.
//
// The permission key director.handover.create (declared in
// lib/constants/permissions.ts on the spine branch) is one of the three things
// fn_can_hand_over() accepts, alongside the `director` role and the super-admin
// flag. It is checked there rather than here on purpose: the client permission
// map is a cache, and a Director whose cache had not loaded would otherwise
// lose the control on his own pages.
// ============================================================================

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Share2 } from 'lucide-react';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

import { HandoverDialog } from './handover-dialog';

const LOG = 'director-desk/handover';

/**
 * Routes where the control would be noise: the desks themselves already have
 * their own hand-over affordances, and the auth shell is not a page anyone
 * delegates.
 */
const HIDDEN_PREFIXES = ['/auth', '/my-desk', '/director-desk'];

export function HandoverLauncher() {
  const pathname = usePathname() ?? '/';
  const [canHandOver, setCanHandOver] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        // New RPC, absent from the generated types (house pattern, 195 uses).
        const { data, error } = await (supabase as any).rpc('fn_can_hand_over');
        if (!active) return;
        if (error) throw error;
        setCanHandOver(data === true);
      } catch (err) {
        // Fail closed and stay quiet: on any error this is simply not a
        // Director, or the spine is not applied yet. Logged, never surfaced.
        if (!active) return;
        setCanHandOver(false);
        logger.dev(LOG, 'hand-over gate closed', err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!canHandOver) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Hand this page over"
        aria-label="Hand this page over"
        // `modal-open:hidden` (tailwind.config.ts) keeps this z-[96] button
        // from painting over a modal bottom sheet such as the More drawer.
        className="fixed right-4 bottom-nav-safe-3 lg:bottom-36 z-[96] modal-open:hidden flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-all duration-200 hover:bg-indigo-700 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
      >
        <Share2 className="h-5 w-5" />
      </button>

      <HandoverDialog open={open} onOpenChange={setOpen} pathname={pathname} />
    </>
  );
}
