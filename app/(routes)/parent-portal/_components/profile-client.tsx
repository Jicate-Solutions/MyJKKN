'use client';

import { useRouter } from 'next/navigation';
import {
  Loader2,
  User,
  Mail,
  Phone,
  Shield,
  ArrowLeft,
  GraduationCap,
  CheckCircle,
  Calendar,
  Building2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useParentDashboard } from '@/hooks/parent-portal';
import { ensureArray } from '@/lib/utils/validation';
import { RELATIONSHIP_LABELS } from '@/types/parent-portal';
import type { ParentRelationship } from '@/types/parent-portal';

export function ProfileClient() {
  const router = useRouter();
  const { data: dashboardData, isLoading, error } = useParentDashboard();

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-2 text-sm text-gray-500">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
          <p className="mt-4 text-lg font-medium text-gray-900">
            Failed to load profile
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {error?.message || 'An error occurred'}
          </p>
          <Button
            onClick={() => window.location.reload()}
            className="mt-4"
            variant="outline"
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const parent = dashboardData.parent;
  const learners = ensureArray(dashboardData.learners, []);

  // NULL SAFETY: If parent data is missing, show error
  if (!parent) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
          <p className="mt-4 text-lg font-medium text-gray-900">
            Profile data not found
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Unable to load parent profile information
          </p>
          <Button
            onClick={() => router.push('/parent-portal/dashboard')}
            className="mt-4"
          >
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const initials = parent.name
    .split(' ')
    .filter((n: string) => n.length > 0)
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/parent-portal/dashboard')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
        <p className="mt-1 text-gray-600">
          View your account information and linked learners
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Card - takes 2 columns on large screens */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                {/* Avatar */}
                <Avatar className="h-24 w-24 shrink-0">
                  <AvatarImage src={parent.avatar_url || undefined} alt={parent.name} />
                  <AvatarFallback className="bg-primary/10 text-2xl font-semibold text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>

                {/* Profile Info */}
                <div className="flex-1 text-center sm:text-left">
                  <div className="flex flex-col items-center gap-2 sm:flex-row">
                    <h2 className="text-2xl font-bold text-gray-900">
                      {parent.name}
                    </h2>
                    {parent.is_verified ? (
                      <Badge variant="default" className="gap-1 bg-green-100 text-green-700 hover:bg-green-100">
                        <CheckCircle className="h-3 w-3" />
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Shield className="h-3 w-3" />
                        Unverified
                      </Badge>
                    )}
                  </div>

                  {parent.relationship && (
                    <p className="mt-1 text-sm text-gray-500">
                      {RELATIONSHIP_LABELS[parent.relationship as ParentRelationship] || parent.relationship}
                    </p>
                  )}

                  {/* Contact details */}
                  <div className="mt-4 space-y-2">
                    {parent.email && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span>{parent.email}</span>
                      </div>
                    )}
                    {parent.phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Phone className="h-4 w-4 text-gray-400" />
                        <span>{parent.phone}</span>
                      </div>
                    )}
                    {!parent.email && !parent.phone && (
                      <p className="text-sm text-gray-400 italic">
                        No contact information on file
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Linked Learners */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Linked Learners
              </CardTitle>
            </CardHeader>
            <CardContent>
              {learners.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <GraduationCap className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-4 text-gray-600">No learners linked yet</p>
                  <p className="mt-1 text-sm text-gray-400">
                    Contact the institution to link your children to your account
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {learners.map((learnerData) => {
                    const learner = learnerData.learner;
                    const learnerFullName = `${learner.first_name || ''} ${learner.last_name || ''}`.trim() || 'Learner';
                    const learnerInitials = learnerFullName
                      .split(' ')
                      .filter((n: string) => n.length > 0)
                      .map((n: string) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2);

                    return (
                      <div
                        key={learner.id}
                        className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-gray-50"
                      >
                        <Avatar className="h-12 w-12 shrink-0">
                          <AvatarImage
                            src={learner.photo_url || undefined}
                            alt={learner.name}
                          />
                          <AvatarFallback className="bg-blue-100 text-sm font-medium text-blue-700">
                            {learnerInitials}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {learner.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {learner.enrollment_number}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {learner.program?.name && (
                              <Badge variant="outline" className="text-xs">
                                {learner.program.name}
                              </Badge>
                            )}
                            {learner.section?.name && (
                              <Badge variant="outline" className="text-xs">
                                {learner.section.name}
                              </Badge>
                            )}
                            {learner.semester?.name && (
                              <Badge variant="outline" className="text-xs">
                                {learner.semester.name}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            router.push(`/parent-portal/learner/${learner.id}`)
                          }
                        >
                          View Details
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Account Information - right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-5 w-5" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-xs font-medium text-gray-500">Institution</p>
                  <p className="text-sm text-gray-900">
                    {parent.institution?.name || 'Not available'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-xs font-medium text-gray-500">Account Created</p>
                  <p className="text-sm text-gray-900">
                    {formatDate(parent.created_at)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-xs font-medium text-gray-500">Last Login</p>
                  <p className="text-sm text-gray-900">
                    {formatDateTime(parent.last_login_at)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-xs font-medium text-gray-500">Verification Status</p>
                  <p className="text-sm">
                    {parent.is_verified ? (
                      <span className="text-green-600">Verified</span>
                    ) : (
                      <span className="text-amber-600">Pending Verification</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <GraduationCap className="mt-0.5 h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-xs font-medium text-gray-500">Linked Learners</p>
                  <p className="text-sm text-gray-900">
                    {learners.length} {learners.length === 1 ? 'learner' : 'learners'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Help Card */}
          <Card className="border-blue-200 bg-blue-50/30">
            <CardContent className="p-4">
              <h3 className="font-medium text-blue-900">Need to update your info?</h3>
              <p className="mt-1 text-sm text-blue-700">
                Please contact the institution&apos;s administration office to update
                your profile details.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
