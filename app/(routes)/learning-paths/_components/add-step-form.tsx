'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import type { LearningPathStepType, CreateLearningPathStepInput } from '@/types/learning-path';
import { STEP_TYPE_LABELS } from '@/types/learning-path';

interface AddStepFormProps {
  pathId: string;
  nextStepNumber: number;
  onAdd: (data: CreateLearningPathStepInput) => void;
  isLoading: boolean;
}

export function AddStepForm({ pathId, nextStepNumber, onAdd, isLoading }: AddStepFormProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stepType, setStepType] = useState<LearningPathStepType>('course');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [competencies, setCompetencies] = useState('');
  const [isRequired, setIsRequired] = useState(true);

  const handleSubmit = () => {
    if (!title.trim()) return;

    const data: CreateLearningPathStepInput = {
      path_id: pathId,
      step_number: nextStepNumber,
      title: title.trim(),
      description: description.trim() || undefined,
      step_type: stepType,
      estimated_hours: estimatedHours ? parseInt(estimatedHours, 10) : undefined,
      target_competencies: competencies
        ? competencies.split(',').map((c) => c.trim()).filter(Boolean)
        : undefined,
      is_required: isRequired,
    };

    onAdd(data);

    // Reset form
    setTitle('');
    setDescription('');
    setStepType('course');
    setEstimatedHours('');
    setCompetencies('');
    setIsRequired(true);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' className='w-full border-dashed'>
          <Plus className='h-4 w-4 mr-2' />
          Add Step
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>Add Step #{nextStepNumber}</DialogTitle>
          <DialogDescription>
            Add a new step to the learning path
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-4'>
          <div className='space-y-2'>
            <Label htmlFor='step-title'>Title *</Label>
            <Input
              id='step-title'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g., Complete Python Fundamentals'
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='step-description'>Description</Label>
            <Textarea
              id='step-description'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='What should the learner do in this step?'
              rows={3}
            />
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <Label>Step Type</Label>
              <Select value={stepType} onValueChange={(v) => setStepType(v as LearningPathStepType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STEP_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='step-hours'>Estimated Hours</Label>
              <Input
                id='step-hours'
                type='number'
                min='1'
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                placeholder='e.g., 40'
              />
            </div>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='step-competencies'>Target Competencies</Label>
            <Input
              id='step-competencies'
              value={competencies}
              onChange={(e) => setCompetencies(e.target.value)}
              placeholder='Comma-separated, e.g., Python, Data Analysis'
            />
            <p className='text-xs text-muted-foreground'>
              Separate multiple competencies with commas
            </p>
          </div>

          <div className='flex items-center gap-2'>
            <Switch
              id='step-required'
              checked={isRequired}
              onCheckedChange={setIsRequired}
            />
            <Label htmlFor='step-required'>Required step</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || isLoading}>
            {isLoading ? 'Adding...' : 'Add Step'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
