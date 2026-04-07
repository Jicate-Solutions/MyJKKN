'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useUpdateMarathonStatus } from '@/hooks/events/marathon/use-marathon-events';
import { Play, Square, ShieldAlert, Timer } from 'lucide-react';
import type { EventStatus } from '@/types/events';

interface RaceControlsProps {
  eventId: string;
  status: EventStatus;
  raceStartedAt?: string | null;
}

function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState('00:00:00');

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => {
      const diff = Math.max(0, Date.now() - start);
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setElapsed(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-4 py-2">
      <Timer className="h-4 w-4 text-muted-foreground" />
      <span className="font-mono text-lg font-bold tabular-nums">{elapsed}</span>
    </div>
  );
}

export function RaceControls({ eventId, status, raceStartedAt }: RaceControlsProps) {
  const updateStatus = useUpdateMarathonStatus();
  const [emergencyConfirm, setEmergencyConfirm] = useState(false);

  const handleStatusChange = (newStatus: EventStatus) => {
    updateStatus.mutate({ id: eventId, status: newStatus });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Elapsed time counter when live */}
      {status === 'live' && raceStartedAt && (
        <ElapsedTimer startedAt={raceStartedAt} />
      )}

      {/* Pre-race: Start Race */}
      {status === 'execution' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="bg-green-600 hover:bg-green-700 text-white gap-2">
              <Play className="h-4 w-4" />
              Start Race
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start Race?</AlertDialogTitle>
              <AlertDialogDescription>
                This will set the event status to &quot;Live&quot; and begin the race
                timer. All tracking systems will be activated. This action cannot be
                undone easily.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-green-600 hover:bg-green-700"
                onClick={() => handleStatusChange('live')}
                disabled={updateStatus.isPending}
              >
                Confirm Start
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Live: End Race */}
      {status === 'live' && (
        <>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50 gap-2">
                <Square className="h-4 w-4" />
                End Race
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>End Race?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will mark the race as complete and move the event to
                  &quot;Post Event&quot; status. Make sure all runners have finished or
                  been accounted for.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-orange-600 hover:bg-orange-700"
                  onClick={() => handleStatusChange('post_event')}
                  disabled={updateStatus.isPending}
                >
                  Confirm End
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Emergency Stop — double confirmation */}
          <AlertDialog open={emergencyConfirm} onOpenChange={setEmergencyConfirm}>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2">
                  <ShieldAlert className="h-4 w-4" />
                  Emergency
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Emergency Stop</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to trigger an emergency stop? This will
                    immediately halt the race and alert all volunteers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => setEmergencyConfirm(true)}
                  >
                    Yes, Emergency Stop
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </AlertDialog>

          {/* Second confirmation for emergency */}
          {emergencyConfirm && (
            <AlertDialog open={emergencyConfirm} onOpenChange={setEmergencyConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-destructive">
                    FINAL CONFIRMATION
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This is the final confirmation. The race will be stopped immediately.
                    Type &quot;STOP&quot; mentally and confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setEmergencyConfirm(false)}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => {
                      handleStatusChange('cancelled');
                      setEmergencyConfirm(false);
                    }}
                    disabled={updateStatus.isPending}
                  >
                    CONFIRM EMERGENCY STOP
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </>
      )}
    </div>
  );
}
