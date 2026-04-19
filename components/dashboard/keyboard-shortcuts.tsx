'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShortcutHelpOverlay } from './shortcut-help-overlay';

const CHORD_TIMEOUT_MS = 500;

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((document.activeElement as HTMLElement)?.isContentEditable) return true;
  return false;
}

function scrollToSection(selector: string) {
  const el =
    document.querySelector(`[data-dashboard-section="${selector}"]`) ??
    document.getElementById(selector);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    pendingRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Never fire when typing in form fields
      if (isInputFocused()) return;

      const key = e.key;

      // Escape — close overlay or dismiss morning brief
      if (key === 'Escape') {
        if (showHelp) {
          setShowHelp(false);
          e.preventDefault();
          return;
        }
        // Dismiss morning brief if present
        const briefDismiss =
          document.querySelector('[data-dashboard-section="morning-brief"] button[aria-label*="dismiss" i]') ??
          document.querySelector('[data-dashboard-section="morning-brief"] button[aria-label*="close" i]');
        if (briefDismiss instanceof HTMLElement) {
          briefDismiss.click();
          e.preventDefault();
        }
        return;
      }

      // ? — toggle help
      if (key === '?') {
        setShowHelp((prev) => !prev);
        e.preventDefault();
        return;
      }

      // Two-key chord: g + <second key>
      if (key === 'g' && !pendingRef.current) {
        pendingRef.current = true;
        timerRef.current = setTimeout(clearPending, CHORD_TIMEOUT_MS);
        return;
      }

      if (pendingRef.current) {
        clearPending();

        switch (key) {
          case 'q':
            scrollToSection('decision-queue');
            e.preventDefault();
            break;
          case 'l':
            scrollToSection('leaderboards');
            e.preventDefault();
            break;
          case 'h':
            window.scrollTo({ top: 0, behavior: 'smooth' });
            e.preventDefault();
            break;
          case 'c':
            router.push('/dashboard/classic');
            e.preventDefault();
            break;
          default:
            break;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearPending();
    };
  }, [showHelp, router, clearPending]);

  if (showHelp) {
    return <ShortcutHelpOverlay onClose={() => setShowHelp(false)} />;
  }

  return null;
}
