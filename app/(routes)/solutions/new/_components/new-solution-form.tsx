'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Hammer, BookOpen, Video, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// TODO: Replace with real hooks after service migration
// import { useCreateSolution } from '@/hooks/solutions/use-solutions';
// import { useClients } from '@/hooks/solutions/use-clients';
// import { useDepartments } from '@/hooks/use-departments';

type SolutionType = 'software' | 'training' | 'content';

const typeOptions = [
  {
    value: 'software',
    label: 'Software Development',
    description: 'Custom software, apps, integrations',
    icon: Hammer,
    color: 'text-blue-600',
  },
  {
    value: 'training',
    label: 'Training Program',
    description: 'Workshops, bootcamps, certifications',
    icon: BookOpen,
    color: 'text-green-600',
  },
  {
    value: 'content',
    label: 'Content Production',
    description: 'Videos, graphics, documents',
    icon: Video,
    color: 'text-purple-600',
  },
];

export function NewSolutionForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedType, setSelectedType] = useState<SolutionType | null>(null);

  // Placeholder data
  const clients = [
    { id: '1', name: 'ABC University' },
    { id: '2', name: 'XYZ Corp' },
    { id: '3', name: 'DEF Institute' },
  ];
  const departments = [
    { id: '1', name: 'Computer Science' },
    { id: '2', name: 'Information Technology' },
    { id: '3', name: 'Media Studies' },
  ];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // TODO: Implement with actual mutation
      const formData = new FormData(e.currentTarget);
      console.log('Creating solution:', Object.fromEntries(formData));

      toast.success('Solution created successfully');
      router.push('/solutions/list');
    } catch (error) {
      toast.error('Failed to create solution');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!selectedType) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {typeOptions.map((option) => {
          const Icon = option.icon;
          return (
            <Card
              key={option.value}
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => setSelectedType(option.value as SolutionType)}
            >
              <CardHeader>
                <Icon className={`h-8 w-8 ${option.color} mb-2`} />
                <CardTitle>{option.label}</CardTitle>
                <CardDescription>{option.description}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    );
  }

  const selectedOption = typeOptions.find((o) => o.value === selectedType)!;
  const SelectedIcon = selectedOption.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <SelectedIcon className={`h-6 w-6 ${selectedOption.color}`} />
          <div>
            <CardTitle>{selectedOption.label}</CardTitle>
            <CardDescription>
              <Button
                variant="link"
                className="p-0 h-auto text-sm"
                onClick={() => setSelectedType(null)}
              >
                Change type
              </Button>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <input type="hidden" name="solution_type" value={selectedType} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                name="title"
                placeholder="Enter solution title"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client_id">Client *</Label>
              <Select name="client_id" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lead_department_id">Lead Department *</Label>
              <Select name="lead_department_id" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="base_price">Base Price (INR)</Label>
              <Input
                id="base_price"
                name="base_price"
                type="number"
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date</Label>
              <Input id="start_date" name="start_date" type="date" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="target_date">Target Completion</Label>
              <Input id="target_date" name="target_date" type="date" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="problem_statement">Problem Statement</Label>
            <Textarea
              id="problem_statement"
              name="problem_statement"
              placeholder="Describe the problem this solution addresses..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Detailed description of the solution..."
              rows={4}
            />
          </div>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Solution
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
