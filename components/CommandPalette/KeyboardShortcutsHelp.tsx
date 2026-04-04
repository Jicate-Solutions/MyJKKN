'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KEYBOARD_SHORTCUTS, formatShortcutKey } from '@/lib/navigation/keyboard-shortcuts';
import { Keyboard } from 'lucide-react';

/**
 * Dialog showing all available keyboard shortcuts.
 * Opens with '?' key when no input is focused.
 */
export function KeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !isInputFocused()) {
        e.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const shortcuts = Object.entries(KEYBOARD_SHORTCUTS);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md dark:bg-gray-900 dark:border-gray-700/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Navigation shortcuts */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Navigation
            </h3>
            <div className="space-y-1">
              <ShortcutRow keys="Ctrl+K" description="Open search" />
              <ShortcutRow keys="Esc" description="Close dialog" />
              <ShortcutRow keys="?" description="Show this help" />
            </div>
          </div>

          {/* Page shortcuts */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Quick Navigation
            </h3>
            <div className="space-y-1">
              {shortcuts.map(([key, shortcut]) => (
                <ShortcutRow
                  key={key}
                  keys={formatShortcutKey(key)}
                  description={shortcut.label}
                />
              ))}
            </div>
          </div>

          {/* Search shortcuts */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              In Search
            </h3>
            <div className="space-y-1">
              <ShortcutRow keys="↑ ↓" description="Navigate results" />
              <ShortcutRow keys="Enter" description="Open selected" />
              <ShortcutRow keys="Esc" description="Close search" />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutRow({ keys, description }: { keys: string; description: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground">{description}</span>
      <kbd className="inline-flex h-6 items-center rounded border bg-muted px-2 font-mono text-xs font-medium text-muted-foreground dark:border-gray-600 dark:bg-gray-800">
        {keys}
      </kbd>
    </div>
  );
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' ||
    (el as HTMLElement).isContentEditable;
}
