'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useCreateFacilitatorDevelopment } from '@/hooks/facilitator';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { usePermissions } from '@/hooks/use-permissions';
import {
  STAGE_LABELS,
  type DevelopmentStage,
  type CreateFacilitatorDevelopmentInput
} from '@/types/facilitator-development';
import { toast } from 'react-hot-toast';

export default function NewDevelopmentPlanPage() {
  const router = useRouter();
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const createMutation = useCreateFacilitatorDevelopment();

  const [staffId, setStaffId] = useState('');
  const [currentStage, setCurrentStage] = useState<DevelopmentStage>('teacher');
  const [targetStage, setTargetStage] = useState<DevelopmentStage>('facilitator');
  const [mentorId, setMentorId] = useState('');
  const [mentorNotes, setMentorNotes] = useState('');
  const [goals, setGoals] = useState('');
  const [competencies, setCompetencies] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!staffId.trim()) {
      return;
    }

    // Basic UUID validation (format check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(staffId.trim())) {
      toast.error('Staff ID must be a valid UUID');
      return;
    }

    if (mentorId.trim() && !uuidRegex.test(mentorId.trim())) {
      toast.error('Mentor ID must be a valid UUID');
      return;
    }

    const input: CreateFacilitatorDevelopmentInput = {
      institution_id: institutionId,
      staff_id: staffId.trim(),
      current_stage: currentStage,
      target_stage: targetStage,
      development_plan: {
        goals: goals ? goals.split('\n').filter(Boolean) : [],
        milestones: []
      },
      competencies_acquired: competencies ? competencies.split(',').map(c => c.trim()).filter(Boolean) : [],
      mentor_id: mentorId.trim() || undefined,
      mentor_notes: mentorNotes.trim() || undefined
    };

    try {
      const result = await createMutation.mutateAsync(input);
      router.push(`/facilitator-development/records/${result.id}`);
    } catch {
      // Error handled by service toast
    }
  };

  if (permissionsLoading || institutionsLoading) {
    return (
      <ContentLayout title='New Development Plan'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='New Development Plan'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Facilitator Development', href: '/facilitator-development' },
          { label: 'Records', href: '/facilitator-development/records' },
          { label: 'New Plan', href: '/facilitator-development/records/new' }
        ]}
      />
      <div className='max-w-2xl mx-auto mt-4'>
        <Card>
          <CardHeader>
            <CardTitle>Create Development Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className='space-y-6'>
              {/* Staff ID */}
              <div className='space-y-2'>
                <Label htmlFor='staff_id'>Staff ID *</Label>
                <Input
                  id='staff_id'
                  placeholder='Enter staff UUID'
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  required
                />
                <p className='text-xs text-muted-foreground'>
                  UUID of the staff member from the staff table
                </p>
              </div>

              {/* Stage selection */}
              <div className='grid grid-cols-2 gap-4'>
                <div className='space-y-2'>
                  <Label>Current Stage</Label>
                  <Select value={currentStage} onValueChange={(v) => setCurrentStage(v as DevelopmentStage)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(STAGE_LABELS) as [DevelopmentStage, string][]).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-2'>
                  <Label>Target Stage</Label>
                  <Select value={targetStage} onValueChange={(v) => setTargetStage(v as DevelopmentStage)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(STAGE_LABELS) as [DevelopmentStage, string][]).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Goals */}
              <div className='space-y-2'>
                <Label htmlFor='goals'>Development Goals</Label>
                <Textarea
                  id='goals'
                  placeholder='Enter goals (one per line)'
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  rows={4}
                />
              </div>

              {/* Competencies */}
              <div className='space-y-2'>
                <Label htmlFor='competencies'>Competencies Acquired</Label>
                <Input
                  id='competencies'
                  placeholder='Comma-separated (e.g., Active Learning, PBL, Mentoring)'
                  value={competencies}
                  onChange={(e) => setCompetencies(e.target.value)}
                />
              </div>

              {/* Mentor */}
              <div className='space-y-2'>
                <Label htmlFor='mentor_id'>Mentor ID (Optional)</Label>
                <Input
                  id='mentor_id'
                  placeholder='UUID of the mentoring facilitator'
                  value={mentorId}
                  onChange={(e) => setMentorId(e.target.value)}
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='mentor_notes'>Mentor Notes</Label>
                <Textarea
                  id='mentor_notes'
                  placeholder='Initial notes from mentor...'
                  value={mentorNotes}
                  onChange={(e) => setMentorNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Actions */}
              <div className='flex gap-3 justify-end'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
                <Button
                  type='submit'
                  disabled={createMutation.isPending || !staffId.trim()}
                >
                  {createMutation.isPending ? (
                    <BeatLoader size={8} color='white' />
                  ) : (
                    'Create Plan'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
