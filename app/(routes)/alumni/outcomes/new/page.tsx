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

  // Form state - matches CreateAlumniOutcomeInput
  const [learnerId, setLearnerId] = useState('');
  const [graduationDate, setGraduationDate] = useState('');
  const [outcomeType, setOutcomeType] = useState<OutcomeType>('employed');
  const [companyName, setCompanyName] = useState('');
  const [designation, setDesignation] = useState('');
  const [industrySector, setIndustrySector] = useState('');
  const [jobFunction, setJobFunction] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [salaryRange, setSalaryRange] = useState<SalaryRange | ''>('');
  const [isRelevantToProgram, setIsRelevantToProgram] = useState<boolean | undefined>(undefined);
  const [relevancePercentage, setRelevancePercentage] = useState<number | ''>('');
  const [institutionName, setInstitutionName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [isScholarship, setIsScholarship] = useState<boolean | undefined>(undefined);
  const [businessName, setBusinessName] = useState('');
  const [businessSector, setBusinessSector] = useState('');
  const [satisfactionScore, setSatisfactionScore] = useState<number | ''>('');
  const [feedback, setFeedback] = useState('');
  const [skillsUsed, setSkillsUsed] = useState('');
  const [dataSource, setDataSource] = useState<DataSource>('self_reported');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!learnerId.trim()) {
      toast.error('Learner ID is required');
      return;
    }

    if (!graduationDate) {
      toast.error('Graduation date is required');
      return;
    }

    const input: CreateAlumniOutcomeInput = {
      learner_id: learnerId.trim(),
      institution_id: institutionId,
      graduation_date: graduationDate,
      outcome_type: outcomeType,
      data_source: dataSource,
      skills_used: skillsUsed
        ? skillsUsed.split(',').map(c => c.trim()).filter(Boolean)
        : []
    };

    // Add fields based on outcome type
    if (companyName) input.company_name = companyName;
    if (designation) input.designation = designation;
    if (industrySector) input.industry_sector = industrySector;
    if (jobFunction) input.job_function = jobFunction;
    if (city) input.city = city;
    if (state) input.state = state;
    if (country) input.country = country;
    if (salaryRange) input.salary_range = salaryRange;
    if (isRelevantToProgram !== undefined) input.is_relevant_to_program = isRelevantToProgram;
    if (typeof relevancePercentage === 'number') input.relevance_percentage = relevancePercentage;
    if (institutionName) input.institution_name = institutionName;
    if (courseName) input.course_name = courseName;
    if (specialization) input.specialization = specialization;
    if (isScholarship !== undefined) input.is_scholarship = isScholarship;
    if (businessName) input.business_name = businessName;
    if (businessSector) input.business_sector = businessSector;
    if (typeof satisfactionScore === 'number') input.satisfaction_score = satisfactionScore;
    if (feedback) input.feedback = feedback;

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
                  <Label htmlFor="learner-id">Learner ID *</Label>
                  <Input
                    id="learner-id"
                    value={learnerId}
                    onChange={(e) => setLearnerId(e.target.value)}
                    placeholder="Enter learner UUID"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="graduation-date">Graduation Date *</Label>
                  <Input
                    id="graduation-date"
                    type="date"
                    value={graduationDate}
                    onChange={(e) => setGraduationDate(e.target.value)}
                    required
                  />
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

          {/* Employment Details - shown for employed/self_employed */}
          {(outcomeType === 'employed' || outcomeType === 'self_employed') && (
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
                    <Label htmlFor="designation">Designation</Label>
                    <Input
                      id="designation"
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder="Designation / role"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="industry-sector">Industry Sector</Label>
                    <Input
                      id="industry-sector"
                      value={industrySector}
                      onChange={(e) => setIndustrySector(e.target.value)}
                      placeholder="e.g., IT, Healthcare"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="job-function">Job Function</Label>
                    <Input
                      id="job-function"
                      value={jobFunction}
                      onChange={(e) => setJobFunction(e.target.value)}
                      placeholder="e.g., Software Development"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="State"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="Country"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <div className="space-y-2">
                    <Label htmlFor="relevant-to-program">Relevant to Program?</Label>
                    <Select
                      value={isRelevantToProgram === undefined ? 'unknown' : isRelevantToProgram ? 'yes' : 'no'}
                      onValueChange={(v) => setIsRelevantToProgram(v === 'unknown' ? undefined : v === 'yes')}
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
                      value={institutionName}
                      onChange={(e) => setInstitutionName(e.target.value)}
                      placeholder="University / Institution name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hs-course">Course</Label>
                    <Input
                      id="hs-course"
                      value={courseName}
                      onChange={(e) => setCourseName(e.target.value)}
                      placeholder="e.g., M.Tech, MBA, PhD"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hs-specialization">Specialization</Label>
                    <Input
                      id="hs-specialization"
                      value={specialization}
                      onChange={(e) => setSpecialization(e.target.value)}
                      placeholder="e.g., Data Science"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hs-scholarship">Scholarship?</Label>
                    <Select
                      value={isScholarship === undefined ? 'unknown' : isScholarship ? 'yes' : 'no'}
                      onValueChange={(v) => setIsScholarship(v === 'unknown' ? undefined : v === 'yes')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">Not specified</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Entrepreneur Details */}
          {outcomeType === 'entrepreneur' && (
            <Card>
              <CardHeader>
                <CardTitle>Business Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="business-name">Business Name</Label>
                    <Input
                      id="business-name"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Business / Startup name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="business-sector">Business Sector</Label>
                    <Input
                      id="business-sector"
                      value={businessSector}
                      onChange={(e) => setBusinessSector(e.target.value)}
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="skills-used">Skills Used (comma-separated)</Label>
                <Input
                  id="skills-used"
                  value={skillsUsed}
                  onChange={(e) => setSkillsUsed(e.target.value)}
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
              disabled={createOutcome.isPending || !learnerId.trim() || !graduationDate}
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
