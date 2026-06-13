'use client';

/**
 * Assessment Panel — round-wise CIA marks for the active session.
 *
 * All data comes from the aggregate cia-view payload (session prop) — no
 * fetching here. Flow:
 *   1. Pick a CIA setting (session.settings[]) — auto-selects the first.
 *   2. Pick a round (selectedSetting.rounds[]) — auto-selects the lowest.
 *   3. Render the marks table (session.courses × the round's components).
 *
 * Setting/round selections mirror to the URL (?setting / ?round) so the view is
 * shareable.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings2 } from 'lucide-react';
import type { CiaViewSession, CiaViewCourse } from '@/types/my-marks';
import { CiaSettingPicker } from './cia-setting-picker';
import { RoundPicker } from './round-picker';
import { MarksTable } from './marks-table';

/**
 * A course is CIA-applicable when:
 *   - evaluation_type ∈ {CIA, CIA + ESE}  — i.e. it has a CIA component
 *     (matched as "contains cia" so "CIA", "CIA + ESE", "CIA+ESE" all pass and
 *     "ESE"-only is excluded), AND
 *   - result_type = Mark  (excludes grade/credit-typed courses).
 * Missing fields are treated as applicable, so the filter is a no-op until COE
 * includes evaluation_type/result_type on the cia-view course.
 */
function isCiaApplicable(c: CiaViewCourse): boolean {
  const evalType = c.evaluation_type?.trim().toLowerCase();
  const resultType = c.result_type?.trim().toLowerCase();
  const evalOk = !evalType || evalType.includes('cia');
  const resultOk = !resultType || resultType === 'mark';
  return evalOk && resultOk;
}

interface Props {
  session: CiaViewSession;
  initialSettingId?: string;
  initialRound?: number;
}

export function AssessmentPanel({ session, initialSettingId, initialRound }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const settings = session.settings ?? [];

  // Internal/CIA tab shows:
  //  - REGULAR papers only (arrears belong to an earlier semester), AND
  //  - CIA-applicable courses only: evaluation_type ∈ {CIA, CIA + ESE} and
  //    result_type = Mark (excludes grade/credit-typed courses like extension
  //    activities that have no CIA marks).
  // The evaluation/result filters are no-ops until COE includes those fields on
  // the cia-view course (a course with the field absent is kept).
  const regularCourses = session.courses.filter((c) => {
    if (c.is_regular === false) return false;
    if (!isCiaApplicable(c)) return false;
    return true;
  });

  const [settingId, setSettingId] = useState<string | undefined>(initialSettingId);
  const [round, setRound] = useState<number | undefined>(initialRound);

  // Auto-pick the first setting when none selected / selection not in this session.
  useEffect(() => {
    if (settings.length === 0) return;
    if (settingId && settings.some((s) => s.setting_id === settingId)) return;
    const auto = settings[0];
    setSettingId(auto.setting_id);
    pushParam('setting', auto.setting_id);
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedSetting = useMemo(
    () => settings.find((s) => s.setting_id === settingId) ?? settings[0],
    [settings, settingId]
  );

  // Auto-pick the lowest round on first load / when the setting changes.
  useEffect(() => {
    if (!selectedSetting) return;
    if (round && selectedSetting.rounds.some((r) => r.round === round)) return;
    const auto = [...selectedSetting.rounds].sort((a, b) => a.round - b.round)[0];
    if (auto) {
      setRound(auto.round);
      pushParam('round', String(auto.round));
    }
  }, [selectedSetting]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRound = useMemo(
    () => selectedSetting?.rounds.find((r) => r.round === round),
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

  if (settings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            No assessments configured yet
          </CardTitle>
          <CardDescription>
            Your faculty hasn&apos;t set up CIA assessments for {session.semester_label} yet.
            Marks will appear here once setup is complete.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {settings.length > 1 && (
        <Card>
          <CardContent className="p-2 sm:p-3">
            <CiaSettingPicker
              settings={settings}
              selectedId={settingId}
              onChange={handleSettingChange}
            />
          </CardContent>
        </Card>
      )}

      {selectedSetting && selectedSetting.rounds.length > 0 && (
        <RoundPicker
          rounds={selectedSetting.rounds}
          value={round}
          onChange={handleRoundChange}
        />
      )}

      {selectedRound && (
        <MarksTable courses={regularCourses} round={selectedRound} />
      )}
    </div>
  );
}
