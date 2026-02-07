'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useCreateParentAccess } from '@/hooks/parent-portal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type {
  AccessRelationship,
  AccessLevel,
  CreateParentAccessDto,
} from '@/types/parent-portal';
import {
  ACCESS_RELATIONSHIP_LABELS,
  ACCESS_LEVEL_LABELS,
} from '@/types/parent-portal';

export default function NewParentAccessPage() {
  const router = useRouter();
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const createMutation = useCreateParentAccess();

  const [formData, setFormData] = useState({
    parent_name: '',
    parent_email: '',
    parent_phone: '',
    learner_id: '',
    relationship: 'parent' as AccessRelationship,
    access_level: 'view' as AccessLevel,
    email_notifications: true,
    sms_notifications: false,
    push_notifications: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.parent_name.trim()) {
      return;
    }

    if (!formData.learner_id.trim()) {
      return;
    }

    const input: CreateParentAccessDto = {
      institution_id: institutionId,
      learner_id: formData.learner_id,
      parent_name: formData.parent_name,
      parent_email: formData.parent_email || undefined,
      parent_phone: formData.parent_phone || undefined,
      relationship: formData.relationship,
      access_level: formData.access_level,
      notification_preferences: {
        email: formData.email_notifications,
        sms: formData.sms_notifications,
        push: formData.push_notifications,
      },
    };

    try {
      await createMutation.mutateAsync(input);
      router.push('/parent-portal/access');
    } catch {
      // Error toast is handled by the service
    }
  };

  if (permissionsLoading || institutionsLoading) {
    return (
      <ContentLayout title="Create Parent Access">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Create Parent Access">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Parent Portal', href: '/parent-portal' },
          { label: 'Access Management', href: '/parent-portal/access' },
          { label: 'New Access', href: '/parent-portal/access/new' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/parent-portal/access">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create Parent Access</h1>
            <p className="text-sm text-muted-foreground">
              Generate an access code for a parent to view learner information
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 max-w-2xl">
            {/* Parent Information */}
            <Card>
              <CardHeader>
                <CardTitle>Parent Information</CardTitle>
                <CardDescription>
                  Enter the parent or guardian details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="parent_name">Parent Name *</Label>
                  <Input
                    id="parent_name"
                    value={formData.parent_name}
                    onChange={(e) =>
                      setFormData({ ...formData, parent_name: e.target.value })
                    }
                    placeholder="Enter parent full name"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="parent_email">Email</Label>
                    <Input
                      id="parent_email"
                      type="email"
                      value={formData.parent_email}
                      onChange={(e) =>
                        setFormData({ ...formData, parent_email: e.target.value })
                      }
                      placeholder="parent@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parent_phone">Phone</Label>
                    <Input
                      id="parent_phone"
                      value={formData.parent_phone}
                      onChange={(e) =>
                        setFormData({ ...formData, parent_phone: e.target.value })
                      }
                      placeholder="+91 9876543210"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="relationship">Relationship</Label>
                  <Select
                    value={formData.relationship}
                    onValueChange={(v) =>
                      setFormData({ ...formData, relationship: v as AccessRelationship })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACCESS_RELATIONSHIP_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Learner & Access */}
            <Card>
              <CardHeader>
                <CardTitle>Learner & Access Level</CardTitle>
                <CardDescription>
                  Link to a learner and set access permissions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="learner_id">Learner ID *</Label>
                  <Input
                    id="learner_id"
                    value={formData.learner_id}
                    onChange={(e) =>
                      setFormData({ ...formData, learner_id: e.target.value })
                    }
                    placeholder="Enter learner UUID"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    The UUID of the learner this parent will have access to view
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="access_level">Access Level</Label>
                  <Select
                    value={formData.access_level}
                    onValueChange={(v) =>
                      setFormData({ ...formData, access_level: v as AccessLevel })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACCESS_LEVEL_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    &quot;View Only&quot; allows read access. &quot;Interactive&quot; allows
                    messaging and feedback.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Notification Preferences */}
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  How should this parent receive notifications?
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Email Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Send updates via email
                    </p>
                  </div>
                  <Switch
                    checked={formData.email_notifications}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, email_notifications: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>SMS Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Send updates via SMS
                    </p>
                  </div>
                  <Switch
                    checked={formData.sms_notifications}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, sms_notifications: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Push Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Send push notifications
                    </p>
                  </div>
                  <Switch
                    checked={formData.push_notifications}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, push_notifications: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-4">
              <Button
                type="submit"
                disabled={createMutation.isPending || !formData.parent_name || !formData.learner_id}
              >
                {createMutation.isPending ? (
                  <BeatLoader color="#fff" size={8} />
                ) : (
                  'Create Access'
                )}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/parent-portal/access">Cancel</Link>
              </Button>
            </div>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
