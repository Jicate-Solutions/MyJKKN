'use client';

// ============================================================================
// Record New Alumni Outcome
// Form to add a new graduate outcome record
// Phase P4.1 - Accountability
// ============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useCreateAlumniOutcome } from '@/hooks/alumni';
import {
  OUTCOME_TYPE_LABELS,
  SALARY_RANGE_OPTIONS,
  SALARY_RANGE_LABELS,
  DATA_SOURCE_LABELS
} from '@/types/alumni';
import type { OutcomeType, SalaryRange, DataSource, CreateAlumniOutcomeInput } from '@/types/alumni';

export default function NewAlumniOutcomePage() {
  const router = useRouter();
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const createOutcome = useCreateAlumniOutcome();

  // Form state
  const [name, setName] = useState('');
  const [graduationYear, setGraduationYear] = useState(new Date().getFullYear());
  const [outcomeType, setOutcomeType] = useState<OutcomeType>('employed');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [industry, setIndustry] = useState('');
  const [location, setLocation] = useState('');
  const [salaryRange, setSalaryRange] = useState<SalaryRange | ''>('');
  const [isCoreDomain, setIsCoreDomain] = useState<boolean | undefined>(undefined);
  const [higherStudyInstitution, setHigherStudyInstitution] = useState('');
  const [higherStudyProgram, setHigherStudyProgram] = useState('');
  const [startupName, setStartupName] = useState('');
  const [startupIndustry, setStartupIndustry] = useState('');
  const [timeToPlacementDays, setTimeToPlacementDays] = useState<number | ''>('');
  const [satisfactionScore, setSatisfactionScore] = useState<number | ''>('');
  const [feedback, setFeedback] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [dataSource, setDataSource] = useState<DataSource>('self_reported');
  const [competencies, setCompetencies] = useState('');

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 20 }, (_, i) => currentYear - i);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }

    const input: CreateAlumniOutcomeInput = {
      institution_id: institutionId,
      name: name.trim(),
      graduation_year: graduationYear,
      outcome_type: outcomeType,
      data_source: dataSource,
      competencies_utilized: competencies
        ? competencies.split(',').map(c => c.trim()).filter(Boolean)
        : []
    };

    // Add fields based on outcome type
    if (companyName) input.company_name = companyName;
    if (jobTitle) input.job_title = jobTitle;
    if (industry) input.industry = industry;
    if (location) input.location = location;
    if (salaryRange) input.salary_range = salaryRange;
    if (isCoreDomain !== undefined) input.is_core_domain = isCoreDomain;
    if (higherStudyInstitution) input.higher_study_institution = higherStudyInstitution;
    if (higherStudyProgram) input.higher_study_program = higherStudyProgram;
    if (startupName) input.startup_name = startupName;
    if (startupIndustry) input.startup_industry = startupIndustry;
    if (typeof timeToPlacementDays === 'number') input.time_to_placement_days = timeToPlacementDays;
    if (typeof satisfactionScore === 'number') input.satisfaction_score = satisfactionScore;
    if (feedback) input.feedback = feedback;
    if (linkedinUrl) input.linkedin_url = linkedinUrl;

    try {
      await createOutcome.mutateAsync(input);
      toast.success('Alumni outcome recorded successfully');
      router.push('/alumni/outcomes');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to record outcome');
    }
  };

  if (permissionsLoading || institutionsLoading) {
    return (
      <ContentLayout title="Record Outcome">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Record Alumni Outcome">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/alumni">Alumni</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/alumni/outcomes">Outcomes</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>New</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/alumni/outcomes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Record Alumni Outcome</h1>
            <p className="text-muted-foreground">
              Add a graduate outcome for tracking and accountability
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Graduate details and outcome type</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Graduate full name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="graduation-year">Graduation Year *</Label>
                  <Select
                    value={graduationYear.toString()}
                    onValueChange={(v) => setGraduationYear(parseInt(v, 10))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((year) => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="outcome-type">Outcome Type *</Label>
                  <Select
                    value={outcomeType}
                    onValueChange={(v) => setOutcomeType(v as OutcomeType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(OUTCOME_TYPE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="data-source">Data Source</Label>
                  <Select
                    value={dataSource}
                    onValueChange={(v) => setDataSource(v as DataSource)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DATA_SOURCE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Employment Details - shown for employed/freelancer */}
          {(outcomeType === 'employed' || outcomeType === 'freelancer') && (
            <Card>
              <CardHeader>
                <CardTitle>Employment Details</CardTitle>
                <CardDescription>Current or most recent employment</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company">Company / Organization</Label>
                    <Input
                      id="company"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Company name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="job-title">Job Title</Label>
                    <Input
                      id="job-title"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="Designation / role"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Input
                      id="industry"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      placeholder="e.g., IT, Healthcare"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="City, Country"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="salary-range">Salary Range</Label>
                    <Select
                      value={salaryRange || 'none'}
                      onValueChange={(v) => setSalaryRange(v === 'none' ? '' : v as SalaryRange)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not specified</SelectItem>
                        {SALARY_RANGE_OPTIONS.map((range) => (
                          <SelectItem key={range} value={range}>
                            {SALARY_RANGE_LABELS[range]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="core-domain">Is Core Domain?</Label>
                    <Select
                      value={isCoreDomain === undefined ? 'unknown' : isCoreDomain ? 'yes' : 'no'}
                      onValueChange={(v) => setIsCoreDomain(v === 'unknown' ? undefined : v === 'yes')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">Not specified</SelectItem>
                        <SelectItem value="yes">Yes - Same field as degree</SelectItem>
                        <SelectItem value="no">No - Different field</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="placement-days">Days to Placement</Label>
                    <Input
                      id="placement-days"
                      type="number"
                      min={0}
                      value={timeToPlacementDays}
                      onChange={(e) => setTimeToPlacementDays(e.target.value ? parseInt(e.target.value, 10) : '')}
                      placeholder="Days after graduation"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Higher Studies Details */}
          {outcomeType === 'higher_studies' && (
            <Card>
              <CardHeader>
                <CardTitle>Higher Studies Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hs-institution">Institution</Label>
                    <Input
                      id="hs-institution"
                      value={higherStudyInstitution}
                      onChange={(e) => setHigherStudyInstitution(e.target.value)}
                      placeholder="University / Institution name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hs-program">Program</Label>
                    <Input
                      id="hs-program"
                      value={higherStudyProgram}
                      onChange={(e) => setHigherStudyProgram(e.target.value)}
                      placeholder="e.g., M.Tech, MBA, PhD"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Entrepreneur Details */}
          {outcomeType === 'entrepreneur' && (
            <Card>
              <CardHeader>
                <CardTitle>Startup Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startup-name">Startup Name</Label>
                    <Input
                      id="startup-name"
                      value={startupName}
                      onChange={(e) => setStartupName(e.target.value)}
                      placeholder="Startup / Business name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startup-industry">Industry</Label>
                    <Input
                      id="startup-industry"
                      value={startupIndustry}
                      onChange={(e) => setStartupIndustry(e.target.value)}
                      placeholder="e.g., EdTech, FinTech"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Feedback & Additional */}
          <Card>
            <CardHeader>
              <CardTitle>Feedback & Additional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="satisfaction">Satisfaction Score (1-10)</Label>
                  <Input
                    id="satisfaction"
                    type="number"
                    min={1}
                    max={10}
                    value={satisfactionScore}
                    onChange={(e) => setSatisfactionScore(e.target.value ? parseInt(e.target.value, 10) : '')}
                    placeholder="1 (low) to 10 (high)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linkedin">LinkedIn URL</Label>
                  <Input
                    id="linkedin"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="competencies">Competencies Utilized (comma-separated)</Label>
                <Input
                  id="competencies"
                  value={competencies}
                  onChange={(e) => setCompetencies(e.target.value)}
                  placeholder="e.g., Python, Project Management, Data Analysis"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="feedback">Feedback / Comments</Label>
                <Textarea
                  id="feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Any additional feedback from the alumni..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={createOutcome.isPending || !name.trim()}
            >
              {createOutcome.isPending ? (
                <BeatLoader color="#fff" size={8} />
              ) : (
                'Save Outcome'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/alumni/outcomes')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
