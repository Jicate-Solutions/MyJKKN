'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Palette, LogOut, ChevronRight, Bell, Loader2, MonitorSmartphone } from 'lucide-react';
import { ThemeDialog } from '@/components/parent/theme-dialog';
import { useParentSession } from '@/hooks/parent/use-parent-session';
import { useParentPush } from '@/hooks/parent/use-parent-push';
import { toast } from 'sonner';
import { ParentAuthService } from '@/lib/services/parent/parent-auth-service';
import { SIGNED_OUT_EVERYWHERE_NOTICE } from '@/lib/auth/sign-out-everywhere-copy';

const PARENT_SELF_SIGN_OUT_WARNING =
  'This signs you out on every phone and computer, including this one. You can sign in again with your password.';

export default function SettingsPage() {
  const { parent, logout } = useParentSession();
  const [themeOpen, setThemeOpen] = useState(false);
  const push = useParentPush();

  // "Sign out of all devices" (Director ruling 2026-10-01: the safety net for a
  // lost or shared phone). Hidden until the kill switch exists in the database.
  const [signOutAllAvailable, setSignOutAllAvailable] = useState(false);
  const [signOutAllOpen, setSignOutAllOpen] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const [signOutAllError, setSignOutAllError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ParentAuthService.signOutEverywhereAvailable()
      .then((ok) => {
        if (!cancelled) setSignOutAllAvailable(ok);
      })
      .catch(() => {
        if (!cancelled) setSignOutAllAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const confirmSignOutAll = async () => {
    setSigningOutAll(true);
    setSignOutAllError(null);
    try {
      await ParentAuthService.signOutEverywhere();
      toast.success(SIGNED_OUT_EVERYWHERE_NOTICE);
      setSignOutAllOpen(false);
      await logout(); // clears this browser and opens the login page
    } catch (e) {
      setSignOutAllError(e instanceof Error ? e.message : 'We could not sign you out of your other devices.');
    } finally {
      setSigningOutAll(false);
    }
  };

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
        {signOutAllAvailable && (
          <button
            onClick={() => {
              setSignOutAllError(null);
              setSignOutAllOpen(true);
            }}
            className="flex w-full items-center gap-3 p-4 text-left text-sm text-red-600"
          >
            <MonitorSmartphone className="h-5 w-5" />
            <span className="flex-1">Sign out of all devices</span>
          </button>
        )}
      </Card>

      <Dialog open={signOutAllOpen} onOpenChange={(o) => !o && !signingOutAll && setSignOutAllOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out of all devices</DialogTitle>
            <DialogDescription>Lost your phone, or signed in on a shared one?</DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium">{PARENT_SELF_SIGN_OUT_WARNING}</p>
          {signOutAllError && (
            <p role="alert" className="text-sm text-destructive">
              {signOutAllError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOutAllOpen(false)} disabled={signingOutAll}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmSignOutAll} disabled={signingOutAll}>
              {signingOutAll ? 'Signing out…' : 'Yes, sign me out everywhere'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ThemeDialog open={themeOpen} onOpenChange={setThemeOpen} />
    </div>
  );
}
