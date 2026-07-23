'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCreateIdp, useIdpPrefill } from '@/hooks/cdc/use-cdc-idp';
import { useLearnersForPicker } from '@/hooks/cdc/use-cdc-pickers';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { X, Plus, Sparkles, Loader2 } from 'lucide-react';

export default function NewIdpPage() {
  const router = useRouter();
  const createIdp = useCreateIdp();
  const { data: learnerOptions = [], isLoading: learnersLoading } = useLearnersForPicker();
  const { data: academicYearsData, isLoading: academicYearsLoading } = useAcademicYears();
  const academicYearOptions = academicYearsData?.data ?? [];

  const [learnerId, setLearnerId] = useState('');
  const [academicYear, setAcademicYear] = useState('');
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

  // Create-time prefill (BUG-004197): the moment a learner is chosen, pull a draft
  // assembled from their existing data and hydrate the editable fields. Hydrate
  // ONCE per learner (tracked by ref) so re-renders never clobber the
  // coordinator's edits. This is a CREATE-only aid — there is no edit-page equivalent.
  const { data: prefill, isFetching: prefilling } = useIdpPrefill(learnerId);
  const hydratedFor = useRef<string | null>(null);
  // BUG-004197 (provenance): which fields received a non-empty machine suggestion
  // at create time, so the saved IDP records what was prefilled vs hand-typed.
  const prefillSourcesRef = useRef<Record<string, string>>({});
  useEffect(() => {
    if (prefill && learnerId && hydratedFor.current !== learnerId) {
      hydratedFor.current = learnerId;
      setInterests(prefill.interests ?? []);
      setClubPicks(prefill.clubPicks ?? []);
      setSkills(prefill.skills ?? []);
      setAcademicStrengths(prefill.academicStrengths ?? '');

      const sources: Record<string, string> = {};
      if ((prefill.interests ?? []).length) sources.interests = 'prior_idp';
      if ((prefill.skills ?? []).length) sources.skills_self_attribution = 'prior_idp';
      if ((prefill.academicStrengths ?? '').trim()) sources.academic_strengths = 'prior_idp';
      if ((prefill.clubPicks ?? []).length) sources.club_picks = 'cdc_club_memberships';
      prefillSourcesRef.current = sources;
    }
  }, [prefill, learnerId]);
  const prefilled = !!prefill && hydratedFor.current === learnerId;

  const addTag = (
    input: string,
    setInput: (v: string) => void,
    list: string[],
    setList: (v: string[]) => void
  ) => {
    const val = input.trim();
    if (val && !list.includes(val)) setList([...list, val]);
    setInput('');
  };

  const removeTag = (val: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.filter(x => x !== val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!learnerId.trim()) return;

    await createIdp.mutateAsync({
      learner_id: learnerId.trim(),
      academic_year_label: academicYear || undefined,
      interests,
      club_picks: clubPicks,
      skills_self_attribution: skills,
      academic_strengths: academicStrengths.trim() || undefined,
      three_year_plan: {
        short_term_goal: shortTermGoal,
        long_term_goal: longTermGoal,
      },
      aspirations: {},
      free_text_notes: freeNotes || undefined,
      prefill_sources: prefillSourcesRef.current,
    });

    router.push('/cdc/idp');
  };

  return (
    <PermissionGuard module="cdc.idp" action="create">
    <ContentLayout title="New IDP Response">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href="/cdc/idp">IDP Responses</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>New</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 max-w-2xl">
        <h1 className="text-2xl font-semibold mb-6">New IDP Response</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Learner */}
          <Card>
            <CardHeader><CardTitle className="text-base">Learner</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="learner_id">Learner <span className="text-red-500">*</span></Label>
                <SearchableSelect
                  value={learnerId}
                  onValueChange={setLearnerId}
                  options={learnerOptions}
                  placeholder="Search by name or register number…"
                  searchPlaceholder="Type to search learners…"
                  emptyMessage="No matching learners"
                  loading={learnersLoading}
                  className="w-full"
                />
              </div>

              {learnerId && prefilling && !prefilled && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Pre-filling from {prefill?.learner.name ?? 'the learner'}&apos;s existing data…
                </p>
              )}
              {prefilled && (
                <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 flex items-start gap-2">
                  <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    {prefill?.hasPriorIdp
                      ? <>Pre-filled from {prefill?.learner.name}&apos;s existing data{prefill?.priorIdpYear ? <> (carried from AY {prefill.priorIdpYear})</> : null}. </>
                      : <>No earlier plan or club activity on record for {prefill?.learner.name}. </>}
                    Review and edit everything below before saving.
                  </span>
                </div>
              )}

              {/* Learner detail (BUG-004264) — contact + academic pulled from the
                  learner's MyJKKN profile so coordinators don't switch tabs to look
                  them up. Academic performance (CGPA/backlogs) is not shown because
                  MyJKKN records none per learner. Each field renders only when present. */}
              {prefilled && prefill?.learner && (
                prefill.learner.email || prefill.learner.mobile || prefill.learner.program ||
                prefill.learner.department || prefill.learner.semester
              ) && (
                <div className="rounded-md border bg-muted/30 px-3 py-3 text-sm">
                  <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                    {prefill.learner.register_number && (
                      <div><span className="text-xs text-muted-foreground">Register No.</span><div className="font-medium">{prefill.learner.register_number}</div></div>
                    )}
                    {prefill.learner.email && (
                      <div><span className="text-xs text-muted-foreground">Email</span><div className="font-medium break-all">{prefill.learner.email}</div></div>
                    )}
                    {prefill.learner.mobile && (
                      <div><span className="text-xs text-muted-foreground">Phone</span><div className="font-medium">{prefill.learner.mobile}</div></div>
                    )}
                    {prefill.learner.program && (
                      <div><span className="text-xs text-muted-foreground">Program</span><div className="font-medium">{prefill.learner.program}</div></div>
                    )}
                    {prefill.learner.department && (
                      <div><span className="text-xs text-muted-foreground">Department</span><div className="font-medium">{prefill.learner.department}</div></div>
                    )}
                    {prefill.learner.semester && (
                      <div><span className="text-xs text-muted-foreground">Semester</span><div className="font-medium">{prefill.learner.semester}</div></div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="academic_year">Academic Year</Label>
                <Select value={academicYear} onValueChange={setAcademicYear}>
                  <SelectTrigger id="academic_year" className="w-full">
                    <SelectValue
                      placeholder={academicYearsLoading ? 'Loading…' : 'Select an academic year'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYearOptions.map(y => (
                      <SelectItem key={y.id} value={y.academic_year_name}>
                        {y.academic_year_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Interests */}
          <Card>
            <CardHeader><CardTitle className="text-base">Interests</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={interestInput}
                  onChange={e => setInterestInput(e.target.value)}
                  placeholder="Add an interest and press Enter"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag(interestInput, setInterestInput, interests, setInterests);
                    }
                  }}
                />
                <Button type="button" variant="outline" size="icon"
                  onClick={() => addTag(interestInput, setInterestInput, interests, setInterests)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {interests.map(i => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {i}
                    <button type="button" onClick={() => removeTag(i, interests, setInterests)}>
                      <X className="w-3 h-3" />
                    </button>
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
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag(clubPickInput, setClubPickInput, clubPicks, setClubPicks);
                    }
                  }}
                />
                <Button type="button" variant="outline" size="icon"
                  onClick={() => addTag(clubPickInput, setClubPickInput, clubPicks, setClubPicks)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {clubPicks.map(c => (
                  <Badge key={c} variant="secondary" className="gap-1">
                    {c}
                    <button type="button" onClick={() => removeTag(c, clubPicks, setClubPicks)}>
                      <X className="w-3 h-3" />
                    </button>
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
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag(skillInput, setSkillInput, skills, setSkills);
                    }
                  }}
                />
                <Button type="button" variant="outline" size="icon"
                  onClick={() => addTag(skillInput, setSkillInput, skills, setSkills)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {skills.map(s => (
                  <Badge key={s} variant="secondary" className="gap-1">
                    {s}
                    <button type="button" onClick={() => removeTag(s, skills, setSkills)}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* My Academic Strengths (BUG-004061) — free-text narrative,
              distinct from the Self-Attributed Skills tag array above. */}
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
                placeholder="e.g. I grasp theory quickly, write clear lab reports, and enjoy solving applied problems in mathematics…"
              />
              <p className="text-xs text-muted-foreground">
                A short written answer about your academic strong points — separate
                from the skill tags above.
              </p>
            </CardContent>
          </Card>

          {/* 3-Year Plan */}
          <Card>
            <CardHeader><CardTitle className="text-base">3-Year Plan</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="short_term">Short-Term Goal (1 year)</Label>
                <Textarea
                  id="short_term"
                  value={shortTermGoal}
                  onChange={e => setShortTermGoal(e.target.value)}
                  rows={3}
                  placeholder="What do you want to achieve in 1 year?"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="long_term">Long-Term Goal (3 years)</Label>
                <Textarea
                  id="long_term"
                  value={longTermGoal}
                  onChange={e => setLongTermGoal(e.target.value)}
                  rows={3}
                  placeholder="What is your goal at the end of 3 years?"
                />
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader><CardTitle className="text-base">Additional Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                value={freeNotes}
                onChange={e => setFreeNotes(e.target.value)}
                rows={4}
                placeholder="Any additional thoughts or context..."
              />
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button type="submit" disabled={createIdp.isPending || !learnerId.trim()}>
              {createIdp.isPending ? 'Saving...' : 'Save IDP Response'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push('/cdc/idp')}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
