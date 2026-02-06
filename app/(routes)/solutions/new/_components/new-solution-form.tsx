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
import { Skeleton } from '@/components/ui/skeleton';
import { Hammer, BookOpen, Video, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateSolution } from '@/hooks/solutions/use-solutions';
import { useClients } from '@/hooks/solutions/use-clients';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useAuth } from '@/hooks/use-auth';

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
  const { profile } = useAuth();
  const [selectedType, setSelectedType] = useState<SolutionType | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');

  // Fetch clients from database
  const { data: clientsData, isLoading: clientsLoading, error: clientsError } = useClients({
    is_active: true,
    limit: 100,
  });

  // Fetch departments from database
  const { data: departmentsData, isLoading: departmentsLoading, error: departmentsError } = useDepartments({
    isActive: true,
    limit: 100,
  });

  // Create solution mutation
  const createSolution = useCreateSolution();

  const clients = clientsData?.data || [];
  const departments = departmentsData?.data || [];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedType) {
      toast.error('Please select a solution type');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const basePriceStr = formData.get('base_price') as string;
    const startDate = formData.get('start_date') as string;
    const targetDate = formData.get('target_date') as string;
    const description = formData.get('description') as string;

    if (!title || !selectedClientId || !selectedDepartmentId) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const result = await createSolution.mutateAsync({
        solution_type: selectedType,
        title,
        client_id: selectedClientId,
        lead_department_id: selectedDepartmentId,
        base_price: basePriceStr ? parseFloat(basePriceStr) : undefined,
        start_date: startDate || undefined,
        target_date: targetDate || undefined,
        description: description || undefined,
        created_by: profile?.id || 'system',
      });

      toast.success('Solution created successfully');
      // Result is Solution type from the service
      const solutionId = (result as { id: string })?.id;
      router.push(`/solutions/${solutionId}`);
    } catch (error) {
      console.error('Failed to create solution:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create solution');
    }
  };

  // Type selection screen
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
  const isLoading = clientsLoading || departmentsLoading;
  const hasError = clientsError || departmentsError;

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
        {hasError && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load data. Please refresh the page.</span>
          </div>
        )}

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
              {clientsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  value={selectedClientId}
                  onValueChange={setSelectedClientId}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        No clients found. <a href="/solutions/clients/new" className="text-primary hover:underline">Add a client</a>
                      </div>
                    ) : (
                      clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lead_department_id">Lead Department *</Label>
              {departmentsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  value={selectedDepartmentId}
                  onValueChange={setSelectedDepartmentId}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        No departments found
                      </div>
                    ) : (
                      departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.department_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="base_price">Base Price (INR)</Label>
              <Input
                id="base_price"
                name="base_price"
                type="number"
                placeholder="0"
                min="0"
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
            <Button type="submit" disabled={createSolution.isPending || isLoading}>
              {createSolution.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Solution
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
