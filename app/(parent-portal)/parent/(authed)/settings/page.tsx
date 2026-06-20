'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Palette, LogOut, ChevronRight, Bell, Loader2 } from 'lucide-react';
import { ThemeDialog } from '@/components/parent/theme-dialog';
import { useParentSession } from '@/hooks/parent/use-parent-session';
import { useParentPush } from '@/hooks/parent/use-parent-push';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { parent, logout } = useParentSession();
  const [themeOpen, setThemeOpen] = useState(false);
  const push = useParentPush();

  const togglePush = async () => {
    const ok = push.enabled ? await push.disable() : await push.enable();
    if (!ok && !push.supported) toast.error('Push notifications are not supported on this device.');
    else if (!ok) toast.error('Could not update push notifications.');
    else toast.success(push.enabled ? 'Push notifications off' : 'Push notifications on');
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Settings</h1>

      <Card className="p-4">
        <p className="text-sm font-medium">{parent?.displayName ?? 'Parent'}</p>
        {parent?.mobile && <p className="text-xs text-muted-foreground">{parent.mobile}</p>}
      </Card>

      <Card className="divide-y divide-black/5 dark:divide-white/10">
        <button onClick={() => setThemeOpen(true)} className="flex w-full items-center gap-3 p-4 text-left text-sm">
          <Palette className="h-5 w-5 text-[#0b6d41]" />
          <span className="flex-1">Theme</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          onClick={togglePush}
          disabled={push.loading}
          className="flex w-full items-center gap-3 p-4 text-left text-sm disabled:opacity-60"
        >
          <Bell className="h-5 w-5 text-[#0b6d41]" />
          <span className="flex-1">Push Notifications</span>
          {push.loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                push.enabled ? 'bg-[#0b6d41]/10 text-[#0b6d41]' : 'bg-black/5 text-muted-foreground'
              }`}
            >
              {push.enabled ? 'On' : 'Off'}
            </span>
          )}
        </button>
        <button onClick={() => void logout()} className="flex w-full items-center gap-3 p-4 text-left text-sm text-red-600">
          <LogOut className="h-5 w-5" />
          <span className="flex-1">Logout</span>
        </button>
      </Card>

      <ThemeDialog open={themeOpen} onOpenChange={setThemeOpen} />
    </div>
  );
}
