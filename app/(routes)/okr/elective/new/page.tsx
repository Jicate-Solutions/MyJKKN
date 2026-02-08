'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, Save, Info, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useCreateElectiveOKR } from '@/hooks/okr/use-learner-okrs';
import { toast } from 'sonner';
import { format, addMonths } from 'date-fns';

export default function NewElectiveOKRPage() {
  const router = useRouter();
  const createElective = useCreateElectiveOKR();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    why_matters: '',
    baseline_value: '',
    target_value: '',
    unit: '',
    deadline: format(addMonths(new Date(), 3), 'yyyy-MM-dd'),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!formData.deadline) {
      toast.error('Deadline is required');
      return;
    }

    try {
      await createElective.mutateAsync({
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        why_matters: formData.why_matters.trim() || undefined,
        baseline_value: formData.baseline_value ? Number(formData.baseline_value) : undefined,
        target_value: formData.target_value ? Number(formData.target_value) : undefined,
        unit: formData.unit.trim() || undefined,
        deadline: formData.deadline,
      });
      toast.success('Elective OKR created successfully');
      router.push('/okr/elective');
    } catch {
      toast.error('Failed to create elective OKR. New creation may be restricted.');
    }
  };

  return (
    <ContentLayout title="New Elective OKR">
      <div className="max-w-2xl mx-auto space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Consider Using Learning Paths</AlertTitle>
          <AlertDescription>
            Elective OKRs are transitioning to the Learning Paths module. For new goals, consider using Learning Paths instead.
            <Link href="/learning-paths" className="inline-flex items-center gap-1 ml-1 font-medium underline">
              Go to Learning Paths <ArrowRight className="h-3 w-3" />
            </Link>
          </AlertDescription>
        </Alert>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/okr/elective">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Create Elective OKR</h2>
            <p className="text-muted-foreground">Define a personal objective and key result</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Objective Details</CardTitle>
              <CardDescription>
                What do you want to achieve? Be specific and measurable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Complete AWS Cloud Practitioner Certification"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what you want to achieve and why..."
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="why_matters">Why This Matters</Label>
                <Textarea
                  id="why_matters"
                  placeholder="How does this align with your learning goals?"
                  value={formData.why_matters}
                  onChange={(e) => setFormData(prev => ({ ...prev, why_matters: e.target.value }))}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="baseline_value">Baseline Value</Label>
                  <Input
                    id="baseline_value"
                    type="number"
                    placeholder="0"
                    value={formData.baseline_value}
                    onChange={(e) => setFormData(prev => ({ ...prev, baseline_value: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target_value">Target Value</Label>
                  <Input
                    id="target_value"
                    type="number"
                    placeholder="100"
                    value={formData.target_value}
                    onChange={(e) => setFormData(prev => ({ ...prev, target_value: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Unit</Label>
                  <Input
                    id="unit"
                    placeholder="e.g., %, hours, modules"
                    value={formData.unit}
                    onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deadline">Deadline *</Label>
                <Input
                  id="deadline"
                  type="date"
                  value={formData.deadline}
                  onChange={(e) => setFormData(prev => ({ ...prev, deadline: e.target.value }))}
                  required
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" type="button" asChild>
              <Link href="/okr/elective">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createElective.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {createElective.isPending ? 'Creating...' : 'Create Elective OKR'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
