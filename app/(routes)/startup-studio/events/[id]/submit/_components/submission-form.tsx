'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Send,
  Globe,
  Video,
  FileText,
  Link as LinkIcon,
  Github,
} from 'lucide-react';
import { useSSEvent } from '@/hooks/startup-studio';
import { apiClient } from '@/lib/api/client';

interface SubmissionFormProps {
  eventId: string;
}

const CATEGORIES = [
  'Education',
  'Healthcare',
  'Agriculture',
  'Sustainability',
  'Finance',
  'Social Impact',
  'Productivity',
  'Entertainment',
  'Other',
];

function useCreateSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: Record<string, any> }) =>
      apiClient.post(`/api/startup-studio/events/${eventId}/submit`, { ...data, auto_submit: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['startup-studio'] });
    },
  });
}

export function SubmissionForm({ eventId }: SubmissionFormProps) {
  const router = useRouter();
  const { data: eventRaw, isLoading: eventLoading, error: eventError } = useSSEvent(eventId);
  const event = eventRaw as any;
  const createSubmission = useCreateSubmission();

  const [formData, setFormData] = useState({
    app_name: '',
    problem_statement: '',
    solution_summary: '',
    live_url: '',
    lovable_url: '',
    github_repo_url: '',
    elevator_pitch: '',
    demo_video_url: '',
    category: '',
  });
  const [validationError, setValidationError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validate = (): boolean => {
    if (!formData.app_name.trim()) {
      setValidationError('App name is required.');
      return false;
    }
    if (!formData.problem_statement.trim()) {
      setValidationError('Problem statement is required.');
      return false;
    }
    if (!formData.solution_summary.trim()) {
      setValidationError('Solution summary is required.');
      return false;
    }
    if (!formData.github_repo_url.trim()) {
      setValidationError('GitHub Repository URL is required.');
      return false;
    }
    if (!formData.github_repo_url.trim().startsWith('https://github.com/')) {
      setValidationError('GitHub Repository URL must start with https://github.com/');
      return false;
    }
    setValidationError('');
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const data: Record<string, any> = {};
    Object.entries(formData).forEach(([key, value]) => {
      if (value.trim()) {
        data[key] = value.trim();
      }
    });

    try {
      await createSubmission.mutateAsync({ eventId, data });
      setSubmitted(true);
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to submit. Please try again.');
    }
  };

  if (eventLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (eventError) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load event details. Please try again.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-16 w-16 mx-auto text-green-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Project Submitted!</h2>
            <p className="text-muted-foreground mb-6">
              Your project &quot;{formData.app_name}&quot; has been submitted successfully.
            </p>
            <div className="flex justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => router.push(`/startup-studio/events/${eventId}`)}
              >
                Back to Event
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Submit Project</h1>
          {event?.name && (
            <p className="text-sm text-muted-foreground mt-1">
              Event: {event.name}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      {validationError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      {/* App Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Project Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="app-name">App Name *</Label>
            <Input
              id="app-name"
              placeholder="Enter your app name"
              value={formData.app_name}
              onChange={(e) => updateField('app_name', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => updateField('category', value)}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="problem-statement">Problem Statement *</Label>
            <Textarea
              id="problem-statement"
              placeholder="What problem does your app solve?"
              value={formData.problem_statement}
              onChange={(e) => updateField('problem_statement', e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="solution-summary">Solution Summary *</Label>
            <Textarea
              id="solution-summary"
              placeholder="How does your app solve this problem?"
              value={formData.solution_summary}
              onChange={(e) => updateField('solution_summary', e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="elevator-pitch">Elevator Pitch</Label>
            <Textarea
              id="elevator-pitch"
              placeholder="Describe your app in 30 seconds..."
              value={formData.elevator_pitch}
              onChange={(e) => updateField('elevator_pitch', e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Links */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Project Links
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="live-url" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Live URL
            </Label>
            <Input
              id="live-url"
              type="url"
              placeholder="https://your-app.lovable.app"
              value={formData.live_url}
              onChange={(e) => updateField('live_url', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lovable-url" className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Lovable Project URL
            </Label>
            <Input
              id="lovable-url"
              type="url"
              placeholder="https://lovable.dev/projects/..."
              value={formData.lovable_url}
              onChange={(e) => updateField('lovable_url', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="github-repo-url" className="flex items-center gap-2">
              <Github className="h-4 w-4" />
              GitHub Repository URL *
            </Label>
            <Input
              id="github-repo-url"
              type="url"
              placeholder="https://github.com/username/repo"
              value={formData.github_repo_url}
              onChange={(e) => updateField('github_repo_url', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Export your Lovable project to GitHub before submitting. This preserves your work after credits expire.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="demo-video" className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              Demo Video URL (optional)
            </Label>
            <Input
              id="demo-video"
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={formData.demo_video_url}
              onChange={(e) => updateField('demo_video_url', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={createSubmission.isPending}
        >
          {createSubmission.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Submit Project
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
