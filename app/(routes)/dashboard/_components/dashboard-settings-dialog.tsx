'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Settings, RotateCcw, Loader2 } from 'lucide-react';
import { useResetPreferences } from '@/hooks/dashboard/use-dashboard-preferences';
import { WidgetVisibilitySettings } from './widget-visibility-settings';

interface DashboardSettingsDialogProps {
  userId: string;
  role: string;
}

export function DashboardSettingsDialog({
  userId,
  role,
}: DashboardSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [showResetAlert, setShowResetAlert] = useState(false);
  const resetMutation = useResetPreferences();

  const handleReset = () => {
    resetMutation.mutate(
      { userId, role },
      {
        onSuccess: () => {
          setShowResetAlert(false);
          setOpen(false);
        },
      }
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Customize Dashboard</span>
            <span className="sm:hidden">Settings</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dashboard Settings</DialogTitle>
            <DialogDescription>
              Customize which widgets appear on your dashboard. Changes are
              saved automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <WidgetVisibilitySettings userId={userId} role={role} />
          </div>

          <Separator />

          <div className="flex justify-between items-center pt-4">
            <p className="text-sm text-muted-foreground">
              Reset all widgets to default visibility
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResetAlert(true)}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset to Defaults
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showResetAlert} onOpenChange={setShowResetAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Dashboard Settings?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore all widgets to their default visibility
              settings. Your customizations will be lost. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                'Reset'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
