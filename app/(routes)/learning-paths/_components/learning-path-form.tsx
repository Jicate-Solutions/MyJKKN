'use client';

// ============================================================================
// Learning Path Form - Shared between Create and Edit
// ============================================================================

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, X } from 'lucide-react';
import type {
  LearningPath,
  CreateLearningPathInput,
  UpdateLearningPathInput,
  LearningPathStatus,
} from '@/types/learning-path';

interface LearningPathFormProps {
  institutionId: string;
  learnerId?: string;
  path?: LearningPath;
  onSubmit: (data: CreateLearningPathInput | UpdateLearningPathInput) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function LearningPathForm({
  institutionId,
  learnerId,
  path,
  onSubmit,
  onCancel,
  isSubmitting,
}: LearningPathFormProps) {
  const isEditing = !!path;

  const [title, setTitle] = useState(path?.title || '');
  const [description, setDescription] = useState(path?.description || '');
  const [targetRole, setTargetRole] = useState(path?.target_role || '');
  const [targetIndustry, setTargetIndustry] = useState(path?.target_industry || '');
  const [targetCompetencies, setTargetCompetencies] = useState(
    path?.target_competencies?.join(', ') || ''
  );
  const [estimatedWeeks, setEstimatedWeeks] = useState(
    path?.estimated_duration_weeks?.toString() || ''
  );
  const [startDate, setStartDate] = useState(path?.start_date || '');
  const [targetCompletionDate, setTargetCompletionDate] = useState(
    path?.target_completion_date || ''
  );
  const [status, setStatus] = useState<LearningPathStatus>(path?.status || 'active');
  const [learnerIdInput, setLearnerIdInput] = useState(path?.learner_id || learnerId || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return;

    const competenciesArray = targetCompetencies
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    if (isEditing) {
      const updateData: UpdateLearningPathInput = {
        title: title.trim(),
        description: description.trim() || undefined,
        target_role: targetRole.trim() || undefined,
        target_industry: targetIndustry.trim() || undefined,
        target_competencies: competenciesArray.length > 0 ? competenciesArray : undefined,
        estimated_duration_weeks: estimatedWeeks ? parseInt(estimatedWeeks, 10) : undefined,
        start_date: startDate || undefined,
        target_completion_date: targetCompletionDate || undefined,
        status,
      };
      await onSubmit(updateData);
    } else {
      const createData: CreateLearningPathInput = {
        institution_id: institutionId,
        learner_id: learnerIdInput.trim(),
        title: title.trim(),
        description: description.trim() || undefined,
        target_role: targetRole.trim() || undefined,
        target_industry: targetIndustry.trim() || undefined,
        target_competencies: competenciesArray.length > 0 ? competenciesArray : undefined,
        estimated_duration_weeks: estimatedWeeks ? parseInt(estimatedWeeks, 10) : undefined,
        start_date: startDate || undefined,
        target_completion_date: targetCompletionDate || undefined,
      };
      await onSubmit(createData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Learner ID - only for create */}
          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="learner_id">
                Learner ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="learner_id"
                value={learnerIdInput}
                onChange={(e) => setLearnerIdInput(e.target.value)}
                placeholder="UUID of the learner"
                required
              />
              <p className="text-xs text-muted-foreground">
                The ID of the learner this path is for
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">
              Path Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Full-Stack Developer Journey"
              required
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the learning path objectives and outcomes..."
              rows={3}
            />
          </div>

          {isEditing && (
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(val) => setStatus(val as LearningPathStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Target & Goals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target_role">Target Role</Label>
              <Input
                id="target_role"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g., Software Engineer"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target_industry">Target Industry</Label>
              <Input
                id="target_industry"
                value={targetIndustry}
                onChange={(e) => setTargetIndustry(e.target.value)}
                placeholder="e.g., Technology, Healthcare"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target_competencies">Target Competencies</Label>
            <Input
              id="target_competencies"
              value={targetCompetencies}
              onChange={(e) => setTargetCompetencies(e.target.value)}
              placeholder="Comma-separated: Python, Problem Solving, Cloud Architecture"
            />
            <p className="text-xs text-muted-foreground">
              Separate competencies with commas
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="estimated_weeks">Estimated Duration (weeks)</Label>
              <Input
                id="estimated_weeks"
                type="number"
                min="1"
                max="260"
                value={estimatedWeeks}
                onChange={(e) => setEstimatedWeeks(e.target.value)}
                placeholder="e.g., 12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target_completion_date">Target Completion</Label>
              <Input
                id="target_completion_date"
                type="date"
                value={targetCompletionDate}
                onChange={(e) => setTargetCompletionDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !title.trim()}>
          {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {isEditing ? 'Update Path' : 'Create Path'}
        </Button>
      </div>
    </form>
  );
}
