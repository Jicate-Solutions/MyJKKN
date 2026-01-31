// app/(routes)/admission/consultants/rewards/page.tsx
// Admin page for managing referral reward configurations and viewing rewards

'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Gift,
  Settings,
  Clock,
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Eye,
  Check,
  X,
  Loader2,
  TrendingUp,
  Users,
  Percent,
  DollarSign,
  CreditCard,
  Tag,
  ShoppingBag,
  Edit,
  Trash2,
  Power,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useAuth } from '@/hooks/use-auth';
import {
  useRewardConfigs,
  useCreateRewardConfig,
  useUpdateRewardConfig,
  useDeleteRewardConfig,
  useToggleRewardConfigActive,
  useRewards,
  useApproveReward,
  useRejectReward,
  useRewardStats,
} from '@/hooks/admission/use-consultants';
import type {
  ReferralRewardConfig,
  ReferralReward,
  RewardType,
  RewardStatus,
  RewardFilters,
} from '@/types/education-consultants';
import { toast } from 'sonner';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

// Reward type configuration
const rewardTypeConfig: Record<RewardType, { label: string; icon: React.ElementType; color: string }> = {
  discount: { label: 'Discount', icon: Percent, color: 'text-blue-500' },
  cashback: { label: 'Cashback', icon: DollarSign, color: 'text-green-500' },
  credit: { label: 'Credit', icon: CreditCard, color: 'text-purple-500' },
  voucher: { label: 'Voucher', icon: Tag, color: 'text-orange-500' },
  merchandise: { label: 'Merchandise', icon: ShoppingBag, color: 'text-pink-500' },
};

// Status badge configuration
const statusConfig: Record<RewardStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  pending: { label: 'Pending', variant: 'secondary', icon: Clock },
  earned: { label: 'Earned', variant: 'outline', icon: TrendingUp },
  approved: { label: 'Approved', variant: 'default', icon: Check },
  redeemed: { label: 'Redeemed', variant: 'default', icon: CheckCircle2 },
  expired: { label: 'Expired', variant: 'destructive', icon: AlertTriangle },
  cancelled: { label: 'Cancelled', variant: 'destructive', icon: X },
};

// Validation schema for reward config
const rewardConfigSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  reward_type: z.enum(['discount', 'cashback', 'credit', 'voucher', 'merchandise']),
  reward_value: z.number().min(0, 'Value must be positive'),
  reward_value_type: z.enum(['percentage', 'flat']),
  min_referrals: z.number().min(1, 'Minimum 1 referral required'),
  max_referrals: z.number().optional(),
  valid_days: z.number().min(1, 'Minimum 1 day validity'),
  is_active: z.boolean(),
  applicable_to: z.enum(['student', 'alumni', 'both']),
  terms_conditions: z.string().optional(),
});

type RewardConfigFormData = z.infer<typeof rewardConfigSchema>;

export default function RewardsManagementPage() {
  const { profile, isLoading: isAuthLoading } = useAuth();
  const { institutions } = useUserInstitutionAccess();
  const institutionId = institutions[0]?.institution_id;
  const userId = profile?.id;

  // Tab state
  const [activeTab, setActiveTab] = useState<'configs' | 'rewards'>('configs');

  // Config filters
  const [configSearchTerm, setConfigSearchTerm] = useState('');

  // Reward filters
  const [rewardSearchTerm, setRewardSearchTerm] = useState('');
  const [selectedRewardStatus, setSelectedRewardStatus] = useState<RewardStatus | 'all'>('all');
  const [selectedRewardType, setSelectedRewardType] = useState<RewardType | 'all'>('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Dialogs
  const [configDialog, setConfigDialog] = useState<{ mode: 'create' | 'edit'; config?: ReferralRewardConfig } | null>(null);
  const [viewReward, setViewReward] = useState<ReferralReward | null>(null);
  const [approveDialog, setApproveDialog] = useState<ReferralReward | null>(null);
  const [approveNotes, setApproveNotes] = useState('');
  const [rejectDialog, setRejectDialog] = useState<ReferralReward | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteConfigDialog, setDeleteConfigDialog] = useState<ReferralRewardConfig | null>(null);

  // Form
  const form = useForm<RewardConfigFormData>({
    resolver: zodResolver(rewardConfigSchema),
    defaultValues: {
      name: '',
      description: '',
      reward_type: 'discount',
      reward_value: 0,
      reward_value_type: 'percentage',
      min_referrals: 1,
      max_referrals: undefined,
      valid_days: 30,
      is_active: true,
      applicable_to: 'both',
      terms_conditions: '',
    },
  });

  // Build reward filters
  const rewardFilters: RewardFilters = useMemo(() => ({
    institution_id: institutionId || undefined,
    status: selectedRewardStatus !== 'all' ? selectedRewardStatus : undefined,
    reward_type: selectedRewardType !== 'all' ? selectedRewardType : undefined,
    page,
    limit,
  }), [institutionId, selectedRewardStatus, selectedRewardType, page, limit]);

  // Queries
  const {
    data: rewardConfigs,
    isLoading: isLoadingConfigs,
    refetch: refetchConfigs,
  } = useRewardConfigs(institutionId || '');

  const {
    data: rewardsData,
    isLoading: isLoadingRewards,
    refetch: refetchRewards,
  } = useRewards(rewardFilters);

  const { data: rewardStats, isLoading: isLoadingStats } = useRewardStats(institutionId || '');

  // Mutations
  const createConfigMutation = useCreateRewardConfig();
  const updateConfigMutation = useUpdateRewardConfig();
  const deleteConfigMutation = useDeleteRewardConfig();
  const toggleConfigMutation = useToggleRewardConfigActive();
  const approveMutation = useApproveReward();
  const rejectMutation = useRejectReward();

  // Filter configs by search
  const filteredConfigs = useMemo(() => {
    if (!rewardConfigs) return [];
    if (!configSearchTerm.trim()) return rewardConfigs;

    const term = configSearchTerm.toLowerCase();
    return rewardConfigs.filter((c) =>
      c.name.toLowerCase().includes(term) ||
      c.description?.toLowerCase().includes(term)
    );
  }, [rewardConfigs, configSearchTerm]);

  // Filter rewards by search
  const filteredRewards = useMemo(() => {
    if (!rewardsData?.data) return [];
    if (!rewardSearchTerm.trim()) return rewardsData.data;

    const term = rewardSearchTerm.toLowerCase();
    return rewardsData.data.filter((r) =>
      r.id?.toLowerCase().includes(term) ||
      r.reward_description?.toLowerCase().includes(term) ||
      r.referrer?.name?.toLowerCase().includes(term)
    );
  }, [rewardsData?.data, rewardSearchTerm]);

  // Handlers
  const handleCreateConfig = () => {
    form.reset({
      name: '',
      description: '',
      reward_type: 'discount',
      reward_value: 0,
      reward_value_type: 'percentage',
      min_referrals: 1,
      max_referrals: undefined,
      valid_days: 30,
      is_active: true,
      applicable_to: 'both',
      terms_conditions: '',
    });
    setConfigDialog({ mode: 'create' });
  };

  const handleEditConfig = (config: ReferralRewardConfig) => {
    form.reset({
      name: config.name,
      description: config.description || '',
      reward_type: config.reward_type,
      reward_value: config.reward_value,
      reward_value_type: config.reward_value_type,
      min_referrals: config.min_referrals,
      max_referrals: config.max_rewards_per_referrer || undefined,
      valid_days: config.valid_to ? Math.ceil((new Date(config.valid_to).getTime() - new Date(config.valid_from).getTime()) / (1000 * 60 * 60 * 24)) : 30,
      is_active: config.is_active,
      applicable_to: 'both',
      terms_conditions: '',
    });
    setConfigDialog({ mode: 'edit', config });
  };

  const handleSubmitConfig = async (data: RewardConfigFormData) => {
    if (!institutionId || !userId) return;

    // Map applicable_to to referrer_types (valid ConsultantType values)
    const referrerTypes: ('student' | 'alumni')[] =
      data.applicable_to === 'both'
        ? ['student', 'alumni']
        : data.applicable_to === 'student'
          ? ['student']
          : ['alumni'];

    try {
      if (configDialog?.mode === 'create') {
        await createConfigMutation.mutateAsync({
          data: {
            institution_id: institutionId,
            name: data.name,
            description: data.description || null,
            reward_type: data.reward_type,
            reward_value: data.reward_value,
            reward_value_type: data.reward_value_type,
            min_referrals: data.min_referrals,
            max_rewards_per_referrer: data.max_referrals || null,
            referrer_types: referrerTypes,
            trigger_stage: 'enrollment_completed',
            valid_from: new Date().toISOString().split('T')[0],
            valid_to: data.valid_days
              ? new Date(Date.now() + data.valid_days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
              : null,
          },
          createdBy: userId,
        });
        toast.success('Reward configuration created');
      } else if (configDialog?.config) {
        await updateConfigMutation.mutateAsync({
          id: configDialog.config.id,
          data: {
            name: data.name,
            description: data.description || null,
            reward_type: data.reward_type,
            reward_value: data.reward_value,
            reward_value_type: data.reward_value_type,
            referrer_types: referrerTypes,
            min_referrals: data.min_referrals,
            max_rewards_per_referrer: data.max_referrals || null,
            is_active: data.is_active,
          },
        });
        toast.success('Reward configuration updated');
      }
      setConfigDialog(null);
    } catch (error) {
      console.error('[admission/consultants/rewards] Config save error:', error);
      toast.error('Failed to save reward configuration');
    }
  };

  const handleDeleteConfig = async () => {
    if (!deleteConfigDialog) return;

    try {
      await deleteConfigMutation.mutateAsync(deleteConfigDialog.id);
      toast.success('Reward configuration deleted');
      setDeleteConfigDialog(null);
    } catch (error) {
      console.error('[admission/consultants/rewards] Config delete error:', error);
      toast.error('Failed to delete reward configuration');
    }
  };

  const handleToggleConfig = async (config: ReferralRewardConfig) => {
    try {
      await toggleConfigMutation.mutateAsync({
        id: config.id,
        isActive: !config.is_active,
      });
      toast.success(`Reward ${config.is_active ? 'deactivated' : 'activated'}`);
    } catch (error) {
      console.error('[admission/consultants/rewards] Toggle error:', error);
      toast.error('Failed to toggle reward status');
    }
  };

  const handleApproveReward = async () => {
    if (!approveDialog || !userId) return;

    try {
      await approveMutation.mutateAsync({
        id: approveDialog.id,
        approvedBy: userId,
        notes: approveNotes || undefined,
      });
      toast.success('Reward approved');
      setApproveDialog(null);
      setApproveNotes('');
    } catch (error) {
      console.error('[admission/consultants/rewards] Approve error:', error);
      toast.error('Failed to approve reward');
    }
  };

  const handleRejectReward = async () => {
    if (!rejectDialog || !userId || !rejectReason.trim()) return;

    try {
      await rejectMutation.mutateAsync({
        id: rejectDialog.id,
        rejectedBy: userId,
        reason: rejectReason,
      });
      toast.success('Reward rejected');
      setRejectDialog(null);
      setRejectReason('');
    } catch (error) {
      console.error('[admission/consultants/rewards] Reject error:', error);
      toast.error('Failed to reject reward');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatRewardValue = (config: ReferralRewardConfig) => {
    if (config.reward_value_type === 'percentage') {
      return `${config.reward_value}%`;
    }
    return formatCurrency(config.reward_value);
  };

  if (isAuthLoading) {
    return (
      <ContentLayout title="Referral Rewards">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Referral Rewards">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Referral Rewards</h1>
            <p className="text-muted-foreground">
              Configure and manage student/alumni referral reward programs
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { refetchConfigs(); refetchRewards(); }}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" onClick={handleCreateConfig}>
              <Plus className="mr-2 h-4 w-4" />
              New Reward Config
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Configs</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rewardConfigs?.filter(c => c.is_active).length || 0}</div>
              <p className="text-xs text-muted-foreground">
                of {rewardConfigs?.length || 0} total configurations
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{rewardStats?.pendingRewards || 0}</div>
              <p className="text-xs text-muted-foreground">
                rewards awaiting review
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{rewardStats?.approvedRewards || 0}</div>
              <p className="text-xs text-muted-foreground">
                ready for redemption
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Redeemed</CardTitle>
              <Gift className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{rewardStats?.redeemedRewards || 0}</div>
              <p className="text-xs text-muted-foreground">
                total value: {formatCurrency(rewardStats?.totalValueRedeemed || 0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'configs' | 'rewards')}>
          <TabsList>
            <TabsTrigger value="configs" className="gap-2">
              <Settings className="h-4 w-4" />
              Reward Configurations
            </TabsTrigger>
            <TabsTrigger value="rewards" className="gap-2">
              <Gift className="h-4 w-4" />
              Rewards ({rewardsData?.total || 0})
            </TabsTrigger>
          </TabsList>

          {/* Configurations Tab */}
          <TabsContent value="configs" className="space-y-4">
            {/* Config Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search configurations..."
                    value={configSearchTerm}
                    onChange={(e) => setConfigSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Configs Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Reward Configurations
                </CardTitle>
                <CardDescription>
                  Define reward tiers and types for student/alumni referrals
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingConfigs ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : filteredConfigs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Gift className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No reward configurations found</p>
                    <p className="text-sm">Create your first reward configuration to get started</p>
                    <Button className="mt-4" onClick={handleCreateConfig}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Configuration
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead>Referrals Required</TableHead>
                          <TableHead>Applicable To</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredConfigs.map((config) => {
                          const typeConfig = rewardTypeConfig[config.reward_type];
                          const TypeIcon = typeConfig.icon;
                          return (
                            <TableRow key={config.id}>
                              <TableCell>
                                <div className="font-medium">{config.name}</div>
                                {config.description && (
                                  <div className="text-xs text-muted-foreground line-clamp-1">
                                    {config.description}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <TypeIcon className={`h-4 w-4 ${typeConfig.color}`} />
                                  <span>{typeConfig.label}</span>
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">
                                {formatRewardValue(config)}
                              </TableCell>
                              <TableCell>
                                {config.min_referrals}
                                {config.max_rewards_per_referrer ? ` - ${config.max_rewards_per_referrer}` : '+'}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="capitalize">
                                  {config.referrer_types?.join(', ') || 'All'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={config.is_active ? 'default' : 'secondary'}>
                                  {config.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleEditConfig(config)}>
                                      <Edit className="mr-2 h-4 w-4" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleToggleConfig(config)}>
                                      <Power className="mr-2 h-4 w-4" />
                                      {config.is_active ? 'Deactivate' : 'Activate'}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setDeleteConfigDialog(config)}
                                      className="text-destructive"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Rewards Tab */}
          <TabsContent value="rewards" className="space-y-4">
            {/* Reward Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search rewards..."
                      value={rewardSearchTerm}
                      onChange={(e) => setRewardSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  <Select value={selectedRewardStatus} onValueChange={(v) => setSelectedRewardStatus(v as RewardStatus | 'all')}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="earned">Earned</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="redeemed">Redeemed</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={selectedRewardType} onValueChange={(v) => setSelectedRewardType(v as RewardType | 'all')}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="discount">Discount</SelectItem>
                      <SelectItem value="cashback">Cashback</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                      <SelectItem value="voucher">Voucher</SelectItem>
                      <SelectItem value="merchandise">Merchandise</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="ghost"
                    onClick={() => {
                      setRewardSearchTerm('');
                      setSelectedRewardStatus('all');
                      setSelectedRewardType('all');
                      setPage(1);
                    }}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Rewards Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  Referral Rewards
                </CardTitle>
                <CardDescription>
                  View and manage student/alumni referral rewards
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingRewards ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : filteredRewards.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Gift className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No rewards found</p>
                    <p className="text-sm">Rewards will appear when referrers earn them</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Code</TableHead>
                            <TableHead>Referrer</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Expires</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredRewards.map((reward) => {
                            const typeConfig = rewardTypeConfig[reward.reward_type];
                            const TypeIcon = typeConfig.icon;
                            const statusCfg = statusConfig[reward.status];
                            const StatusIcon = statusCfg.icon;
                            return (
                              <TableRow key={reward.id}>
                                <TableCell className="font-mono text-sm">
                                  {reward.id.slice(0, 8)}
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium">
                                    {reward.referrer?.name || 'Unknown'}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {format(new Date(reward.created_at), 'dd MMM yyyy')}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <TypeIcon className={`h-4 w-4 ${typeConfig.color}`} />
                                    <span>{typeConfig.label}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="font-medium">
                                  {reward.config?.reward_value_type === 'percentage' ? `${reward.reward_value}%` : formatCurrency(reward.reward_value)}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={statusCfg.variant} className="gap-1">
                                    <StatusIcon className="h-3 w-3" />
                                    {statusCfg.label}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {reward.expires_at
                                    ? format(new Date(reward.expires_at), 'dd MMM yyyy')
                                    : 'No expiry'}
                                </TableCell>
                                <TableCell className="text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => setViewReward(reward)}>
                                        <Eye className="mr-2 h-4 w-4" />
                                        View Details
                                      </DropdownMenuItem>

                                      {(reward.status === 'pending' || reward.status === 'earned') && (
                                        <>
                                          <DropdownMenuItem onClick={() => setApproveDialog(reward)}>
                                            <Check className="mr-2 h-4 w-4 text-green-500" />
                                            Approve
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => setRejectDialog(reward)}
                                            className="text-destructive"
                                          >
                                            <X className="mr-2 h-4 w-4" />
                                            Reject
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {rewardsData && rewardsData.total > limit && (
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground">
                          Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, rewardsData.total)} of {rewardsData.total} rewards
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((p) => p + 1)}
                            disabled={page * limit >= rewardsData.total}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Config Create/Edit Dialog */}
      <Dialog open={!!configDialog} onOpenChange={() => setConfigDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {configDialog?.mode === 'create' ? 'Create' : 'Edit'} Reward Configuration
            </DialogTitle>
            <DialogDescription>
              Define reward tiers for student and alumni referrals
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmitConfig)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Bronze Referrer" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reward_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reward Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="discount">Discount</SelectItem>
                          <SelectItem value="cashback">Cashback</SelectItem>
                          <SelectItem value="credit">Credit</SelectItem>
                          <SelectItem value="voucher">Voucher</SelectItem>
                          <SelectItem value="merchandise">Merchandise</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reward_value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Value</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Enter value"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reward_value_type"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Percentage Based</FormLabel>
                        <FormDescription className="text-xs">
                          Is the value a percentage?
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value === 'percentage'}
                          onCheckedChange={(checked) => field.onChange(checked ? 'percentage' : 'flat')}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="min_referrals"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Min Referrals</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Minimum referrals to earn this reward
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="max_referrals"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Referrals (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="No limit"
                          {...field}
                          value={field.value || ''}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Leave empty for unlimited
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="valid_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Validity (Days)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Days until reward expires
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="applicable_to"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Applicable To</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="both">Students & Alumni</SelectItem>
                          <SelectItem value="student">Students Only</SelectItem>
                          <SelectItem value="alumni">Alumni Only</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the reward..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="terms_conditions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Terms & Conditions</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter terms and conditions..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <FormDescription className="text-xs">
                        Allow new rewards to be issued
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConfigDialog(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createConfigMutation.isPending || updateConfigMutation.isPending}
                >
                  {(createConfigMutation.isPending || updateConfigMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {configDialog?.mode === 'create' ? 'Create' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* View Reward Dialog */}
      <Dialog open={!!viewReward} onOpenChange={() => setViewReward(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reward Details</DialogTitle>
            <DialogDescription>
              Reward #{viewReward?.id.slice(0, 8)}
            </DialogDescription>
          </DialogHeader>
          {viewReward && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Referrer</Label>
                  <p className="font-medium">{viewReward.referrer?.name || 'Unknown'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Type</Label>
                  <p className="font-medium capitalize">{viewReward.reward_type}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Value</Label>
                  <p className="font-medium">
                    {viewReward.config?.reward_value_type === 'percentage' ? `${viewReward.reward_value}%` : formatCurrency(viewReward.reward_value)}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Expires</Label>
                  <p className="font-medium">
                    {viewReward.expires_at ? format(new Date(viewReward.expires_at), 'dd MMM yyyy') : 'No expiry'}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge variant={statusConfig[viewReward.status].variant}>
                      {statusConfig[viewReward.status].label}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Created At</Label>
                  <p className="font-medium">{format(new Date(viewReward.created_at), 'PPpp')}</p>
                </div>
                {viewReward.expires_at && (
                  <div>
                    <Label className="text-muted-foreground">Expires At</Label>
                    <p className="font-medium">{format(new Date(viewReward.expires_at), 'PPpp')}</p>
                  </div>
                )}
                {viewReward.redeemed_at && (
                  <div>
                    <Label className="text-muted-foreground">Redeemed At</Label>
                    <p className="font-medium">{format(new Date(viewReward.redeemed_at), 'PPpp')}</p>
                  </div>
                )}
              </div>
              {viewReward.notes && (
                <div>
                  <Label className="text-muted-foreground">Notes</Label>
                  <p className="text-sm mt-1">{viewReward.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewReward(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Reward Dialog */}
      <Dialog open={!!approveDialog} onOpenChange={() => setApproveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Reward</DialogTitle>
            <DialogDescription>
              Approve this reward for redemption
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">Referrer:</span>
                <span className="font-medium">{approveDialog?.referrer?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Value:</span>
                <span className="font-medium">
                  {approveDialog?.config?.reward_value_type === 'percentage'
                    ? `${approveDialog?.reward_value}%`
                    : formatCurrency(approveDialog?.reward_value || 0)}
                </span>
              </div>
            </div>
            <div>
              <Label htmlFor="approveNotes">Notes (Optional)</Label>
              <Textarea
                id="approveNotes"
                placeholder="Enter approval notes..."
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleApproveReward}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Reward Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Reject Reward</DialogTitle>
            <DialogDescription>
              Reject this reward and provide a reason
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">Referrer:</span>
                <span className="font-medium">{rejectDialog?.referrer?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Value:</span>
                <span className="font-medium">
                  {rejectDialog?.config?.reward_value_type === 'percentage'
                    ? `${rejectDialog?.reward_value}%`
                    : formatCurrency(rejectDialog?.reward_value || 0)}
                </span>
              </div>
            </div>
            <div>
              <Label htmlFor="rejectReason">Reason (Required)</Label>
              <Textarea
                id="rejectReason"
                placeholder="Enter rejection reason..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleRejectReward}
              disabled={rejectMutation.isPending || !rejectReason.trim()}
              variant="destructive"
            >
              {rejectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Config Dialog */}
      <Dialog open={!!deleteConfigDialog} onOpenChange={() => setDeleteConfigDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Configuration</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this reward configuration? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="font-medium">{deleteConfigDialog?.name}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {deleteConfigDialog?.description || 'No description'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfigDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleDeleteConfig}
              disabled={deleteConfigMutation.isPending}
              variant="destructive"
            >
              {deleteConfigMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
