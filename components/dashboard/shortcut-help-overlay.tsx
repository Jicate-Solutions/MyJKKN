'use client';

import { useEffect, useRef } from 'react';

interface ShortcutHelpOverlayProps {
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['g', 'q'], description: 'Scroll to Decision Queue' },
  { keys: ['g', 'l'], description: 'Scroll to Leaderboards' },
  { keys: ['g', 'h'], description: 'Scroll to top (Hero Strip)' },
  { keys: ['g', 'c'], description: 'Open Classic Dashboard' },
  { keys: ['?'], description: 'Toggle this help overlay' },
  { keys: ['Esc'], description: 'Close overlay / dismiss brief' },
];

export function ShortcutHelpOverlay({ onClose }: ShortcutHelpOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm'>
      <div
        ref={overlayRef}
        className='bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-neutral-200/50 dark:border-neutral-700/50 p-6 w-full max-w-md mx-4'
      >
        <div className='flex items-center justify-between mb-4'>
          <h2 className='text-lg font-semibold text-neutral-900 dark:text-neutral-100'>
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className='text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors'
            aria-label='Close shortcuts overlay'
          >
            <kbd className='px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-xs border border-neutral-200 dark:border-neutral-700'>
              Esc
            </kbd>
          </button>
        </div>

        <div className='space-y-2'>
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.keys.join('+')}
              className='flex items-center justify-between py-1.5'
            >
              <span className='text-sm text-neutral-600 dark:text-neutral-400'>
                {shortcut.description}
              </span>
              <div className='flex items-center gap-1'>
                {shortcut.keys.map((key, i) => (
                  <span key={i} className='flex items-center gap-1'>
                    {i > 0 && (
                      <span className='text-xs text-neutral-400'>then</span>
                    )}
                    <kbd className='px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-xs border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300'>
                      {key}
                    </kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className='mt-4 text-xs text-neutral-400 dark:text-neutral-500 text-center'>
          Press <kbd className='px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[10px] border border-neutral-200 dark:border-neutral-700'>?</kbd> to toggle this overlay
        </p>
      </div>
    </div>
  );
}
