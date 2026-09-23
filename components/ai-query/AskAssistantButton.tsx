'use client';

/**
 * AskAssistantButton — the floating "Ask" button on every MyJKKN page.
 *
 * Shown only to people with ai_query.view (super admins included), and hidden
 * on /ai-query itself, where the full assistant is already on screen. The rule
 * lives in AskAssistantRules.shouldShowAskButton so it is tested on its own.
 *
 * POSITION — the fifth slot of the right-edge floating column. Measured from
 * the three siblings mounted in app/(routes)/layout.tsx:
 *   phone (below lg, over the 76px bottom nav):
 *     bug reporter  bottom-nav-safe-2 · handover bottom-nav-safe-3 ·
 *     work pulse    bottom-nav-safe-4 (16.75rem) → this one at 20.75rem,
 *     the same +4rem step as tailwind.config.ts's nav-safe ladder.
 *   desktop (lg+):
 *     bug reporter lg:bottom-4 · work pulse lg:bottom-20 · handover
 *     lg:bottom-36 → this one at lg:bottom-52, the same +4rem step.
 * The handover button renders only for the Director; the gap it leaves for
 * everyone else is deliberate, so no button ever moves under a finger.
 *
 * z-[94]: below the bug reporter (z-[95]) so the reporter always wins a tie,
 * above the Sheet primitive (z-[85]/[90]). `modal-open:hidden` and
 * `submenu-open:hidden` take it off screen under a modal sheet (including its
 * own panel) and over a bottom-nav submenu, exactly like its siblings.
 */

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { deriveBreadcrumbs } from '@/lib/navigation/derive-breadcrumbs';
import { cn } from '@/lib/utils';
import { AskPanel } from './AskPanel';
import {
  pageTitleFromCrumbs,
  shouldShowAskButton,
  type AskPageContext,
} from './AskAssistantRules';

export function AskAssistantButton() {
  const pathname = usePathname();
  const { can } = usePermissions([]);
  // The page the panel is open on, or null when closed. Following a link out
  // of an answer lands on a new page, so the panel counts as closed there and
  // the page is visible. The conversation is kept and reopens next time.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const [pageContext, setPageContext] = useState<AskPageContext | null>(null);
  const here = pathname || '/';
  const open = openOn !== null && openOn === here;

  if (!shouldShowAskButton(pathname, can('ai_query.view'))) return null;

  const handleOpen = () => {
    const title = pageTitleFromCrumbs(deriveBreadcrumbs(here).map((c) => c.label));
    setPageContext({ path: here, title });
    setOpenOn(here);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title="Ask the AI Assistant about this page"
        aria-label="Ask the AI Assistant about this page"
        className={cn(
          'fixed right-4 z-[94] modal-open:hidden submenu-open:hidden',
          'bottom-[calc(20.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-52',
          'flex h-12 w-12 items-center justify-center rounded-full',
          'bg-primary text-primary-foreground shadow-lg transition-all duration-200',
          'hover:bg-primary/90 hover:shadow-xl',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        <Sparkles className="h-5 w-5" />
      </button>
      <AskPanel
        open={open}
        onOpenChange={(next) => setOpenOn(next ? here : null)}
        pageContext={pageContext}
      />
    </>
  );
}

export default AskAssistantButton;
