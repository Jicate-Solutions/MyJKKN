"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
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
  Calculator,
  Plus,
  Trash2,
  Edit,
  Save,
  RotateCcw,
  Target,
  Activity,
  Zap,
  Users,
  GraduationCap,
  MessageSquare,
  Mail,
  Phone,
  Globe,
  Star,
  Settings,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AdmissionErrorBoundary } from "@/components/admission";
import { useUserInstitutionAccess } from "@/hooks/use-user-institution-access";
import {
  useActiveScoringRule,
  useScoringRuleMutations,
  useDefaultScoringConfig,
} from "@/hooks/admission";
import type { ScoringRuleConfig, ScoringCriterion } from "@/lib/services/admission/scoring-rules-service";
import { Skeleton } from "@/components/ui/skeleton";

// Sample leads for preview (will be replaced with real data later)
const sampleLeads = [
  { name: "Rajesh Kumar", engagementScore: 78, qualityScore: 85, totalScore: 82, category: "Hot Lead" },
  { name: "Priya Sharma", engagementScore: 65, qualityScore: 72, totalScore: 69, category: "Qualified Lead" },
  { name: "Amit Patel", engagementScore: 45, qualityScore: 58, totalScore: 52, category: "Qualified Lead" },
  { name: "Sneha Reddy", engagementScore: 92, qualityScore: 88, totalScore: 90, category: "Hot Lead" },
  { name: "Vikram Singh", engagementScore: 25, qualityScore: 35, totalScore: 30, category: "Nurture Lead" },
];

function ScoringRulesPageContent() {
  const { selectedInstitutionId, loading: isLoadingAccess } = useUserInstitutionAccess();
  const defaultConfig = useDefaultScoringConfig();

  const { rule, config: activeConfig, isLoading: isLoadingRule, isError, refetch } = useActiveScoringRule(selectedInstitutionId);
  const { createRule, updateRule, isCreating, isUpdating } = useScoringRuleMutations();

  // Local state for editing
  const [editMode, setEditMode] = useState(false);
  const [localConfig, setLocalConfig] = useState<ScoringRuleConfig>(defaultConfig);

  // Initialize local config from active rule or default
  useEffect(() => {
    if (activeConfig) {
      setLocalConfig(activeConfig);
    } else if (!isLoadingRule && !rule) {
      setLocalConfig(defaultConfig);
    }
  }, [activeConfig, isLoadingRule, rule, defaultConfig]);

  const isSaving = isCreating || isUpdating;

  const handleSave = async () => {
    if (!selectedInstitutionId) {
      toast.error("Institution not found");
      return;
    }

    try {
      if (rule) {
        // Update existing rule
        await updateRule.mutateAsync({
          id: rule.id,
          input: { criteria: localConfig },
        });
      } else {
        // Create new rule
        await createRule.mutateAsync({
          institution_id: selectedInstitutionId,
          name: "Default Scoring Rules",
          description: "Auto-generated scoring rules configuration",
          criteria: localConfig,
        });
      }
      setEditMode(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleCancel = () => {
    setEditMode(false);
    if (activeConfig) {
      setLocalConfig(activeConfig);
    } else {
      setLocalConfig(defaultConfig);
    }
    toast.info("Changes discarded");
  };

  const handleEngagementWeightChange = (value: number[]) => {
    setLocalConfig(prev => ({
      ...prev,
      engagementWeight: value[0],
      qualityWeight: 100 - value[0],
    }));
  };

  const handleQualityWeightChange = (value: number[]) => {
    setLocalConfig(prev => ({
      ...prev,
      qualityWeight: value[0],
      engagementWeight: 100 - value[0],
    }));
  };

  const handleEngagementCriterionChange = (id: string, field: keyof ScoringCriterion, value: unknown) => {
    setLocalConfig(prev => ({
      ...prev,
      engagementCriteria: prev.engagementCriteria.map(c =>
        c.id === id ? { ...c, [field]: value } : c
      ),
    }));
  };

  const handleQualityCriterionChange = (id: string, field: keyof ScoringCriterion, value: unknown) => {
    setLocalConfig(prev => ({
      ...prev,
      qualityCriteria: prev.qualityCriteria.map(c =>
        c.id === id ? { ...c, [field]: value } : c
      ),
    }));
  };

  // Calculate total quality weight
  const totalQualityWeight = useMemo(() => {
    return localConfig.qualityCriteria
      .filter(c => c.enabled)
      .reduce((sum, c) => sum + (c.weight || 0), 0);
  }, [localConfig.qualityCriteria]);

  if (isLoadingAccess || isLoadingRule) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-48 w-full" />
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
              <h3 className="font-semibold text-red-800">Failed to load scoring rules</h3>
              <p className="text-red-600">There was an error loading the scoring configuration.</p>
            </div>
            <Button variant="outline" onClick={() => refetch()} className="ml-auto">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Calculator className="h-8 w-8 text-[#0b6d41]" />
            Lead Scoring Configuration
          </h1>
          <p className="text-gray-600 mt-1">
            Configure scoring rules for automatic lead prioritization
          </p>
          {rule && (
            <Badge variant="outline" className="mt-2">
              Last updated: {new Date(rule.updated_at).toLocaleDateString()}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {editMode ? (
            <>
              <Button variant="outline" onClick={handleCancel} className="gap-2" disabled={isSaving}>
                <RotateCcw className="h-4 w-4" />
                Cancel
              </Button>
              <Button className="gap-2 bg-[#0b6d41] hover:bg-[#095232]" onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>
            </>
          ) : (
            <Button onClick={() => setEditMode(true)} className="gap-2 bg-[#0b6d41] hover:bg-[#095232]">
              <Edit className="h-4 w-4" />
              Edit Rules
            </Button>
          )}
        </div>
      </div>

      {/* Score Balance */}
      <Card className="border-l-4 border-l-[#0b6d41]">
        <CardHeader>
          <CardTitle>Score Composition</CardTitle>
          <CardDescription>
            Balance between engagement score and quality score
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-500" />
                  <span className="font-medium">Engagement Score</span>
                </div>
                <span className="text-2xl font-bold text-blue-600">{localConfig.engagementWeight}%</span>
              </div>
              <Slider
                value={[localConfig.engagementWeight]}
                onValueChange={handleEngagementWeightChange}
                max={100}
                step={5}
                disabled={!editMode}
              />
              <p className="text-sm text-gray-600">
                Measures lead&apos;s interaction with your institution
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-green-500" />
                  <span className="font-medium">Quality Score</span>
                </div>
                <span className="text-2xl font-bold text-green-600">{localConfig.qualityWeight}%</span>
              </div>
              <Slider
                value={[localConfig.qualityWeight]}
                onValueChange={handleQualityWeightChange}
                max={100}
                step={5}
                disabled={!editMode}
              />
              <p className="text-sm text-gray-600">
                Measures lead&apos;s academic fit and potential
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs defaultValue="engagement">
        <TabsList>
          <TabsTrigger value="engagement" className="gap-2">
            <Activity className="h-4 w-4" />
            Engagement Scoring
          </TabsTrigger>
          <TabsTrigger value="quality" className="gap-2">
            <Target className="h-4 w-4" />
            Quality Scoring
          </TabsTrigger>
          <TabsTrigger value="ranges" className="gap-2">
            <Zap className="h-4 w-4" />
            Score Ranges
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2">
            <Users className="h-4 w-4" />
            Preview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="engagement" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Engagement Scoring Criteria</CardTitle>
                  <CardDescription>
                    Points awarded for lead interactions
                  </CardDescription>
                </div>
                {editMode && (
                  <Button size="sm" className="gap-2" variant="outline">
                    <Plus className="h-4 w-4" />
                    Add Criteria
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity</TableHead>
                    <TableHead>Points per Action</TableHead>
                    <TableHead>Max Occurrences</TableHead>
                    <TableHead>Max Points</TableHead>
                    <TableHead>Status</TableHead>
                    {editMode && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localConfig.engagementCriteria.map((criteria) => (
                    <TableRow key={criteria.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {criteria.name.includes("Email") ? (
                            <Mail className="h-4 w-4 text-gray-400" />
                          ) : criteria.name.includes("WhatsApp") ? (
                            <MessageSquare className="h-4 w-4 text-green-500" />
                          ) : criteria.name.includes("Call") ? (
                            <Phone className="h-4 w-4 text-blue-500" />
                          ) : criteria.name.includes("Website") ? (
                            <Globe className="h-4 w-4 text-purple-500" />
                          ) : (
                            <Activity className="h-4 w-4 text-gray-400" />
                          )}
                          <span className="font-medium">{criteria.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {editMode ? (
                          <Input
                            type="number"
                            value={criteria.points || 0}
                            onChange={(e) => handleEngagementCriterionChange(criteria.id, 'points', parseInt(e.target.value) || 0)}
                            className="w-20"
                          />
                        ) : (
                          <Badge variant="outline">+{criteria.points}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {editMode ? (
                          <Input
                            type="number"
                            value={criteria.maxOccurrence || 0}
                            onChange={(e) => handleEngagementCriterionChange(criteria.id, 'maxOccurrence', parseInt(e.target.value) || 0)}
                            className="w-20"
                          />
                        ) : (
                          criteria.maxOccurrence
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-[#0b6d41]">
                          {(criteria.points || 0) * (criteria.maxOccurrence || 0)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {editMode ? (
                          <Switch
                            checked={criteria.enabled}
                            onCheckedChange={(checked) => handleEngagementCriterionChange(criteria.id, 'enabled', checked)}
                          />
                        ) : (
                          <Badge variant={criteria.enabled ? "default" : "outline"}>
                            {criteria.enabled ? "Active" : "Disabled"}
                          </Badge>
                        )}
                      </TableCell>
                      {editMode && (
                        <TableCell>
                          <Button variant="ghost" size="icon" className="text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quality" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Quality Scoring Criteria</CardTitle>
                  <CardDescription>
                    Weights for academic and profile attributes
                  </CardDescription>
                </div>
                {editMode && (
                  <Button size="sm" className="gap-2" variant="outline">
                    <Plus className="h-4 w-4" />
                    Add Criteria
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Attribute</TableHead>
                    <TableHead>Weight (%)</TableHead>
                    <TableHead>Status</TableHead>
                    {editMode && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localConfig.qualityCriteria.map((criteria) => (
                    <TableRow key={criteria.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {criteria.name.includes("Academic") ? (
                            <GraduationCap className="h-4 w-4 text-blue-500" />
                          ) : criteria.name.includes("Program") ? (
                            <Target className="h-4 w-4 text-green-500" />
                          ) : (
                            <Star className="h-4 w-4 text-yellow-500" />
                          )}
                          <span className="font-medium">{criteria.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {editMode ? (
                          <div className="flex items-center gap-2 w-32">
                            <Slider
                              value={[criteria.weight || 0]}
                              onValueChange={([value]) => handleQualityCriterionChange(criteria.id, 'weight', value)}
                              max={100}
                              step={5}
                            />
                            <span className="w-10 text-sm">{criteria.weight}%</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#0b6d41]"
                                style={{ width: `${criteria.weight}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">{criteria.weight}%</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {editMode ? (
                          <Switch
                            checked={criteria.enabled}
                            onCheckedChange={(checked) => handleQualityCriterionChange(criteria.id, 'enabled', checked)}
                          />
                        ) : (
                          <Badge variant={criteria.enabled ? "default" : "outline"}>
                            {criteria.enabled ? "Active" : "Disabled"}
                          </Badge>
                        )}
                      </TableCell>
                      {editMode && (
                        <TableCell>
                          <Button variant="ghost" size="icon" className="text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>Total Weight:</strong> {totalQualityWeight}%
                  {totalQualityWeight !== 100 && (
                    <Badge variant="destructive" className="ml-2">Should be 100%</Badge>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ranges" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Score Ranges & Actions</CardTitle>
              <CardDescription>
                Define lead categories based on total score
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {localConfig.scoreRanges.map((range) => (
                  <div
                    key={range.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-4 h-4 rounded-full ${range.color}`} />
                      <div>
                        <p className="font-medium">{range.label}</p>
                        <p className="text-sm text-gray-600">Score: {range.min}-{range.max}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-sm text-gray-600">{range.action}</p>
                      {editMode && (
                        <Button variant="ghost" size="icon">
                          <Settings className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Score Distribution</CardTitle>
              <CardDescription>Current lead distribution by score category</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-32">
                {[
                  { label: "Hot", count: 234, color: "bg-red-500" },
                  { label: "Warm", count: 456, color: "bg-orange-500" },
                  { label: "Qualified", count: 678, color: "bg-yellow-500" },
                  { label: "Nurture", count: 890, color: "bg-blue-500" },
                  { label: "Cold", count: 345, color: "bg-gray-400" },
                ].map((item, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={`w-full ${item.color} rounded-t`}
                      style={{ height: `${(item.count / 890) * 100}%` }}
                    />
                    <p className="text-xs text-gray-600">{item.label}</p>
                    <p className="text-sm font-medium">{item.count}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sample Lead Scores</CardTitle>
              <CardDescription>
                Preview how leads are scored with current rules
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead Name</TableHead>
                    <TableHead>Engagement Score</TableHead>
                    <TableHead>Quality Score</TableHead>
                    <TableHead>Total Score</TableHead>
                    <TableHead>Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sampleLeads.map((lead, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{lead.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500"
                              style={{ width: `${lead.engagementScore}%` }}
                            />
                          </div>
                          <span className="text-sm">{lead.engagementScore}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500"
                              style={{ width: `${lead.qualityScore}%` }}
                            />
                          </div>
                          <span className="text-sm">{lead.qualityScore}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-lg font-bold">{lead.totalScore}</span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            lead.category === "Hot Lead"
                              ? "bg-red-100 text-red-800"
                              : lead.category === "Warm Lead"
                              ? "bg-orange-100 text-orange-800"
                              : lead.category === "Qualified Lead"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-blue-100 text-blue-800"
                          }
                        >
                          {lead.category}
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
    </div>
  );
}

export default function ScoringRulesPage() {
  return (
    <AdmissionErrorBoundary>
      <ScoringRulesPageContent />
    </AdmissionErrorBoundary>
  );
}
