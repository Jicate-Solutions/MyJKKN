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
import { Textarea } from '@/components/ui/textarea';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useSendAdminCommunication } from '@/hooks/parent-portal';
import { useAuth } from '@/hooks/use-auth';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  CommunicationType,
  CommunicationPriority,
  CreateCommunicationDto,
} from '@/types/parent-portal';
import {
  COMMUNICATION_TYPE_LABELS,
  PRIORITY_LABELS,
} from '@/types/parent-portal';
// Note: CommunicationPriority and PRIORITY_LABELS kept for the UI form selector
// but priority is NOT sent to the DB (CreateCommunicationDto has no priority field)

export default function NewCommunicationPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const sendMutation = useSendAdminCommunication();

  const [formData, setFormData] = useState({
    subject: '',
    content: '',
    type: 'announcement' as CommunicationType,
    priority: 'normal' as CommunicationPriority,
    parent_id: '',
    learner_id: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.subject.trim() || !formData.content.trim()) {
      return;
    }

    const input: CreateCommunicationDto = {
      institution_id: institutionId,
      subject: formData.subject,
      content: formData.content,
      communication_type: formData.type,
      sent_by: profile?.id || undefined,
      parent_access_id: formData.parent_id || undefined,
      learner_id: formData.learner_id || '',
    };

    try {
      await sendMutation.mutateAsync(input);
      router.push('/parent-portal/communications');
    } catch {
      // Error toast handled by service
    }
  };

  if (permissionsLoading || institutionsLoading) {
    return (
      <ContentLayout title="Send Communication">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Send Communication">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Parent Portal', href: '/parent-portal' },
          { label: 'Communications', href: '/parent-portal/communications' },
          { label: 'New', href: '/parent-portal/communications/new' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/parent-portal/communications">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Send Communication</h1>
            <p className="text-sm text-muted-foreground">
              Send a message or announcement to parents
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 max-w-2xl">
            {/* Message Details */}
            <Card>
              <CardHeader>
                <CardTitle>Message Details</CardTitle>
                <CardDescription>
                  Compose the communication to send to parents
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject *</Label>
                  <Input
                    id="subject"
                    value={formData.subject}
                    onChange={(e) =>
                      setFormData({ ...formData, subject: e.target.value })
                    }
                    placeholder="Enter subject line"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="content">Message *</Label>
                  <Textarea
                    id="content"
                    value={formData.content}
                    onChange={(e) =>
                      setFormData({ ...formData, content: e.target.value })
                    }
                    placeholder="Write your message here..."
                    rows={6}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Communication Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(v) =>
                        setFormData({ ...formData, type: v as CommunicationType })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(COMMUNICATION_TYPE_LABELS).map(
                          ([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(v) =>
                        setFormData({
                          ...formData,
                          priority: v as CommunicationPriority,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recipients */}
            <Card>
              <CardHeader>
                <CardTitle>Recipients (Optional)</CardTitle>
                <CardDescription>
                  Leave blank to broadcast to all parents, or target specific
                  parent/learner
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="parent_id">Specific Parent ID</Label>
                  <Input
                    id="parent_id"
                    value={formData.parent_id}
                    onChange={(e) =>
                      setFormData({ ...formData, parent_id: e.target.value })
                    }
                    placeholder="Parent UUID (optional)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="learner_id">Specific Learner ID</Label>
                  <Input
                    id="learner_id"
                    value={formData.learner_id}
                    onChange={(e) =>
                      setFormData({ ...formData, learner_id: e.target.value })
                    }
                    placeholder="Learner UUID (optional)"
                  />
                  <p className="text-xs text-muted-foreground">
                    If set, the message will be visible to parents linked to this
                    learner
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-4">
              <Button
                type="submit"
                disabled={
                  sendMutation.isPending ||
                  !formData.subject.trim() ||
                  !formData.content.trim()
                }
              >
                {sendMutation.isPending ? (
                  <BeatLoader color="#fff" size={8} />
                ) : (
                  'Send Communication'
                )}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/parent-portal/communications">Cancel</Link>
              </Button>
            </div>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
