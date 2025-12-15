'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Users,
  Loader2
} from 'lucide-react';
import { AttendanceFacultySync } from '@/lib/services/academic/attendance-faculty-sync';
import { toast } from 'sonner';
import { logger } from '@/lib/utils/enhanced-logger';

interface FacultySyncIndicatorProps {
  attendanceId: string;
  periodId: string;
  currentFaculty?: any;
  onSync?: (newFaculty: any) => void;
  autoCheck?: boolean;
}

export function FacultySyncIndicator({
  attendanceId,
  periodId,
  currentFaculty,
  onSync,
  autoCheck = true
}: FacultySyncIndicatorProps) {
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [newFaculty, setNewFaculty] = useState<any>(null);

  // Check for faculty changes on mount
  useEffect(() => {
    if (autoCheck && attendanceId && periodId) {
      checkForChanges();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceId, periodId, autoCheck]);

  const checkForChanges = async () => {
    try {
      setChecking(true);
      const result = await AttendanceFacultySync.checkFacultyChanges(
        attendanceId,
        periodId
      );

      setHasChanges(result.hasChanges);
      if (result.hasChanges && result.newFaculty) {
        setNewFaculty(result.newFaculty);
      }
    } catch (error) {
      logger.error('academic/attendance', 'Error checking faculty changes', error);
    } finally {
      setChecking(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      const result = await AttendanceFacultySync.syncFacultyForAttendanceRecord(
        attendanceId,
        {
          updateOnlyIfChanged: true,
          preserveMarkerDetails: true
        }
      );

      if (result.success) {
        if (result.hasChanges) {
          toast.success('Faculty assignments updated successfully');
          setHasChanges(false);
          if (onSync && newFaculty) {
            onSync(newFaculty);
          }
        } else {
          toast.info('No changes needed');
        }
      } else {
        toast.error('Failed to sync faculty assignments');
      }
    } catch (error) {
      logger.error('academic/attendance', 'Error syncing faculty', error);
      toast.error('An error occurred while syncing');
    } finally {
      setSyncing(false);
    }
  };

  const formatFacultyDisplay = (faculty: any) => {
    if (!faculty) return 'No faculty assigned';
    
    if (Array.isArray(faculty)) {
      return faculty.map((f, idx) => (
        <div key={f.faculty_id} className="flex items-center gap-2">
          <Users className="h-3 w-3" />
          <span className="text-sm">
            {f.faculty_name}
            {f.is_primary && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Primary
              </Badge>
            )}
          </span>
        </div>
      ));
    } else {
      return (
        <div className="flex items-center gap-2">
          <Users className="h-3 w-3" />
          <span className="text-sm">{faculty.faculty_name}</span>
        </div>
      );
    }
  };

  if (checking) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking for faculty updates...
      </div>
    );
  }

  if (!hasChanges) {
    return null;
  }

  return (
    <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
      <AlertTriangle className="h-4 w-4 text-orange-600" />
      <AlertDescription className="space-y-3">
        <div className="font-medium text-orange-900 dark:text-orange-300">
          Faculty assignments have changed in the timetable
        </div>
        
        <div className="grid gap-3 text-sm">
          <div className="space-y-1">
            <div className="text-muted-foreground">Current Faculty:</div>
            <div className="pl-4">{formatFacultyDisplay(currentFaculty)}</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-muted-foreground">Updated Faculty:</div>
            <div className="pl-4">{formatFacultyDisplay(newFaculty)}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="gap-2"
          >
            {syncing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Update Faculty
              </>
            )}
          </Button>
          
          <span className="text-xs text-muted-foreground">
            This will update the attendance record with current faculty assignments
          </span>
        </div>
      </AlertDescription>
    </Alert>
  );
}

// Batch sync component for admin use
export function BatchFacultySync({
  timetableId,
  dateRange
}: {
  timetableId?: string;
  dateRange?: { from: string; to: string };
}) {
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleBatchSync = async () => {
    try {
      setSyncing(true);
      const result = await AttendanceFacultySync.batchSyncFaculty({
        timetableId,
        dateRange
      });

      if (result.success) {
        setResults(result.results);
        toast.success(
          `Synced ${result.results?.synced} records, ${result.results?.changed} had changes`
        );
      } else {
        toast.error('Batch sync failed');
      }
    } catch (error) {
      logger.error('academic/attendance', 'Batch sync error', error);
      toast.error('An error occurred during batch sync');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button
        onClick={handleBatchSync}
        disabled={syncing}
        variant="outline"
        className="gap-2"
      >
        {syncing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Syncing Records...
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            Sync All Faculty Assignments
          </>
        )}
      </Button>

      {results && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-medium mb-2">Sync Complete</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Total Records: {results.total}</div>
              <div>Synced: {results.synced}</div>
              <div>Changed: {results.changed}</div>
              <div>Failed: {results.failed}</div>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}