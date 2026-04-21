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

function scrollToElement(selector: string) {
  const el = document.querySelector(selector);
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Actionability #7: j/k queue navigation. Tracks the "current" item via a
// simple data attribute, scrolls it into view, and adds a temporary ring so
// the user can see where they are.
function navigateQueueItem(direction: 1 | -1) {
  const items = Array.from(
    document.querySelectorAll('#decision-queue article')
  ) as HTMLElement[];
  if (items.length === 0) return;

  const currentIdx = items.findIndex((el) =>
    el.getAttribute('data-kb-focused') === 'true'
  );
  const nextIdx =
    currentIdx === -1
      ? direction === 1
        ? 0
        : items.length - 1
      : Math.min(Math.max(currentIdx + direction, 0), items.length - 1);

  items.forEach((el, i) => {
    if (i === nextIdx) {
      el.setAttribute('data-kb-focused', 'true');
      el.classList.add('ring-2', 'ring-emerald-400', 'ring-offset-2');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      el.removeAttribute('data-kb-focused');
      el.classList.remove('ring-2', 'ring-emerald-400', 'ring-offset-2');
    }
  });
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

      // Actionability upgrade #7 (2026-04-21) — single-key operator shortcuts.

      // `.` — activate "Today's Focus" action link (the derived #1 action)
      if (key === '.') {
        const focusAction = document.querySelector(
          'section[aria-label="Today\'s focus"] a'
        );
        if (focusAction instanceof HTMLElement) {
          focusAction.click();
          e.preventDefault();
          return;
        }
      }

      // `r` — hard refresh the dashboard (reload metrics)
      if (key === 'r' && !pendingRef.current) {
        window.location.reload();
        e.preventDefault();
        return;
      }

      // `j` / `k` — navigate queue items (scroll highlight)
      if (key === 'j' || key === 'k') {
        navigateQueueItem(key === 'j' ? 1 : -1);
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
          case 'f':
            // g+f — jump to Today's Focus card
            scrollToElement('section[aria-label="Today\'s focus"]');
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
