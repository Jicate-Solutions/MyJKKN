// app/(routes)/consultant-portal/rewards/page.tsx
// Student/Alumni portal page for viewing and redeeming referral rewards

'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Gift,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Check,
  X,
  Loader2,
  TrendingUp,
  Percent,
  DollarSign,
  CreditCard,
  Tag,
  ShoppingBag,
  AlertTriangle,
  Calendar,
  Copy,
  ExternalLink,
  Sparkles,
  Info,
} from 'lucide-react';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useReferrerRewards,
  useRedeemReward,
  useRewardConfigs,
} from '@/hooks/admission/use-consultants';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import type { ReferralReward, RewardType, RewardStatus, ReferralRewardConfig, EducationConsultant } from '@/types/education-consultants';
import { toast } from 'sonner';
import { useEffect } from 'react';

// Reward type configuration
const rewardTypeConfig: Record<RewardType, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  discount: { label: 'Discount', icon: Percent, color: 'text-blue-500', bgColor: 'bg-blue-50' },
  cashback: { label: 'Cashback', icon: DollarSign, color: 'text-green-500', bgColor: 'bg-green-50' },
  credit: { label: 'Credit', icon: CreditCard, color: 'text-purple-500', bgColor: 'bg-purple-50' },
  voucher: { label: 'Voucher', icon: Tag, color: 'text-orange-500', bgColor: 'bg-orange-50' },
  merchandise: { label: 'Merchandise', icon: ShoppingBag, color: 'text-pink-500', bgColor: 'bg-pink-50' },
};

// Status badge configuration
const statusConfig: Record<RewardStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType; description: string }> = {
  pending: { label: 'Pending', variant: 'secondary', icon: Clock, description: 'Awaiting verification' },
  earned: { label: 'Earned', variant: 'outline', icon: TrendingUp, description: 'Verified, awaiting approval' },
  approved: { label: 'Ready to Redeem', variant: 'default', icon: CheckCircle2, description: 'Approved! Redeem anytime' },
  redeemed: { label: 'Redeemed', variant: 'default', icon: Check, description: 'Successfully redeemed' },
  expired: { label: 'Expired', variant: 'destructive', icon: AlertTriangle, description: 'Reward has expired' },
  cancelled: { label: 'Cancelled', variant: 'destructive', icon: X, description: 'Reward was cancelled' },
};

export default function MyRewardsPage() {
  const router = useRouter();
  const { profile, isLoading: isAuthLoading } = useAuth();
  const { institutions } = useUserInstitutionAccess();
  const institutionId = institutions[0]?.institution_id;

  // State
  const [consultant, setConsultant] = useState<EducationConsultant | null>(null);
  const [isLoadingConsultant, setIsLoadingConsultant] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [selectedStatus, setSelectedStatus] = useState<RewardStatus | 'all'>('all');
  const [viewReward, setViewReward] = useState<ReferralReward | null>(null);
  const [redeemDialog, setRedeemDialog] = useState<ReferralReward | null>(null);

  // Load consultant data
  useEffect(() => {
    async function loadConsultant() {
      if (!profile?.id || !institutionId) {
        setIsLoadingConsultant(false);
        return;
      }

      try {
        const consultants = await ConsultantService.getConsultants({
          institution_id: institutionId,
          limit: 100,
        });

        const myConsultant = consultants.data.find(
          (c) => c.referrer_user_id === profile.id
        );

        setConsultant(myConsultant || null);
      } catch (err) {
        console.error('[consultant-portal/rewards] Failed to load consultant:', err);
      } finally {
        setIsLoadingConsultant(false);
      }
    }

    loadConsultant();
  }, [profile, institutionId]);

  // Queries
  const consultantId = consultant?.id || '';

  // Get active rewards (pending, earned, approved)
  const {
    data: activeRewards,
    isLoading: isLoadingActive,
    refetch: refetchActive,
  } = useReferrerRewards(consultantId, ['pending', 'earned', 'approved']);

  // Get history rewards (redeemed, expired, cancelled)
  const {
    data: historyRewards,
    isLoading: isLoadingHistory,
    refetch: refetchHistory,
  } = useReferrerRewards(consultantId, ['redeemed', 'expired', 'cancelled']);

  // Get available reward configs for info display
  const { data: rewardConfigs } = useRewardConfigs(institutionId || '');

  // Mutations
  const redeemMutation = useRedeemReward();

  // Filter rewards
  const filteredActiveRewards = useMemo(() => {
    if (!activeRewards) return [];
    if (selectedStatus === 'all') return activeRewards;
    return activeRewards.filter(r => r.status === selectedStatus);
  }, [activeRewards, selectedStatus]);

  const filteredHistoryRewards = useMemo(() => {
    if (!historyRewards) return [];
    if (selectedStatus === 'all') return historyRewards;
    return historyRewards.filter(r => r.status === selectedStatus);
  }, [historyRewards, selectedStatus]);

  // Stats
  const stats = useMemo(() => {
    const active = activeRewards || [];
    const history = historyRewards || [];
    const all = [...active, ...history];

    return {
      pending: active.filter(r => r.status === 'pending').length,
      readyToRedeem: active.filter(r => r.status === 'approved').length,
      redeemed: history.filter(r => r.status === 'redeemed').length,
      total: all.length,
      totalValue: history
        .filter(r => r.status === 'redeemed')
        .reduce((sum, r) => sum + (r.config?.reward_value_type === 'percentage' ? 0 : r.reward_value), 0),
    };
  }, [activeRewards, historyRewards]);

  // Handlers
  const handleRedeem = async () => {
    if (!redeemDialog) return;

    try {
      await redeemMutation.mutateAsync({
        id: redeemDialog.id,
        redemptionReference: `REDEEM-${Date.now()}`,
      });
      toast.success('Reward redeemed successfully!');
      setRedeemDialog(null);
      refetchActive();
      refetchHistory();
    } catch (error) {
      console.error('[consultant-portal/rewards] Redeem error:', error);
      toast.error('Failed to redeem reward');
    }
  };

  const copyRewardCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Reward code copied!');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatRewardValue = (reward: ReferralReward) => {
    if (reward.config?.reward_value_type === 'percentage') {
      return `${reward.reward_value}% off`;
    }
    return formatCurrency(reward.reward_value);
  };

  const getExpiryText = (reward: ReferralReward) => {
    if (!reward.expires_at) return 'No expiry';
    const expiryDate = new Date(reward.expires_at);
    if (isPast(expiryDate)) return 'Expired';
    return `Expires ${formatDistanceToNow(expiryDate, { addSuffix: true })}`;
  };

  if (isAuthLoading || isLoadingConsultant) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!consultant) {
    return (
      <div className="text-center py-12">
        <Gift className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h2 className="text-xl font-semibold mb-2">No Referrer Account Found</h2>
        <p className="text-muted-foreground mb-4">
          You need to be registered as a referrer to view rewards.
        </p>
        <Button onClick={() => router.push('/consultant-portal')}>
          Go to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Gift className="h-6 w-6 text-primary" />
            My Rewards
          </h1>
          <p className="text-muted-foreground">
            View and redeem your referral rewards
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">
              awaiting verification
            </p>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ready to Redeem</CardTitle>
            <Sparkles className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.readyToRedeem}</div>
            <p className="text-xs text-muted-foreground">
              approved rewards
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Redeemed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.redeemed}</div>
            <p className="text-xs text-muted-foreground">
              successfully claimed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</div>
            <p className="text-xs text-muted-foreground">
              rewards redeemed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Info Banner - Show available reward tiers */}
      {rewardConfigs && rewardConfigs.length > 0 && (
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Info className="h-4 w-4" />
              Available Reward Tiers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {rewardConfigs.filter(c => c.is_active).map((config) => {
                const typeConfig = rewardTypeConfig[config.reward_type];
                const TypeIcon = typeConfig.icon;
                return (
                  <div key={config.id} className="flex items-center gap-2 text-sm">
                    <div className={`p-1.5 rounded ${typeConfig.bgColor}`}>
                      <TypeIcon className={`h-3.5 w-3.5 ${typeConfig.color}`} />
                    </div>
                    <span className="font-medium">{config.name}:</span>
                    <span className="text-muted-foreground">
                      {config.reward_value_type === 'percentage' ? `${config.reward_value}%` : formatCurrency(config.reward_value)}
                      {' '}for {config.min_referrals}+ referrals
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'active' | 'history')}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <TabsList>
            <TabsTrigger value="active" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Active Rewards ({activeRewards?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <Clock className="h-4 w-4" />
              History ({historyRewards?.length || 0})
            </TabsTrigger>
          </TabsList>

          <Select value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as RewardStatus | 'all')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {activeTab === 'active' ? (
                <>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="earned">Earned</SelectItem>
                  <SelectItem value="approved">Ready to Redeem</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="redeemed">Redeemed</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Active Rewards Tab */}
        <TabsContent value="active" className="mt-6">
          {isLoadingActive ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : filteredActiveRewards.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Gift className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No Active Rewards</h3>
                <p className="text-muted-foreground mb-4">
                  Refer more students to earn exciting rewards!
                </p>
                <Button onClick={() => router.push('/consultant-portal/leads/submit')}>
                  Submit a Lead
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredActiveRewards.map((reward) => {
                const typeConfig = rewardTypeConfig[reward.reward_type];
                const TypeIcon = typeConfig.icon;
                const statusCfg = statusConfig[reward.status];
                const StatusIcon = statusCfg.icon;
                const canRedeem = reward.status === 'approved';
                const expiryText = getExpiryText(reward);

                return (
                  <Card
                    key={reward.id}
                    className={`relative overflow-hidden ${canRedeem ? 'border-green-200 shadow-md' : ''}`}
                  >
                    {canRedeem && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-400 to-green-600" />
                    )}
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className={`p-2.5 rounded-lg ${typeConfig.bgColor}`}>
                          <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
                        </div>
                        <Badge variant={statusCfg.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {statusCfg.label}
                        </Badge>
                      </div>
                      <CardTitle className="text-2xl font-bold">
                        {formatRewardValue(reward)}
                      </CardTitle>
                      <CardDescription>{typeConfig.label} Reward</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Earned</span>
                        <span className="font-medium">{format(new Date(reward.created_at), 'dd MMM')}</span>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Code</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                            {reward.id.slice(0, 8)}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyRewardCode(reward.id.slice(0, 8))}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          <Calendar className="h-3 w-3 inline mr-1" />
                          {expiryText}
                        </span>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setViewReward(reward)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Details
                        </Button>
                        {canRedeem && (
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => setRedeemDialog(reward)}
                          >
                            <Gift className="h-4 w-4 mr-1" />
                            Redeem
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          {isLoadingHistory ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : filteredHistoryRewards.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Clock className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No Reward History</h3>
                <p className="text-muted-foreground">
                  Your redeemed and expired rewards will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y">
                {filteredHistoryRewards.map((reward) => {
                  const typeConfig = rewardTypeConfig[reward.reward_type];
                  const TypeIcon = typeConfig.icon;
                  const statusCfg = statusConfig[reward.status];
                  const StatusIcon = statusCfg.icon;

                  return (
                    <div key={reward.id} className="flex items-center justify-between py-4 first:pt-6 last:pb-6">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${typeConfig.bgColor}`}>
                          <TypeIcon className={`h-4 w-4 ${typeConfig.color}`} />
                        </div>
                        <div>
                          <p className="font-medium">
                            {formatRewardValue(reward)}
                            <span className="text-muted-foreground font-normal ml-2">
                              {typeConfig.label}
                            </span>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {reward.redeemed_at
                              ? `Redeemed ${format(new Date(reward.redeemed_at), 'dd MMM yyyy')}`
                              : `Earned ${format(new Date(reward.created_at), 'dd MMM yyyy')}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant={statusCfg.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {statusCfg.label}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setViewReward(reward)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* View Reward Dialog */}
      <Dialog open={!!viewReward} onOpenChange={() => setViewReward(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reward Details</DialogTitle>
          </DialogHeader>
          {viewReward && (
            <div className="space-y-4">
              <div className="text-center p-6 bg-muted/50 rounded-lg">
                <div className={`inline-flex p-3 rounded-full ${rewardTypeConfig[viewReward.reward_type].bgColor} mb-3`}>
                  {(() => {
                    const TypeIcon = rewardTypeConfig[viewReward.reward_type].icon;
                    return <TypeIcon className={`h-8 w-8 ${rewardTypeConfig[viewReward.reward_type].color}`} />;
                  })()}
                </div>
                <p className="text-3xl font-bold">{formatRewardValue(viewReward)}</p>
                <p className="text-muted-foreground">{rewardTypeConfig[viewReward.reward_type].label} Reward</p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={statusConfig[viewReward.status].variant}>
                    {statusConfig[viewReward.status].label}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-medium">{format(new Date(viewReward.created_at), 'dd MMM yyyy')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Reward Code</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                      {viewReward.id.slice(0, 8)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyRewardCode(viewReward.id.slice(0, 8))}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Earned</span>
                  <span>{format(new Date(viewReward.created_at), 'dd MMM yyyy')}</span>
                </div>
                {viewReward.expires_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expires</span>
                    <span className={isPast(new Date(viewReward.expires_at)) ? 'text-destructive' : ''}>
                      {format(new Date(viewReward.expires_at), 'dd MMM yyyy')}
                    </span>
                  </div>
                )}
                {viewReward.redeemed_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Redeemed</span>
                    <span className="text-green-600">{format(new Date(viewReward.redeemed_at), 'dd MMM yyyy')}</span>
                  </div>
                )}
              </div>

              {viewReward.notes && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">{viewReward.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewReward(null)}>
              Close
            </Button>
            {viewReward?.status === 'approved' && (
              <Button onClick={() => {
                setViewReward(null);
                setRedeemDialog(viewReward);
              }}>
                <Gift className="h-4 w-4 mr-2" />
                Redeem Now
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redeem Reward Dialog */}
      <Dialog open={!!redeemDialog} onOpenChange={() => setRedeemDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-green-500" />
              Redeem Your Reward
            </DialogTitle>
            <DialogDescription>
              Confirm redemption of your reward
            </DialogDescription>
          </DialogHeader>
          {redeemDialog && (
            <div className="space-y-4">
              <div className="text-center p-6 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-3xl font-bold text-green-700">{formatRewardValue(redeemDialog)}</p>
                <p className="text-green-600">{rewardTypeConfig[redeemDialog.reward_type].label}</p>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Earned On</span>
                  <span className="font-medium">{format(new Date(redeemDialog.created_at), 'dd MMM yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reward Code</span>
                  <span className="font-mono">{redeemDialog.id.slice(0, 8)}</span>
                </div>
              </div>

              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  Once redeemed, this action cannot be undone. Make sure you&apos;re ready to use your reward.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedeemDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleRedeem}
              disabled={redeemMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {redeemMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Gift className="mr-2 h-4 w-4" />
              )}
              Confirm Redemption
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
