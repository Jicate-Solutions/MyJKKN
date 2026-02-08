'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Briefcase,
  Plus,
  Clock,
  Award,
  Calendar,
  Building2,
  Star
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import {
  useFacilitatorDevelopment,
  useUpdateFacilitatorDevelopment,
  useCreateImmersion,
  useDeleteImmersion
} from '@/hooks/facilitator';
import {
  STAGE_LABELS,
  STAGE_COLORS,
  DEVELOPMENT_STATUS_LABELS,
  DEVELOPMENT_STATUS_COLORS,
  IMMERSION_STATUS_LABELS,
  IMMERSION_STATUS_COLORS,
  type DevelopmentStage,
  type DevelopmentStatus,
  type ImmersionStatus,
  type CreateImmersionInput
} from '@/types/facilitator-development';
import { toast } from 'react-hot-toast';

export default function FacilitatorDevelopmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: record, isLoading, refetch } = useFacilitatorDevelopment(id);
  const updateMutation = useUpdateFacilitatorDevelopment(id);
  const createImmersionMutation = useCreateImmersion();
  const deleteImmersionMutation = useDeleteImmersion();

  const [showImmersionDialog, setShowImmersionDialog] = useState(false);
  const [immersionForm, setImmersionForm] = useState({
    company_name: '',
    industry: '',
    role_title: '',
    duration_days: '',
    start_date: '',
    end_date: '',
    objectives: '',
    status: 'planned' as ImmersionStatus
  });

  const handleStageChange = async (newStage: DevelopmentStage) => {
    try {
      await updateMutation.mutateAsync({ current_stage: newStage });
      refetch();
    } catch {
      // Error handled by service toast
    }
  };

  const handleStatusChange = async (newStatus: DevelopmentStatus) => {
    try {
      await updateMutation.mutateAsync({ status: newStatus });
      refetch();
    } catch {
      // Error handled by service toast
    }
  };

  const handleCreateImmersion = async () => {
    if (!immersionForm.company_name || !immersionForm.start_date || !immersionForm.duration_days) return;

    // Validate end_date is after start_date
    if (immersionForm.end_date && immersionForm.start_date) {
      const startDate = new Date(immersionForm.start_date);
      const endDate = new Date(immersionForm.end_date);
      if (endDate < startDate) {
        toast.error('End date cannot be before start date');
        return;
      }
    }

    // Validate duration is positive
    const duration = parseInt(immersionForm.duration_days, 10);
    if (duration <= 0 || isNaN(duration)) {
      toast.error('Duration must be a positive number');
      return;
    }

    const input: CreateImmersionInput = {
      development_id: id,
      company_name: immersionForm.company_name,
      industry: immersionForm.industry || undefined,
      role_title: immersionForm.role_title || undefined,
      duration_days: duration,
      start_date: immersionForm.start_date,
      end_date: immersionForm.end_date || undefined,
      objectives: immersionForm.objectives ? immersionForm.objectives.split('\n').filter(Boolean) : [],
      status: immersionForm.status
    };

    try {
      await createImmersionMutation.mutateAsync(input);
      setShowImmersionDialog(false);
      setImmersionForm({
        company_name: '',
        industry: '',
        role_title: '',
        duration_days: '',
        start_date: '',
        end_date: '',
        objectives: '',
        status: 'planned'
      });
      refetch();
    } catch {
      // Error handled by service toast
    }
  };

  const handleDeleteImmersion = async (immersionId: string) => {
    if (!confirm('Delete this immersion record?')) return;
    try {
      await deleteImmersionMutation.mutateAsync(immersionId);
      refetch();
    } catch {
      // Error handled by service toast
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title='Development Detail'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!record) {
    return (
      <ContentLayout title='Development Detail'>
        <div className='text-center py-8'>
          <p className='text-destructive'>Development record not found.</p>
          <Button asChild className='mt-4' variant='outline'>
            <Link href='/facilitator-development/records'>Back to Records</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const immersions = record.immersions || [];
  const plan = record.development_plan || {};

  // Stage progression for timeline
  const stages: DevelopmentStage[] = ['teacher', 'transitioning', 'facilitator', 'master_facilitator'];
  const currentIdx = stages.indexOf(record.current_stage);

  return (
    <ContentLayout title='Development Detail'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Facilitator Development', href: '/facilitator-development' },
          { label: 'Records', href: '/facilitator-development/records' },
          { label: 'Detail', href: `/facilitator-development/records/${id}` }
        ]}
      />
      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div className='flex items-center gap-3'>
            <Button variant='ghost' size='sm' onClick={() => router.back()}>
              <ArrowLeft className='h-4 w-4' />
            </Button>
            <div>
              <h1 className='text-2xl font-bold'>Development Plan</h1>
              <p className='text-sm text-muted-foreground font-mono'>
                {record.staff_id.slice(0, 8)}...
              </p>
            </div>
          </div>
          <div className='flex gap-2'>
            <Badge className={DEVELOPMENT_STATUS_COLORS[record.status]}>
              {DEVELOPMENT_STATUS_LABELS[record.status]}
            </Badge>
            <Badge className={STAGE_COLORS[record.current_stage]}>
              {STAGE_LABELS[record.current_stage]}
            </Badge>
          </div>
        </div>

        {/* Stage Progression Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>Stage Progression</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='flex items-center justify-between'>
              {stages.map((stage, idx) => (
                <div key={stage} className='flex items-center flex-1'>
                  <div className='flex flex-col items-center'>
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                        idx <= currentIdx
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <span className={`text-xs mt-1 text-center ${
                      idx <= currentIdx ? 'font-semibold text-blue-700' : 'text-muted-foreground'
                    }`}>
                      {STAGE_LABELS[stage]}
                    </span>
                  </div>
                  {idx < stages.length - 1 && (
                    <div className={`flex-1 h-1 mx-2 rounded ${
                      idx < currentIdx ? 'bg-blue-600' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              ))}
            </div>
            <div className='flex gap-2 mt-4'>
              <Select value={record.current_stage} onValueChange={(v) => handleStageChange(v as DevelopmentStage)} disabled={updateMutation.isPending}>
                <SelectTrigger className='max-w-[200px]'>
                  <SelectValue placeholder='Update stage' />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(STAGE_LABELS) as [DevelopmentStage, string][]).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={record.status} onValueChange={(v) => handleStatusChange(v as DevelopmentStatus)} disabled={updateMutation.isPending}>
                <SelectTrigger className='max-w-[200px]'>
                  <SelectValue placeholder='Update status' />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(DEVELOPMENT_STATUS_LABELS) as [DevelopmentStatus, string][]).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Metrics */}
        <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
          <Card>
            <CardContent className='p-4 text-center'>
              <div className='text-2xl font-bold'>
                {record.outcome_score !== null ? `${Number(record.outcome_score).toFixed(1)}/100` : '--'}
              </div>
              <p className='text-xs text-muted-foreground'>Outcome Score</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='p-4 text-center'>
              <div className='text-2xl font-bold'>{record.workshops_attended ?? 0}</div>
              <p className='text-xs text-muted-foreground'>Workshops Attended</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='p-4 text-center'>
              <div className='text-2xl font-bold'>{record.industry_exposure_hours ?? 0}</div>
              <p className='text-xs text-muted-foreground'>Industry Hours</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='p-4 text-center'>
              <div className='text-2xl font-bold'>
                {record.student_feedback_average !== null
                  ? `${Number(record.student_feedback_average).toFixed(1)}/5`
                  : '--'}
              </div>
              <p className='text-xs text-muted-foreground'>Student Feedback</p>
            </CardContent>
          </Card>
        </div>

        {/* Additional Stats Row */}
        <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
          <Card>
            <CardContent className='p-4 text-center'>
              <div className='text-2xl font-bold'>{record.workshops_facilitated ?? 0}</div>
              <p className='text-xs text-muted-foreground'>Workshops Facilitated</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='p-4 text-center'>
              <div className='text-2xl font-bold'>{record.peer_observations_done ?? 0}</div>
              <p className='text-xs text-muted-foreground'>Peer Obs Done</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='p-4 text-center'>
              <div className='text-2xl font-bold'>{record.peer_observations_received ?? 0}</div>
              <p className='text-xs text-muted-foreground'>Peer Obs Received</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='p-4 text-center'>
              <div className='text-2xl font-bold'>{record.competencies_acquired?.length || 0}</div>
              <p className='text-xs text-muted-foreground'>Competencies</p>
            </CardContent>
          </Card>
        </div>

        {/* Development Plan */}
        {plan.goals && plan.goals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className='text-lg'>Development Goals</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className='list-disc list-inside space-y-1'>
                {plan.goals.map((goal: string, idx: number) => (
                  <li key={idx} className='text-sm'>{goal}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Competencies */}
        {record.competencies_acquired && record.competencies_acquired.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className='text-lg'>Competencies Acquired</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='flex flex-wrap gap-2'>
                {record.competencies_acquired.map((comp, idx) => (
                  <Badge key={idx} variant='outline'>{comp}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Certifications */}
        {record.certifications && record.certifications.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className='text-lg'>Certifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-2'>
                {record.certifications.map((cert: any, idx: number) => (
                  <div key={idx} className='flex items-center gap-3 p-2 bg-muted rounded'>
                    <Award className='h-4 w-4 text-amber-600' />
                    <div>
                      <span className='font-medium text-sm'>{cert.name}</span>
                      {cert.issuer && <span className='text-xs text-muted-foreground ml-2'>by {cert.issuer}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Industry Immersions */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between'>
            <CardTitle className='text-lg'>Industry Immersions</CardTitle>
            <Dialog open={showImmersionDialog} onOpenChange={(open) => {
              setShowImmersionDialog(open);
              if (!open) {
                // Reset form when dialog is closed
                setImmersionForm({
                  company_name: '',
                  industry: '',
                  role_title: '',
                  duration_days: '',
                  start_date: '',
                  end_date: '',
                  objectives: '',
                  status: 'planned'
                });
              }
            }}>
              <DialogTrigger asChild>
                <Button size='sm'>
                  <Plus className='mr-2 h-4 w-4' />
                  Add Immersion
                </Button>
              </DialogTrigger>
              <DialogContent className='max-w-md'>
                <DialogHeader>
                  <DialogTitle>Add Industry Immersion</DialogTitle>
                </DialogHeader>
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <Label>Company Name *</Label>
                    <Input
                      value={immersionForm.company_name}
                      onChange={(e) => setImmersionForm(f => ({ ...f, company_name: e.target.value }))}
                      placeholder='e.g., TCS, Infosys'
                    />
                  </div>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-2'>
                      <Label>Industry</Label>
                      <Input
                        value={immersionForm.industry}
                        onChange={(e) => setImmersionForm(f => ({ ...f, industry: e.target.value }))}
                        placeholder='e.g., IT, Healthcare'
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label>Role Title</Label>
                      <Input
                        value={immersionForm.role_title}
                        onChange={(e) => setImmersionForm(f => ({ ...f, role_title: e.target.value }))}
                        placeholder='e.g., Observer'
                      />
                    </div>
                  </div>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-2'>
                      <Label>Duration (days) *</Label>
                      <Input
                        type='number'
                        value={immersionForm.duration_days}
                        onChange={(e) => setImmersionForm(f => ({ ...f, duration_days: e.target.value }))}
                        min='1'
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label>Status</Label>
                      <Select
                        value={immersionForm.status}
                        onValueChange={(v) => setImmersionForm(f => ({ ...f, status: v as ImmersionStatus }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(IMMERSION_STATUS_LABELS) as [ImmersionStatus, string][]).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-2'>
                      <Label>Start Date *</Label>
                      <Input
                        type='date'
                        value={immersionForm.start_date}
                        onChange={(e) => setImmersionForm(f => ({ ...f, start_date: e.target.value }))}
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label>End Date</Label>
                      <Input
                        type='date'
                        value={immersionForm.end_date}
                        onChange={(e) => setImmersionForm(f => ({ ...f, end_date: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className='space-y-2'>
                    <Label>Objectives</Label>
                    <Textarea
                      value={immersionForm.objectives}
                      onChange={(e) => setImmersionForm(f => ({ ...f, objectives: e.target.value }))}
                      placeholder='One per line'
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant='outline' onClick={() => setShowImmersionDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateImmersion}
                    disabled={createImmersionMutation.isPending || !immersionForm.company_name || !immersionForm.start_date || !immersionForm.duration_days}
                  >
                    {createImmersionMutation.isPending ? <BeatLoader size={8} color='white' /> : 'Add'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {immersions.length === 0 ? (
              <div className='text-center py-8 text-muted-foreground'>
                <Building2 className='h-8 w-8 mx-auto mb-2 opacity-50' />
                <p>No industry immersions recorded yet.</p>
              </div>
            ) : (
              <div className='grid gap-4'>
                {immersions.map((imm) => (
                  <div
                    key={imm.id}
                    className='border rounded-lg p-4 hover:shadow-sm transition-shadow'
                  >
                    <div className='flex items-start justify-between'>
                      <div className='flex items-start gap-3'>
                        <div className='p-2 bg-muted rounded-lg'>
                          <Building2 className='h-5 w-5 text-blue-600' />
                        </div>
                        <div>
                          <h4 className='font-semibold'>{imm.company_name}</h4>
                          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                            {imm.industry && <span>{imm.industry}</span>}
                            {imm.role_title && (
                              <>
                                <span>-</span>
                                <span>{imm.role_title}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className='flex items-center gap-2'>
                        <Badge className={IMMERSION_STATUS_COLORS[imm.status]}>
                          {IMMERSION_STATUS_LABELS[imm.status]}
                        </Badge>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() => handleDeleteImmersion(imm.id)}
                          className='text-destructive hover:text-destructive'
                        >
                          x
                        </Button>
                      </div>
                    </div>
                    <div className='flex gap-4 mt-3 text-sm text-muted-foreground'>
                      <div className='flex items-center gap-1'>
                        <Calendar className='h-3 w-3' />
                        {imm.start_date ? (
                          <>
                            {new Date(imm.start_date).toLocaleDateString()}
                            {imm.end_date && !isNaN(new Date(imm.end_date).getTime()) && ` - ${new Date(imm.end_date).toLocaleDateString()}`}
                          </>
                        ) : 'N/A'}
                      </div>
                      <div className='flex items-center gap-1'>
                        <Clock className='h-3 w-3' />
                        {imm.duration_days ?? 0} days
                      </div>
                      {imm.rating && (
                        <div className='flex items-center gap-1'>
                          <Star className='h-3 w-3 text-amber-500' />
                          {imm.rating}/5
                        </div>
                      )}
                    </div>
                    {imm.skills_acquired && imm.skills_acquired.length > 0 && (
                      <div className='flex flex-wrap gap-1 mt-2'>
                        {imm.skills_acquired.map((skill, idx) => (
                          <Badge key={idx} variant='secondary' className='text-xs'>
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mentor Notes */}
        {record.mentor_notes && (
          <Card>
            <CardHeader>
              <CardTitle className='text-lg'>Mentor Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-sm whitespace-pre-wrap'>{record.mentor_notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
