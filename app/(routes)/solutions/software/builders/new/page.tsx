'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useState } from 'react';
import {
  Save,
  ArrowLeft,
  User,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useCreateBuilder } from '@/hooks/solutions/use-builders';

export default function NewBuilderPage() {
  const router = useRouter();
  const createBuilder = useCreateBuilder();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    department_id: '',
    trained_date: new Date().toISOString().split('T')[0],
  });

  const [successMessage, setSuccessMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) return;

    try {
      await createBuilder.mutateAsync({
        name: formData.name.trim(),
        email: formData.email.trim() || undefined,
        department_id: formData.department_id.trim() || undefined,
        trained_date: formData.trained_date || undefined,
      });

      setSuccessMessage('Builder added successfully!');
      setTimeout(() => {
        router.push('/solutions/software/builders');
      }, 1000);
    } catch {
      // Error is handled by the mutation state
    }
  };

  return (
    <ContentLayout title="Add Builder">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Software', href: '/solutions/software' },
          { label: 'Builders', href: '/solutions/software/builders' },
          { label: 'New Builder' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Add New Builder</h1>
            <p className="text-sm text-muted-foreground">
              Add a developer/builder to the software solutions team
            </p>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        {/* Error Message */}
        {createBuilder.isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to create builder: {createBuilder.error?.message || 'Unknown error'}
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Builder Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  placeholder="Enter full name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="trained_date">Trained Date</Label>
                <Input
                  id="trained_date"
                  type="date"
                  value={formData.trained_date}
                  onChange={handleChange}
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4 mt-6 max-w-2xl">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={createBuilder.isPending || !formData.name.trim()}>
              <Save className="mr-2 h-4 w-4" />
              {createBuilder.isPending ? 'Adding...' : 'Add Builder'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
