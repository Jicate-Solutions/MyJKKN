'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, CheckCircle, AlertTriangle, XCircle, Shield, CloudUpload } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface PhoneHealthData {
  phone_number_id: string;
  display_number: string;
  verified_name: string | null;
  quality_rating: string;
  platform_type: string;
  verification_status: string;
  messaging_limit: string;
  is_active: boolean;
}

interface HealthResponse {
  overall_status: string;
  numbers: PhoneHealthData[];
}

// =============================================================================
// API functions
// =============================================================================

async function fetchHealth(institutionId: string): Promise<HealthResponse> {
  const res = await fetch(
    `/api/admission/settings/whatsapp-health?institution_id=${institutionId}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch health data');
  }
  const json = await res.json();
  return json.data || { phone_health: [], summary: { total: 0, all_green: true, any_warnings: false, any_critical: false } };
}

async function registerCloudApi(data: {
  institution_id: string;
  phone_number_id: string;
}): Promise<void> {
  const res = await fetch('/api/admission/settings/whatsapp-health/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to register on Cloud API');
  }
}

async function requestVerification(data: {
  institution_id: string;
  phone_number_id: string;
}): Promise<void> {
  const res = await fetch('/api/admission/settings/whatsapp-health/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to request verification');
  }
}

// =============================================================================
// Quality badge helper
// =============================================================================

function QualityBadge({ rating }: { rating: string }) {
  const config: Record<string, { icon: typeof CheckCircle; className: string; label: string }> = {
    GREEN: { icon: CheckCircle, className: 'bg-green-100 text-green-700 border-green-200', label: 'Green' },
    YELLOW: { icon: AlertTriangle, className: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Yellow' },
    RED: { icon: XCircle, className: 'bg-red-100 text-red-700 border-red-200', label: 'Red' },
  };
  const c = config[rating] || config.GREEN;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${c.className}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}

// =============================================================================
// Overall Health Indicator
// =============================================================================

function OverallHealthBanner({ status }: { status: string }) {
  if (status === 'healthy') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
        <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-green-800">All systems healthy</p>
          <p className="text-sm text-green-700">
            All phone numbers are active and quality ratings are good.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'warning') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <AlertTriangle className="h-6 w-6 text-yellow-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-yellow-800">Attention needed</p>
          <p className="text-sm text-yellow-700">
            Some phone numbers have degraded quality or need verification.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'critical') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
        <XCircle className="h-6 w-6 text-red-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-red-800">Critical issues detected</p>
          <p className="text-sm text-red-700">
            One or more phone numbers have red quality ratings or are inactive. Immediate action needed.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

// =============================================================================
// Messaging Limit Label
// =============================================================================

function messagingLimitLabel(limit: string): string {
  const labels: Record<string, string> = {
    TIER_1K: '1,000/day',
    TIER_10K: '10,000/day',
    TIER_100K: '100,000/day',
    UNLIMITED: 'Unlimited',
  };
  return labels[limit] || limit;
}

// =============================================================================
// Health Tab
// =============================================================================

export function HealthTab({ institutionId }: { institutionId: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['wa-health', institutionId],
    queryFn: () => fetchHealth(institutionId),
    enabled: !!institutionId,
  });

  const registerMutation = useMutation({
    mutationFn: (phoneNumberId: string) =>
      registerCloudApi({ institution_id: institutionId, phone_number_id: phoneNumberId }),
    onSuccess: () => {
      toast.success('Registration request submitted');
      queryClient.invalidateQueries({ queryKey: ['wa-health', institutionId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const verifyMutation = useMutation({
    mutationFn: (phoneNumberId: string) =>
      requestVerification({ institution_id: institutionId, phone_number_id: phoneNumberId }),
    onSuccess: () => {
      toast.success('Verification request submitted');
      queryClient.invalidateQueries({ queryKey: ['wa-health', institutionId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const summary = data?.summary || { all_green: true, any_warnings: false, any_critical: false };
  const overallStatus = summary.any_critical ? 'critical' : summary.any_warnings ? 'warning' : summary.all_green ? 'healthy' : 'unknown';
  const numbers = data?.phone_health || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Account Health</h2>
          <p className="text-muted-foreground mt-1">
            Monitor phone number quality, verification status, and messaging limits
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <OverallHealthBanner status={overallStatus} />

          {numbers.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <p className="text-center text-muted-foreground">
                  No phone numbers found. Add numbers in the Business Numbers tab.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {numbers.map((num) => (
                <Card key={num.phone_number_id}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <p className="text-lg font-semibold">{num.display_number}</p>
                          <QualityBadge rating={num.quality_rating} />
                          {!num.is_active && (
                            <Badge variant="destructive" className="text-xs">Inactive</Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          {num.verified_name && (
                            <span className="flex items-center gap-1">
                              <Shield className="h-3 w-3 text-blue-500" />
                              {num.verified_name}
                            </span>
                          )}
                          <span>
                            Platform:{' '}
                            <Badge variant="outline" className="text-xs ml-1">
                              {num.platform_type === 'CLOUD_API' ? 'Cloud API' : num.platform_type}
                            </Badge>
                          </span>
                          <span>
                            Verified:{' '}
                            <Badge
                              variant="outline"
                              className={`text-xs ml-1 ${
                                num.verification_status === 'verified'
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                              }`}
                            >
                              {num.verification_status === 'verified' ? 'Yes' : 'No'}
                            </Badge>
                          </span>
                          <span>
                            Limit: <strong>{messagingLimitLabel(num.messaging_limit)}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {num.platform_type !== 'CLOUD_API' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => registerMutation.mutate(num.phone_number_id)}
                            disabled={registerMutation.isPending}
                          >
                            {registerMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <CloudUpload className="h-4 w-4 mr-2" />
                            )}
                            Register on Cloud API
                          </Button>
                        )}
                        {num.verification_status !== 'verified' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => verifyMutation.mutate(num.phone_number_id)}
                            disabled={verifyMutation.isPending}
                          >
                            {verifyMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Shield className="h-4 w-4 mr-2" />
                            )}
                            Request Verification
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
