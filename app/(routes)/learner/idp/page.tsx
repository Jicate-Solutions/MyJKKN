'use client';

// My Individual Development Plan — learner self-service (BUG-004298).
//
// UNGATED by design (same pattern as /my-induction-sessions): no
// RoutePermissionGuard layout and NO MENU_PERMISSIONS entry, so any signed-in
// user can reach it. Access to data is enforced at the DATABASE:
// cdc_idp_responses RLS lets a learner read/insert/update ONLY the row whose
// learner_id matches their own profiles.learner_id, and only while it is not yet
// approved. A user with no linked learner_id sees the "not a learner" notice and
// can touch nothing.
//
// Workflow: Save keeps the plan a draft (still private-to-edit); Submit marks it
// 'submitted' for the CDC team. The plan stays fully editable until a coordinator
// approves it — after that it renders read-only.

import { useEffect, useRef, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { useIdpByLearner, useCreateIdp, useUpdateIdp } from '@/hooks/cdc/use-cdc-idp';
import type { CdcIdpResponse } from '@/types/cdc/idp';
import { BeatLoader } from 'react-spinners';
import { X, Plus, CheckCircle2, Send, Save, ClipboardList } from 'lucide-react';

const STATUS_META: Record<
  CdcIdpResponse['submission_status'],
  { label: string; className: string }
> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700' },
  submitted: { label: 'Submitted', className: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700' },
};

export default function MyIdpPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const learnerId = profile?.learner_id ?? '';

  const { data: myIdp, isLoading: idpLoading } = useIdpByLearner(learnerId);
  const createIdp = useCreateIdp();
  const updateIdp = useUpdateIdp(myIdp?.id ?? '');

  // Editable field state (mirrors the CDC "New IDP" field set, minus the learner
  // + academic-year pickers — this is always the signed-in student's own plan).
  const [interestInput, setInterestInput] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [clubPickInput, setClubPickInput] = useState('');
  const [clubPicks, setClubPicks] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [academicStrengths, setAcademicStrengths] = useState('');
  const [shortTermGoal, setShortTermGoal] = useState('');
  const [longTermGoal, setLongTermGoal] = useState('');
  const [freeNotes, setFreeNotes] = useState('');

  // Hydrate the form from the saved row exactly once per row id, so refetches
  // (e.g. after a save) never clobber what the learner is currently typing.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (myIdp && hydratedFor.current !== myIdp.id) {
      hydratedFor.current = myIdp.id;
      setInterests((myIdp.interests as string[]) ?? []);
      setClubPicks(myIdp.club_picks ?? []);
      setSkills((myIdp.skills_self_attribution as string[]) ?? []);
      setAcademicStrengths(myIdp.academic_strengths ?? '');
      const plan = (myIdp.three_year_plan ?? {}) as Record<string, string>;
      setShortTermGoal(plan.short_term_goal ?? '');
      setLongTermGoal(plan.long_term_goal ?? '');
      setFreeNotes(myIdp.free_text_notes ?? '');
    }
  }, [myIdp]);

  const addTag = (
    input: string, setInput: (v: string) => void,
    list: string[], setList: (v: string[]) => void
  ) => {
    const val = input.trim();
    if (val && !list.includes(val)) setList([...list, val]);
    setInput('');
  };
  const removeTag = (val: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.filter(x => x !== val));
  };

  const status = myIdp?.submission_status ?? 'draft';
  const isApproved = status === 'approved';
  const saving = createIdp.isPending || updateIdp.isPending;

  // Persist the current form. `submit` = true flips the plan to 'submitted';
  // otherwise the existing status is preserved (a new plan is created as 'draft').
  const persist = async (submit: boolean) => {
    if (!learnerId || isApproved) return;

    const fields = {
      interests,
      club_picks: clubPicks,
      skills_self_attribution: skills,
      academic_strengths: academicStrengths.trim() || undefined,
      three_year_plan: { short_term_goal: shortTermGoal, long_term_goal: longTermGoal },
      free_text_notes: freeNotes || undefined,
    };

    let saved: CdcIdpResponse;
    if (myIdp?.id) {
      saved = await updateIdp.mutateAsync({
        ...fields,
        ...(submit ? { submission_status: 'submitted' as const } : {}),
      });
    } else {
      saved = await createIdp.mutateAsync({
        learner_id: learnerId,
        ...fields,
        submission_status: submit ? 'submitted' : 'draft',
      });
    }
    // Mark the (possibly newly created) row as already hydrated so the follow-up
    // refetch doesn't reset the fields the learner just saved.
    hydratedFor.current = saved.id;
  };

  // ── Loading / gating states ────────────────────────────────────────────────
  if (authLoading || (learnerId && idpLoading)) {
    return (
      <ContentLayout title="My Development Plan">
        <div className="flex justify-center py-20"><BeatLoader color="#3b82f6" /></div>
      </ContentLayout>
    );
  }

  if (!learnerId) {
    return (
      <ContentLayout title="My Development Plan">
        <PageBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'My Development Plan' }]} />
        <div className="mx-auto max-w-2xl py-10">
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              This page is for students. Your account isn&apos;t linked to a learner
              profile, so there is no development plan to fill in. If you think this is
              a mistake, please contact the CDC team.
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const statusMeta = STATUS_META[status];

  return (
    <ContentLayout title="My Development Plan">
      <PageBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'My Development Plan' }]} />

      <div className="mx-auto max-w-2xl py-4 space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-blue-600" />
              Individual Development Plan
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tell the CDC team about your interests, strengths and goals so they can
              support you.
            </p>
          </div>
          <Badge className={`${statusMeta.className} hover:${statusMeta.className}`}>
            {statusMeta.label}
          </Badge>
        </div>

        {status === 'submitted' && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Your plan has been submitted to the CDC team. You can still edit it until a
            coordinator approves it.
          </div>
        )}

        {isApproved && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Your plan has been approved by the CDC team
              {myIdp?.approved_at ? <> on {new Date(myIdp.approved_at).toLocaleDateString()}</> : null}.
              It is now read-only. Contact the CDC team if you need changes.
            </span>
          </div>
        )}

        {/* ── APPROVED: read-only summary ─────────────────────────────────── */}
        {isApproved ? (
          <>
            <ReadOnlyCard title="Interests" items={interests} />
            <ReadOnlyCard title="Club Preferences" items={clubPicks} />
            <ReadOnlyCard title="Skills" items={skills} />
            <Card>
              <CardHeader><CardTitle className="text-base">My Academic Strengths</CardTitle></CardHeader>
              <CardContent className="text-sm text-gray-600 whitespace-pre-wrap">
                {academicStrengths || <span className="text-gray-400">None recorded</span>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">3-Year Plan</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="font-medium text-gray-700">Short-term (1 year)</p>
                  <p className="text-gray-600 whitespace-pre-wrap">{shortTermGoal || '—'}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Long-term (3 years)</p>
                  <p className="text-gray-600 whitespace-pre-wrap">{longTermGoal || '—'}</p>
                </div>
              </CardContent>
            </Card>
            {freeNotes && (
              <Card>
                <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
                <CardContent className="text-sm text-gray-600 whitespace-pre-wrap">{freeNotes}</CardContent>
              </Card>
            )}
          </>
        ) : (
          /* ── DRAFT / SUBMITTED: editable form ──────────────────────────── */
          <form
            onSubmit={(e) => { e.preventDefault(); void persist(false); }}
            className="space-y-6"
          >
            {/* Interests */}
            <Card>
              <CardHeader><CardTitle className="text-base">Interests</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={interestInput}
                    onChange={e => setInterestInput(e.target.value)}
                    placeholder="Add an interest and press Enter"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(interestInput, setInterestInput, interests, setInterests); } }}
                  />
                  <Button type="button" variant="outline" size="icon"
                    onClick={() => addTag(interestInput, setInterestInput, interests, setInterests)}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {interests.map(i => (
                    <Badge key={i} variant="secondary" className="gap-1">{i}
                      <button type="button" onClick={() => removeTag(i, interests, setInterests)}><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Club Preferences */}
            <Card>
              <CardHeader><CardTitle className="text-base">Club Preferences</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={clubPickInput}
                    onChange={e => setClubPickInput(e.target.value)}
                    placeholder="Add a club preference and press Enter"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(clubPickInput, setClubPickInput, clubPicks, setClubPicks); } }}
                  />
                  <Button type="button" variant="outline" size="icon"
                    onClick={() => addTag(clubPickInput, setClubPickInput, clubPicks, setClubPicks)}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {clubPicks.map(c => (
                    <Badge key={c} variant="secondary" className="gap-1">{c}
                      <button type="button" onClick={() => removeTag(c, clubPicks, setClubPicks)}><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Skills */}
            <Card>
              <CardHeader><CardTitle className="text-base">Self-Attributed Skills</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={skillInput}
                    onChange={e => setSkillInput(e.target.value)}
                    placeholder="Add a skill and press Enter"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(skillInput, setSkillInput, skills, setSkills); } }}
                  />
                  <Button type="button" variant="outline" size="icon"
                    onClick={() => addTag(skillInput, setSkillInput, skills, setSkills)}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {skills.map(s => (
                    <Badge key={s} variant="secondary" className="gap-1">{s}
                      <button type="button" onClick={() => removeTag(s, skills, setSkills)}><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* My Academic Strengths */}
            <Card>
              <CardHeader><CardTitle className="text-base">My Academic Strengths</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                <Label htmlFor="academic_strengths">
                  In your own words, what are your academic strengths?
                </Label>
                <Textarea
                  id="academic_strengths"
                  value={academicStrengths}
                  onChange={e => setAcademicStrengths(e.target.value)}
                  rows={4}
                  placeholder="e.g. I grasp theory quickly, write clear lab reports, and enjoy solving applied problems…"
                />
              </CardContent>
            </Card>

            {/* 3-Year Plan */}
            <Card>
              <CardHeader><CardTitle className="text-base">3-Year Plan</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="short_term">Short-Term Goal (1 year)</Label>
                  <Textarea id="short_term" value={shortTermGoal}
                    onChange={e => setShortTermGoal(e.target.value)} rows={3}
                    placeholder="What do you want to achieve in 1 year?" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="long_term">Long-Term Goal (3 years)</Label>
                  <Textarea id="long_term" value={longTermGoal}
                    onChange={e => setLongTermGoal(e.target.value)} rows={3}
                    placeholder="What is your goal at the end of 3 years?" />
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader><CardTitle className="text-base">Additional Notes</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={freeNotes} onChange={e => setFreeNotes(e.target.value)} rows={4}
                  placeholder="Any additional thoughts or context..." />
              </CardContent>
            </Card>

            <div className="flex gap-3 flex-wrap">
              <Button type="submit" variant="outline" disabled={saving}>
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Saving…' : 'Save Draft'}
              </Button>
              <Button type="button" disabled={saving} onClick={() => void persist(true)}>
                <Send className="w-4 h-4 mr-1" />
                {status === 'submitted' ? 'Save & Re-submit' : 'Submit to CDC'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </ContentLayout>
  );
}

function ReadOnlyCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {items.length === 0
          ? <p className="text-gray-400 text-sm">None recorded</p>
          : items.map(i => <Badge key={i} variant="secondary">{i}</Badge>)}
      </CardContent>
    </Card>
  );
}
