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
  Filter,
  Shuffle,
  Layers,
  CheckCircle2,
  AlertTriangle,
  User,
  GraduationCap,
  MapPin,
  Building,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AdmissionErrorBoundary } from "@/components/admission";

// Mock data for assignment rules
const assignmentStats = {
  totalRules: 8,
  activeRules: 6,
  leadsAssignedToday: 45,
  avgAssignmentTime: "2 min",
  unassignedLeads: 12,
};

const assignmentRules = [
  {
    id: 1,
    name: "Program-Based Assignment",
    type: "program",
    description: "Assign leads based on program of interest",
    priority: 1,
    assignees: 5,
    leadsProcessed: 1234,
    status: "active",
  },
  {
    id: 2,
    name: "Round Robin (Default)",
    type: "round_robin",
    description: "Distribute leads equally among available counselors",
    priority: 10,
    assignees: 8,
    leadsProcessed: 567,
    status: "active",
  },
  {
    id: 3,
    name: "Geographic Region",
    type: "location",
    description: "Assign leads based on their location/region",
    priority: 2,
    assignees: 4,
    leadsProcessed: 345,
    status: "active",
  },
  {
    id: 4,
    name: "High Score Leads",
    type: "score",
    description: "Route high-scoring leads to senior counselors",
    priority: 1,
    assignees: 2,
    leadsProcessed: 189,
    status: "active",
  },
  {
    id: 5,
    name: "Source-Based",
    type: "source",
    description: "Assign based on lead source (website, referral, etc.)",
    priority: 3,
    assignees: 6,
    leadsProcessed: 234,
    status: "paused",
  },
  {
    id: 6,
    name: "Workload Balancing",
    type: "workload",
    description: "Assign to counselors with lowest current workload",
    priority: 4,
    assignees: 8,
    leadsProcessed: 456,
    status: "active",
  },
];

const counselors = [
  { id: 1, name: "Priya Menon", specialization: "B.Tech", region: "Tamil Nadu", currentLoad: 45, maxCapacity: 60, status: "available" },
  { id: 2, name: "Ravi Kumar", specialization: "MBA", region: "Karnataka", currentLoad: 38, maxCapacity: 50, status: "available" },
  { id: 3, name: "Meena Iyer", specialization: "BBA", region: "Kerala", currentLoad: 50, maxCapacity: 50, status: "at_capacity" },
  { id: 4, name: "Karthik S", specialization: "B.Tech", region: "Andhra Pradesh", currentLoad: 42, maxCapacity: 55, status: "available" },
  { id: 5, name: "Deepa R", specialization: "All Programs", region: "All Regions", currentLoad: 35, maxCapacity: 60, status: "available" },
  { id: 6, name: "Arun P", specialization: "MBA", region: "Tamil Nadu", currentLoad: 0, maxCapacity: 50, status: "on_leave" },
];

const recentAssignments = [
  { time: "10:45 AM", lead: "Rajesh Kumar", rule: "Program-Based", assignee: "Priya Menon", program: "B.Tech CS" },
  { time: "10:42 AM", lead: "Sneha Reddy", rule: "High Score", assignee: "Ravi Kumar", program: "MBA" },
  { time: "10:38 AM", lead: "Vikram Singh", rule: "Round Robin", assignee: "Karthik S", program: "B.Tech EE" },
  { time: "10:35 AM", lead: "Meera Iyer", rule: "Geographic", assignee: "Deepa R", program: "BBA" },
  { time: "10:30 AM", lead: "Amit Patel", rule: "Workload", assignee: "Priya Menon", program: "B.Tech ME" },
];

function AssignmentRulesPageContent() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedRuleType, setSelectedRuleType] = useState("");
  const [isReassigning, setIsReassigning] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleReassign = async () => {
    setIsReassigning(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast.success("Unassigned leads have been redistributed");
    } catch {
      toast.error("Failed to re-assign leads");
    } finally {
      setIsReassigning(false);
    }
  };

  const handleCreateRule = async () => {
    setIsCreating(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success("Assignment rule created successfully");
      setShowAddDialog(false);
    } catch {
      toast.error("Failed to create rule");
    } finally {
      setIsCreating(false);
    }
  };

  const getRuleTypeIcon = (type: string) => {
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
          <Button variant="outline" className="gap-2" onClick={handleReassign} disabled={isReassigning}>
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
                <p className="text-xl font-bold">{assignmentStats.totalRules}</p>
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
                <p className="text-xl font-bold text-green-600">{assignmentStats.activeRules}</p>
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
                <p className="text-xl font-bold">{assignmentStats.leadsAssignedToday}</p>
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
                <p className="text-xl font-bold">{assignmentStats.avgAssignmentTime}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={assignmentStats.unassignedLeads > 0 ? "border-red-200" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${assignmentStats.unassignedLeads > 0 ? "bg-red-100" : "bg-gray-100"}`}>
                <AlertTriangle className={`h-5 w-5 ${assignmentStats.unassignedLeads > 0 ? "text-red-600" : "text-gray-600"}`} />
              </div>
              <div>
                <p className="text-xs text-gray-600">Unassigned</p>
                <p className={`text-xl font-bold ${assignmentStats.unassignedLeads > 0 ? "text-red-600" : ""}`}>
                  {assignmentStats.unassignedLeads}
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
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="h-4 w-4" />
            Recent Activity
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Priority</TableHead>
                    <TableHead>Rule Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Assignees</TableHead>
                    <TableHead>Leads Processed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignmentRules
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
                            <p className="text-sm text-gray-500">{rule.description}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getRuleTypeIcon(rule.type)}
                            <span className="capitalize">{rule.type.replace("_", " ")}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4 text-gray-400" />
                            {rule.assignees}
                          </div>
                        </TableCell>
                        <TableCell>{rule.leadsProcessed.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={rule.status === "active" ? "default" : "secondary"}>
                            {rule.status === "active" ? (
                              <Play className="h-3 w-3 mr-1" />
                            ) : (
                              <Pause className="h-3 w-3 mr-1" />
                            )}
                            {rule.status}
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
                              title={rule.status === "active" ? "Pause" : "Activate"}
                            >
                              {rule.status === "active" ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-500" title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

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
                <ArrowRight className="h-5 w-5 text-gray-400" />
                {assignmentRules
                  .filter((r) => r.status === "active")
                  .sort((a, b) => a.priority - b.priority)
                  .slice(0, 4)
                  .map((rule, index) => (
                    <div key={rule.id} className="flex items-center gap-4">
                      <div className="p-4 border rounded-lg text-center min-w-[120px]">
                        {getRuleTypeIcon(rule.type)}
                        <p className="text-sm font-medium mt-2">{rule.name}</p>
                        <p className="text-xs text-gray-500">Priority {rule.priority}</p>
                      </div>
                      {index < 3 && <ArrowRight className="h-5 w-5 text-gray-400" />}
                    </div>
                  ))}
                <ArrowRight className="h-5 w-5 text-gray-400" />
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center min-w-[120px]">
                  <CheckCircle2 className="h-6 w-6 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-medium">Assigned</p>
                </div>
              </div>
            </CardContent>
          </Card>
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
                    <TableHead>Actions</TableHead>
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
                          variant={
                            counselor.status === "available"
                              ? "default"
                              : counselor.status === "at_capacity"
                              ? "secondary"
                              : "outline"
                          }
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
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          <Settings className="h-4 w-4 mr-1" />
                          Configure
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Assignments</CardTitle>
              <CardDescription>Last 24 hours of automatic lead assignments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentAssignments.map((assignment, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-gray-500 w-20">{assignment.time}</div>
                      <div>
                        <p className="font-medium">{assignment.lead}</p>
                        <p className="text-sm text-gray-500">{assignment.program}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant="outline">{assignment.rule}</Badge>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                          <User className="h-4 w-4 text-gray-500" />
                        </div>
                        <span className="text-sm font-medium">{assignment.assignee}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
              <Input placeholder="e.g., Senior Counselor Priority" />
            </div>
            <div className="space-y-2">
              <Label>Rule Type</Label>
              <Select value={selectedRuleType} onValueChange={setSelectedRuleType}>
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
              <Input type="number" min={1} max={10} defaultValue={5} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Describe when this rule applies" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable Rule</Label>
              <Switch defaultChecked />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button className="bg-[#0b6d41] hover:bg-[#095232]" onClick={handleCreateRule} disabled={isCreating}>
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
