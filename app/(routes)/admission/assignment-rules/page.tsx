"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users,
  Plus,
  Edit,
  Trash2,
  Settings,
  RefreshCw,
  ArrowRight,
  Play,
  Pause,
  Activity,
  Target,
  Clock,
  Shuffle,
  Layers,
  CheckCircle2,
  AlertTriangle,
  User,
  GraduationCap,
  MapPin,
  Building,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AdmissionErrorBoundary } from "@/components/admission";
import { useUserInstitutionAccess } from "@/hooks/use-user-institution-access";
import {
  useAssignmentRules,
  useAssignmentStats,
  useAssignmentRuleMutations,
} from "@/hooks/admission";
import { AssignmentRulesService, type AssignmentRuleType } from "@/lib/services/admission/assignment-rules-service";
import { Skeleton } from "@/components/ui/skeleton";

// Mock counselors (would come from admission_counselors table)
const counselors = [
  { id: "1", name: "Priya Menon", specialization: "B.Tech", region: "Tamil Nadu", currentLoad: 45, maxCapacity: 60, status: "available" },
  { id: "2", name: "Ravi Kumar", specialization: "MBA", region: "Karnataka", currentLoad: 38, maxCapacity: 50, status: "available" },
  { id: "3", name: "Meena Iyer", specialization: "BBA", region: "Kerala", currentLoad: 50, maxCapacity: 50, status: "at_capacity" },
  { id: "4", name: "Karthik S", specialization: "B.Tech", region: "Andhra Pradesh", currentLoad: 42, maxCapacity: 55, status: "available" },
  { id: "5", name: "Deepa R", specialization: "All Programs", region: "All Regions", currentLoad: 35, maxCapacity: 60, status: "available" },
];

function AssignmentRulesPageContent() {
  const { selectedInstitutionId, loading: isLoadingAccess } = useUserInstitutionAccess();

  const { rules, isLoading: isLoadingRules, isError, refetch } = useAssignmentRules(selectedInstitutionId);
  const { stats, isLoading: isLoadingStats } = useAssignmentStats(selectedInstitutionId);
  const { createRule, deleteRule, toggleStatus, isCreating, isToggling } = useAssignmentRuleMutations();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<{ id: string; name: string } | null>(null);
  const [selectedRuleType, setSelectedRuleType] = useState<AssignmentRuleType>("round_robin");
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleDescription, setNewRuleDescription] = useState("");
  const [newRulePriority, setNewRulePriority] = useState(5);
  const [newRuleEnabled, setNewRuleEnabled] = useState(true);
  const [isReassigning, setIsReassigning] = useState(false);

  const handleReassign = async () => {
    setIsReassigning(true);
    try {
      // TODO: Implement reassignment logic
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast.success("Unassigned leads have been redistributed");
    } catch {
      toast.error("Failed to re-assign leads");
    } finally {
      setIsReassigning(false);
    }
  };

  const handleCreateRule = async () => {
    if (!selectedInstitutionId) {
      toast.error("Institution not found");
      return;
    }

    if (!newRuleName.trim()) {
      toast.error("Rule name is required");
      return;
    }

    try {
      await createRule.mutateAsync({
        institution_id: selectedInstitutionId,
        name: newRuleName,
        description: newRuleDescription || undefined,
        priority: newRulePriority,
        is_active: newRuleEnabled,
        criteria: AssignmentRulesService.getDefaultCriteria(selectedRuleType),
        action: AssignmentRulesService.getDefaultAction(selectedRuleType),
      });
      setShowAddDialog(false);
      resetForm();
    } catch {
      // Error handled by mutation
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      await toggleStatus.mutateAsync({ id, isActive: !currentStatus });
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteRule = (id: string, name: string) => {
    setRuleToDelete({ id, name });
    setShowDeleteDialog(true);
  };

  const confirmDeleteRule = async () => {
    if (!ruleToDelete || !selectedInstitutionId) return;
    try {
      await deleteRule.mutateAsync({ id: ruleToDelete.id, institutionId: selectedInstitutionId });
    } catch {
      // Error handled by mutation
    } finally {
      setShowDeleteDialog(false);
      setRuleToDelete(null);
    }
  };

  const resetForm = () => {
    setNewRuleName("");
    setNewRuleDescription("");
    setNewRulePriority(5);
    setNewRuleEnabled(true);
    setSelectedRuleType("round_robin");
  };

  const getRuleTypeIcon = (type?: string) => {
    switch (type) {
      case "program":
        return <GraduationCap className="h-4 w-4 text-blue-500" />;
      case "round_robin":
        return <Shuffle className="h-4 w-4 text-purple-500" />;
      case "location":
        return <MapPin className="h-4 w-4 text-green-500" />;
      case "score":
        return <Target className="h-4 w-4 text-red-500" />;
      case "source":
        return <Building className="h-4 w-4 text-orange-500" />;
      case "workload":
        return <Activity className="h-4 w-4 text-yellow-500" />;
      default:
        return <Settings className="h-4 w-4 text-gray-500" />;
    }
  };

  if (isLoadingAccess || isLoadingRules) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto py-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-4 py-6">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <div>
              <h3 className="font-semibold text-red-800">Failed to load assignment rules</h3>
              <p className="text-red-600">There was an error loading the rules configuration.</p>
            </div>
            <Button variant="outline" onClick={() => refetch()} className="ml-auto">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeRules = rules.filter(r => r.is_active);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-8 w-8 text-[#0b6d41]" />
            Lead Assignment Rules
          </h1>
          <p className="text-gray-600 mt-1">
            Configure automatic lead distribution to counselors
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleReassign} disabled={isReassigning || stats.unassignedLeads === 0}>
            {isReassigning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Re-assign Unassigned
          </Button>
          <Button onClick={() => setShowAddDialog(true)} className="gap-2 bg-[#0b6d41] hover:bg-[#095232]">
            <Plus className="h-4 w-4" />
            Add Rule
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Layers className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Total Rules</p>
                <p className="text-xl font-bold">
                  {isLoadingStats ? <Skeleton className="h-6 w-8" /> : stats.totalRules}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Active Rules</p>
                <p className="text-xl font-bold text-green-600">
                  {isLoadingStats ? <Skeleton className="h-6 w-8" /> : stats.activeRules}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Assigned Today</p>
                <p className="text-xl font-bold">
                  {isLoadingStats ? <Skeleton className="h-6 w-8" /> : stats.leadsAssignedToday}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600">Avg Assignment</p>
                <p className="text-xl font-bold">
                  {isLoadingStats ? <Skeleton className="h-6 w-12" /> : stats.avgAssignmentTime}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={stats.unassignedLeads > 0 ? "border-red-200" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stats.unassignedLeads > 0 ? "bg-red-100" : "bg-gray-100"}`}>
                <AlertTriangle className={`h-5 w-5 ${stats.unassignedLeads > 0 ? "text-red-600" : "text-gray-600"}`} />
              </div>
              <div>
                <p className="text-xs text-gray-600">Unassigned</p>
                <p className={`text-xl font-bold ${stats.unassignedLeads > 0 ? "text-red-600" : ""}`}>
                  {isLoadingStats ? <Skeleton className="h-6 w-8" /> : stats.unassignedLeads}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules" className="gap-2">
            <Settings className="h-4 w-4" />
            Assignment Rules
          </TabsTrigger>
          <TabsTrigger value="counselors" className="gap-2">
            <Users className="h-4 w-4" />
            Counselor Capacity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Rules (Processed in Priority Order)</CardTitle>
              <CardDescription>
                Rules are evaluated in priority order. First matching rule assigns the lead.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rules.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No assignment rules configured</p>
                  <p className="text-sm">Click &quot;Add Rule&quot; to create your first rule</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Priority</TableHead>
                      <TableHead>Rule Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules
                      .sort((a, b) => a.priority - b.priority)
                      .map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell>
                            <Badge variant="outline" className="font-mono">
                              #{rule.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{rule.name}</p>
                              {rule.description && (
                                <p className="text-sm text-gray-500">{rule.description}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getRuleTypeIcon(rule.type)}
                              <span className="capitalize">{(rule.type || 'custom').replace("_", " ")}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={rule.is_active ? "default" : "secondary"}>
                              {rule.is_active ? (
                                <Play className="h-3 w-3 mr-1" />
                              ) : (
                                <Pause className="h-3 w-3 mr-1" />
                              )}
                              {rule.is_active ? "active" : "paused"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" title="Edit rule">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title={rule.is_active ? "Pause" : "Activate"}
                                onClick={() => handleToggleStatus(rule.id, rule.is_active)}
                                disabled={isToggling}
                              >
                                {rule.is_active ? (
                                  <Pause className="h-4 w-4" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500"
                                title="Delete"
                                onClick={() => handleDeleteRule(rule.id, rule.name)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {activeRules.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Rule Flow Visualization</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center gap-4 overflow-x-auto py-4">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center min-w-[120px]">
                    <Users className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                    <p className="text-sm font-medium">New Lead</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  {activeRules
                    .sort((a, b) => a.priority - b.priority)
                    .slice(0, 4)
                    .map((rule, index) => (
                      <div key={rule.id} className="flex items-center gap-4">
                        <div className="p-4 border rounded-lg text-center min-w-[120px]">
                          {getRuleTypeIcon(rule.type)}
                          <p className="text-sm font-medium mt-2">{rule.name}</p>
                          <p className="text-xs text-gray-500">Priority {rule.priority}</p>
                        </div>
                        {index < Math.min(activeRules.length - 1, 3) && (
                          <ArrowRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  <ArrowRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center min-w-[120px]">
                    <CheckCircle2 className="h-6 w-6 text-green-500 mx-auto mb-2" />
                    <p className="text-sm font-medium">Assigned</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="counselors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Counselor Capacity & Assignments</CardTitle>
              <CardDescription>
                Manage counselor workload and availability
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Counselor</TableHead>
                    <TableHead>Specialization</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Current Load</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {counselors.map((counselor) => (
                    <TableRow key={counselor.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                            <User className="h-4 w-4 text-gray-500" />
                          </div>
                          <span className="font-medium">{counselor.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{counselor.specialization}</Badge>
                      </TableCell>
                      <TableCell>{counselor.region}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                counselor.currentLoad / counselor.maxCapacity >= 0.9
                                  ? "bg-red-500"
                                  : counselor.currentLoad / counselor.maxCapacity >= 0.7
                                  ? "bg-yellow-500"
                                  : "bg-green-500"
                              }`}
                              style={{ width: `${(counselor.currentLoad / counselor.maxCapacity) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm">{counselor.currentLoad}</span>
                        </div>
                      </TableCell>
                      <TableCell>{counselor.maxCapacity}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            counselor.status === "available"
                              ? "bg-green-100 text-green-800"
                              : counselor.status === "at_capacity"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-800"
                          }
                        >
                          {counselor.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Rule Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Assignment Rule</DialogTitle>
            <DialogDescription>
              Create a new rule for automatic lead assignment
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rule Name</Label>
              <Input
                placeholder="e.g., Senior Counselor Priority"
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Rule Type</Label>
              <Select value={selectedRuleType} onValueChange={(v) => setSelectedRuleType(v as AssignmentRuleType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select rule type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="program">Program-Based</SelectItem>
                  <SelectItem value="location">Geographic Region</SelectItem>
                  <SelectItem value="score">Lead Score</SelectItem>
                  <SelectItem value="source">Lead Source</SelectItem>
                  <SelectItem value="workload">Workload Balancing</SelectItem>
                  <SelectItem value="round_robin">Round Robin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority (1 = highest)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={newRulePriority}
                onChange={(e) => setNewRulePriority(parseInt(e.target.value) || 5)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Describe when this rule applies"
                value={newRuleDescription}
                onChange={(e) => setNewRuleDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable Rule</Label>
              <Switch checked={newRuleEnabled} onCheckedChange={setNewRuleEnabled} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }} disabled={isCreating}>
              Cancel
            </Button>
            <Button className="bg-[#0b6d41] hover:bg-[#095232]" onClick={handleCreateRule} disabled={isCreating}>
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Assignment Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{ruleToDelete?.name}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteRule}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteRule.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AssignmentRulesPage() {
  return (
    <AdmissionErrorBoundary>
      <AssignmentRulesPageContent />
    </AdmissionErrorBoundary>
  );
}
