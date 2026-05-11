'use client';

/**
 * Assessment Panel — main content area when subview === 'assessment'.
 *
 * Flow:
 *   1. Resolve the (examination_session_id, program_code) for the chosen
 *      semester. (All registrations within a semester share these values
 *      most of the time; if they differ across courses, the picker uses
 *      the dominant pair and lets the student switch.)
 *   2. Fetch CIA Settings filtered to that pair.
 *   3. Auto-select the most-recently-updated active setting.
 *   4. Show round picker → marks table.
 *
 * On every meaningful change (setting, round) the URL updates so the
 * view is shareable / bookmarkable.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Settings2, AlertCircle } from 'lucide-react';
import { useMyMarksCiaSettings } from '@/hooks/learners/use-my-marks';
import { MyMarksService } from '@/lib/services/learners/my-marks-service';
import type { MyMarksCiaSetting, MyMarksSemesterGroup } from '@/types/my-marks';
import type { CiaRound } from '@/types/internal-marks';
import { CiaSettingPicker } from './cia-setting-picker';
import { RoundPicker } from './round-picker';
import { MarksTable } from './marks-table';

interface Props {
  semester: MyMarksSemesterGroup;
  initialSettingId?: string;
  initialRound?: number;
}

export function AssessmentPanel({ semester, initialSettingId, initialRound }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Pick the dominant (session, program) within the semester. Most students
  // have one of each; an arrear semester might mix, but rare.
  const dominantContext = useMemo(() => {
    const counts = new Map<string, { count: number; session: string; program: string }>();
    for (const reg of semester.registrations) {
      const key = `${reg.examination_session_id}::${reg.program_code}`;
      const slot = counts.get(key);
      if (slot) slot.count++;
      else
        counts.set(key, {
          count: 1,
          session: reg.examination_session_id,
          program: reg.program_code,
        });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count)[0] ?? null;
  }, [semester]);

  const examSessionId = dominantContext?.session;
  const programCode = dominantContext?.program;

  const {
    data: settings,
    isLoading: isLoadingSettings,
    error: settingsError,
  } = useMyMarksCiaSettings(examSessionId, programCode);

  const [settingId, setSettingId] = useState<string | undefined>(initialSettingId);
  const [round, setRound] = useState<number | undefined>(initialRound);

  // Auto-pick the latest active setting whenever settings load and nothing is selected.
  useEffect(() => {
    if (!settings) return;
    if (settingId && settings.some((s) => s.id === settingId)) return;
    const auto = MyMarksService.autoSelectSetting(settings);
    if (auto) {
      setSettingId(auto.id);
      pushParam('setting', auto.id);
    }
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedSetting = useMemo<MyMarksCiaSetting | undefined>(
    () => settings?.find((s) => s.id === settingId),
    [settings, settingId]
  );

  // Auto-pick the lowest round on first load.
  useEffect(() => {
    if (!selectedSetting) return;
    if (round && selectedSetting.cia_rounds.some((r) => r.round === round)) return;
    const auto = MyMarksService.autoSelectRound(selectedSetting.cia_rounds);
    if (auto !== null) {
      setRound(auto);
      pushParam('round', String(auto));
    }
  }, [selectedSetting]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRound = useMemo<CiaRound | undefined>(
    () => selectedSetting?.cia_rounds.find((r) => r.round === round),
    [selectedSetting, round]
  );

  function pushParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleSettingChange(id: string) {
    setSettingId(id);
    setRound(undefined); // re-auto on next effect
    pushParam('setting', id);
    pushParam('round', null);
  }

  function handleRoundChange(r: number) {
    setRound(r);
    pushParam('round', String(r));
  }

  if (!dominantContext) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
            No registration context
          </CardTitle>
          <CardDescription>
            We couldn&apos;t find an exam session for the courses in this semester. Please contact your institution if this persists.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoadingSettings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading assessment configuration...
        </span>
      </div>
    );
  }

  if (settingsError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Could not load assessments
          </CardTitle>
          <CardDescription>{(settingsError as Error).message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!settings || settings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            No assessments configured yet
          </CardTitle>
          <CardDescription>
            Your faculty hasn&apos;t set up CIA assessments for {semester.semester_label} yet. Marks will appear here once setup is complete.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <Card>
        <CardContent className="p-2 sm:p-3">
          <CiaSettingPicker
            settings={settings}
            selectedId={settingId}
            onChange={handleSettingChange}
          />
        </CardContent>
      </Card>

      {selectedSetting && selectedSetting.cia_rounds.length > 0 && (
        <RoundPicker
          rounds={selectedSetting.cia_rounds}
          value={round}
          onChange={handleRoundChange}
        />
      )}

      {selectedRound && examSessionId && programCode && (
        <MarksTable
          semester={semester}
          round={selectedRound}
          examSessionId={examSessionId}
          programCode={programCode}
        />
      )}
    </div>
  );
}
