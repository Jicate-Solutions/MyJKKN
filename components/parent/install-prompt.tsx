'use client';

/**
 * Parent Portal — PWA add-to-home banner. Listens for beforeinstallprompt and
 * offers a dismissible install CTA. No-ops on browsers that don't support it
 * (iOS Safari shows the system Share→Add to Home flow instead).
 */
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pp_install_dismissed';

export function ParentInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!show || !deferred) return null;

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  return (
    <div className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-black/5 bg-white p-3 shadow-lg dark:border-white/10 dark:bg-neutral-900">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0b6d41]/10 text-[#0b6d41]">
        <Download className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Install JKKN Parent</p>
        <p className="text-xs text-muted-foreground">Add to your home screen for quick access.</p>
      </div>
      <button
        onClick={async () => {
          await deferred.prompt();
          await deferred.userChoice;
          dismiss();
        }}
        className="rounded-lg bg-[#0b6d41] px-3 py-1.5 text-xs font-semibold text-white"
      >
        Install
      </button>
      <button onClick={dismiss} aria-label="Dismiss" className="text-muted-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
