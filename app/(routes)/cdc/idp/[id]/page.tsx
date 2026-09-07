'use client';

import { use, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useIdpById, useUpdateIdp, useApproveIdp } from '@/hooks/cdc/use-cdc-idp';
import type { CdcIdpResponse } from '@/types/cdc/idp';
import { BeatLoader } from 'react-spinners';
import { X, Plus, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';

// Submission-status badge styling (BUG-004298). Kept local to the CDC IDP UI.
const IDP_STATUS_META: Record<
  CdcIdpResponse['submission_status'],
  { label: string; className: string }
> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700 hover:bg-slate-100' },
  submitted: { label: 'Submitted', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700 hover:bg-green-100' },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function IdpDetailPage(props: PageProps) {
  return (
    <PermissionGuard module="cdc.idp" action="view">
      <IdpDetailContent {...props} />
    </PermissionGuard>
  );
}

function IdpDetailContent({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { data: idp, isLoading, error } = useIdpById(id);
  const updateIdp = useUpdateIdp(id);
  const approveIdp = useApproveIdp(id);

  const [editing, setEditing] = useState(false);
  const [interestInput, setInterestInput] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [clubPickInput, setClubPickInput] = useState('');
  const [clubPicks, setClubPicks] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [shortTermGoal, setShortTermGoal] = useState('');
  const [longTermGoal, setLongTermGoal] = useState('');
  const [freeNotes, setFreeNotes] = useState('');

  const startEdit = () => {
    if (!idp) return;
    setInterests((idp.interests as string[]) ?? []);
    setClubPicks(idp.club_picks ?? []);
    setSkills((idp.skills_self_attribution as string[]) ?? []);
    const plan = idp.three_year_plan as Record<string, string>;
    setShortTermGoal(plan?.short_term_goal ?? '');
    setLongTermGoal(plan?.long_term_goal ?? '');
    setFreeNotes(idp.free_text_notes ?? '');
    setEditing(true);
  };

  const handleSave = async () => {
    await updateIdp.mutateAsync({
      interests,
      club_picks: clubPicks,
      skills_self_attribution: skills,
      three_year_plan: { short_term_goal: shortTermGoal, long_term_goal: longTermGoal },
      free_text_notes: freeNotes || undefined,
    });
    setEditing(false);
  };

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

  if (isLoading) {
    return (
      <ContentLayout title="IDP Response">
        <div className="flex justify-center py-20"><BeatLoader color="#3b82f6" /></div>
      </ContentLayout>
    );
  }

  if (error || !idp) {
    return (
      <ContentLayout title="IDP Response">
        <p className="text-red-600 mt-6">{error?.message ?? 'Response not found'}</p>
      </ContentLayout>
    );
  }

  const learner = idp.learner as { name?: string; roll_number?: string } | null;
  const plan = idp.three_year_plan as Record<string, string>;
  const status = idp.submission_status ?? 'draft';
  const statusMeta = IDP_STATUS_META[status];

  const handleApprove = async () => {
    if (!window.confirm('Approve this IDP? The learner will no longer be able to edit it.')) return;
    await approveIdp.mutateAsync();
  };

  return (
    <ContentLayout title="IDP Response">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink href="/cdc/idp">IDP Responses</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{learner?.name ?? 'IDP Response'}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <button
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-1"
              onClick={() => router.push('/cdc/idp')}
            >
              <ArrowLeft className="w-3 h-3" /> Back
            </button>
            <h1 className="text-2xl font-semibold">{learner?.name ?? 'IDP Response'}</h1>
            {learner?.roll_number && (
              <p className="text-sm text-gray-500">Roll: {learner.roll_number}</p>
            )}
          </div>
          {!editing && (
            <div className="flex items-center gap-2 flex-wrap">
              {status !== 'approved' && (
                <PermissionGuard module="cdc.idp" action="edit" fallback={null}>
                  <Button onClick={handleApprove} disabled={approveIdp.isPending}>
                    {approveIdp.isPending
                      ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      : <CheckCircle2 className="w-4 h-4 mr-1" />}
                    Approve
                  </Button>
                </PermissionGuard>
              )}
              <PermissionGuard module="cdc.idp" action="edit" fallback={null}>
                <Button onClick={startEdit} variant="outline">Edit</Button>
              </PermissionGuard>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
          <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
          <span>Submitted: {new Date(idp.submitted_at).toLocaleDateString()}</span>
          {idp.academic_year_label && <span>Year: {idp.academic_year_label}</span>}
          {status === 'approved' && idp.approved_at && (
            <span>Approved: {new Date(idp.approved_at).toLocaleDateString()}</span>
          )}
          <Badge variant="outline">{idp.source === 'google_form_migration' ? 'Imported' : 'Native'}</Badge>
        </div>

        {/* View mode */}
        {!editing && (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Interests</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {(idp.interests as string[]).length === 0
                  ? <p className="text-gray-400 text-sm">None recorded</p>
                  : (idp.interests as string[]).map(i => (
                    <Badge key={i} variant="secondary">{i}</Badge>
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Club Preferences</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {(idp.club_picks ?? []).length === 0
                  ? <p className="text-gray-400 text-sm">None recorded</p>
                  : (idp.club_picks ?? []).map(c => (
                    <Badge key={c} variant="secondary">{c}</Badge>
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Skills</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {(idp.skills_self_attribution as string[]).length === 0
                  ? <p className="text-gray-400 text-sm">None recorded</p>
                  : (idp.skills_self_attribution as string[]).map(s => (
                    <Badge key={s} variant="secondary">{s}</Badge>
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">3-Year Plan</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="font-medium text-gray-700">Short-term (1 year)</p>
                  <p className="text-gray-600">{plan?.short_term_goal || '—'}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Long-term (3 years)</p>
                  <p className="text-gray-600">{plan?.long_term_goal || '—'}</p>
                </div>
              </CardContent>
            </Card>

            {idp.free_text_notes && (
              <Card>
                <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
                <CardContent className="text-sm text-gray-600">{idp.free_text_notes}</CardContent>
              </Card>
            )}
          </>
        )}

        {/* Edit mode */}
        {editing && (
          <div className="space-y-4">
            {/* Interests */}
            <Card>
              <CardHeader><CardTitle className="text-base">Interests</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input value={interestInput} onChange={e => setInterestInput(e.target.value)}
                    placeholder="Add interest"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(interestInput, setInterestInput, interests, setInterests); } }} />
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

            {/* Club Picks */}
            <Card>
              <CardHeader><CardTitle className="text-base">Club Preferences</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input value={clubPickInput} onChange={e => setClubPickInput(e.target.value)}
                    placeholder="Add club preference"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(clubPickInput, setClubPickInput, clubPicks, setClubPicks); } }} />
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
              <CardHeader><CardTitle className="text-base">Skills</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input value={skillInput} onChange={e => setSkillInput(e.target.value)}
                    placeholder="Add skill"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(skillInput, setSkillInput, skills, setSkills); } }} />
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

            {/* 3-year plan */}
            <Card>
              <CardHeader><CardTitle className="text-base">3-Year Plan</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label>Short-term goal (1 year)</Label>
                  <Textarea value={shortTermGoal} onChange={e => setShortTermGoal(e.target.value)} rows={3} />
                </div>
                <div className="space-y-1">
                  <Label>Long-term goal (3 years)</Label>
                  <Textarea value={longTermGoal} onChange={e => setLongTermGoal(e.target.value)} rows={3} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={freeNotes} onChange={e => setFreeNotes(e.target.value)} rows={4} />
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={updateIdp.isPending}>
                {updateIdp.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
