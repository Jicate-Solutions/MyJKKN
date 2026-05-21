'use client';

import { useState } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCreateIdp } from '@/hooks/cdc/use-cdc-idp';
import { X, Plus } from 'lucide-react';

export default function NewIdpPage() {
  const router = useRouter();
  const createIdp = useCreateIdp();

  const [learnerId, setLearnerId] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [interestInput, setInterestInput] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [clubPickInput, setClubPickInput] = useState('');
  const [clubPicks, setClubPicks] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [shortTermGoal, setShortTermGoal] = useState('');
  const [longTermGoal, setLongTermGoal] = useState('');
  const [freeNotes, setFreeNotes] = useState('');

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
      three_year_plan: {
        short_term_goal: shortTermGoal,
        long_term_goal: longTermGoal,
      },
      aspirations: {},
      free_text_notes: freeNotes || undefined,
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
                <Label htmlFor="learner_id">Learner ID <span className="text-red-500">*</span></Label>
                <Input
                  id="learner_id"
                  value={learnerId}
                  onChange={e => setLearnerId(e.target.value)}
                  placeholder="UUID of the learner"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="academic_year">Academic Year</Label>
                <Input
                  id="academic_year"
                  value={academicYear}
                  onChange={e => setAcademicYear(e.target.value)}
                  placeholder="e.g. 2025-26"
                />
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
