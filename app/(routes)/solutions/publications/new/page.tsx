'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Save,
  ArrowLeft,
  BookOpen,
  Users,
  Calendar,
  Award,
} from 'lucide-react';
import {
  useCreatePublication,
  PAPER_TYPE_LABELS,
  JOURNAL_TYPE_LABELS,
  PUBLICATION_STATUS_LABELS,
} from '@/hooks/solutions/use-publications';
import { useSolutions } from '@/hooks/solutions/use-solutions';
import type { PaperType, JournalType, PublicationStatus } from '@/lib/services/solutions/types';

interface FormState {
  solution_id: string;
  title: string;
  paper_type: string;
  journal_name: string;
  journal_type: string;
  authors_text: string;
  abstract: string;
  submitted_date: string;
  nirf_category: string;
  naac_criterion: string;
}

const initialFormState: FormState = {
  solution_id: '',
  title: '',
  paper_type: '',
  journal_name: '',
  journal_type: '',
  authors_text: '',
  abstract: '',
  submitted_date: '',
  nirf_category: '',
  naac_criterion: '',
};

function parseAuthorsText(
  text: string
): Array<{ name: string; affiliation?: string }> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split('-').map((s) => s.trim());
      return {
        name: parts[0],
        affiliation: parts[1] || undefined,
      };
    });
}

export default function NewPublicationPage() {
  const router = useRouter();
  const createPublication = useCreatePublication();
  const { data: solutionsData } = useSolutions({ limit: 100 });
  const solutions = solutionsData?.data || [];

  const [form, setForm] = useState<FormState>(initialFormState);

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.solution_id) {
      toast.error('Please select a solution');
      return;
    }

    if (!form.title.trim()) {
      toast.error('Please enter a publication title');
      return;
    }

    try {
      await createPublication.mutateAsync({
        solution_id: form.solution_id,
        title: form.title.trim(),
        paper_type: (form.paper_type as PaperType) || undefined,
        journal_name: form.journal_name || undefined,
        journal_type: (form.journal_type as JournalType) || undefined,
        authors: parseAuthorsText(form.authors_text),
        abstract: form.abstract || undefined,
        submitted_date: form.submitted_date || undefined,
        nirf_category: form.nirf_category || undefined,
        naac_criterion: form.naac_criterion || undefined,
        created_by: 'current-user',
      });

      toast.success('Publication added successfully');
      router.push('/solutions/publications');
    } catch (error) {
      console.error('Failed to create publication:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to save publication'
      );
    }
  };

  return (
    <ContentLayout title="Add Publication">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Publications', href: '/solutions/publications' },
          { label: 'New Publication' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Add Publication</h1>
            <p className="text-sm text-muted-foreground">
              Add a new publication or research output
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Publication Details */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Publication Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="solution_id">Linked Solution *</Label>
                  {solutions.length > 0 ? (
                    <Select
                      value={form.solution_id}
                      onValueChange={(val) => updateField('solution_id', val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a solution" />
                      </SelectTrigger>
                      <SelectContent>
                        {solutions.map((sol) => (
                          <SelectItem key={sol.id} value={sol.id}>
                            {sol.solution_code} - {sol.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="solution_id"
                      placeholder="Enter solution ID"
                      value={form.solution_id}
                      onChange={(e) => updateField('solution_id', e.target.value)}
                      required
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    placeholder="Publication title"
                    value={form.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    required
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="paper_type">Paper Type</Label>
                    <Select
                      value={form.paper_type}
                      onValueChange={(val) => updateField('paper_type', val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(PAPER_TYPE_LABELS) as [PaperType, string][]).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="journal_type">Journal/Index Type</Label>
                    <Select
                      value={form.journal_type}
                      onValueChange={(val) => updateField('journal_type', val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select index" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(JOURNAL_TYPE_LABELS) as [JournalType, string][]).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="abstract">Abstract</Label>
                  <Textarea
                    id="abstract"
                    placeholder="Brief summary of the publication"
                    rows={4}
                    value={form.abstract}
                    onChange={(e) => updateField('abstract', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Authors & Contributors */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Authors
                </CardTitle>
                <CardDescription>
                  Enter one author per line (format: Name - Affiliation)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="authors">Authors *</Label>
                  <Textarea
                    id="authors"
                    placeholder={"Dr. John Smith - JKKN College\nProf. Kumar - IIT Madras"}
                    rows={5}
                    value={form.authors_text}
                    onChange={(e) => updateField('authors_text', e.target.value)}
                    required
                  />
                </div>
              </CardContent>
            </Card>

            {/* Publication Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Journal / Conference Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="journal_name">Journal / Conference / Publisher</Label>
                  <Input
                    id="journal_name"
                    placeholder="Name of journal, conference, or publisher"
                    value={form.journal_name}
                    onChange={(e) => updateField('journal_name', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="submitted_date">Submitted Date</Label>
                  <Input
                    id="submitted_date"
                    type="date"
                    value={form.submitted_date}
                    onChange={(e) => updateField('submitted_date', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Accreditation Mapping */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Accreditation Mapping
                </CardTitle>
                <CardDescription>
                  Map this publication to NIRF/NAAC criteria for accreditation tracking
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nirf_category">NIRF Category</Label>
                    <Select
                      value={form.nirf_category}
                      onValueChange={(val) => updateField('nirf_category', val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select NIRF category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="research_publications">Research Publications</SelectItem>
                        <SelectItem value="conference_papers">Conference Papers</SelectItem>
                        <SelectItem value="patents">Patents</SelectItem>
                        <SelectItem value="consultancy">Consultancy Projects</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="naac_criterion">NAAC Criterion</Label>
                    <Select
                      value={form.naac_criterion}
                      onValueChange={(val) => updateField('naac_criterion', val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select NAAC criterion" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="C3_research">III - Research, Innovations and Extension</SelectItem>
                        <SelectItem value="C3_publications">III - Publications per Teacher</SelectItem>
                        <SelectItem value="C3_books">III - Books and Chapters</SelectItem>
                        <SelectItem value="C3_patents">III - Patents Published and Granted</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 mt-6">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={createPublication.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {createPublication.isPending ? 'Saving...' : 'Save Publication'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
