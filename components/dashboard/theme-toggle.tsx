'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

const modes = ['light', 'dark', 'system'] as const;
type Mode = (typeof modes)[number];
const icons: Record<Mode, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };
const labels: Record<Mode, string> = { light: 'Light', dark: 'Dark', system: 'System' };

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className='w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 animate-pulse' />;
  const current = (modes.includes(theme as Mode) ? theme : 'system') as Mode;
  const next = modes[(modes.indexOf(current) + 1) % modes.length];
  const Icon = icons[current];
  return (
    <button type='button' onClick={() => setTheme(next)} title={labels[current]}
      aria-label={`${labels[current]}. Click for ${labels[next]}`}
      className='w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2'>
      <Icon className='w-4 h-4' />
    </button>
  );
}
