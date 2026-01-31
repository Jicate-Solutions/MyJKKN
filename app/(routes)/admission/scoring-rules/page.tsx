"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
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
  Calculator,
  Plus,
  Trash2,
  Edit,
  Save,
  RotateCcw,
  Target,
  TrendingUp,
  Activity,
  Zap,
  Users,
  GraduationCap,
  Clock,
  MessageSquare,
  Mail,
  Phone,
  Globe,
  Star,
  Settings,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { AdmissionErrorBoundary } from "@/components/admission";

// Mock data for scoring rules
const engagementCriteria = [
  { id: 1, name: "Website Visit", points: 5, maxOccurrence: 10, enabled: true },
  { id: 2, name: "Email Opened", points: 3, maxOccurrence: 20, enabled: true },
  { id: 3, name: "Email Clicked", points: 10, maxOccurrence: 10, enabled: true },
  { id: 4, name: "Form Submitted", points: 25, maxOccurrence: 5, enabled: true },
  { id: 5, name: "WhatsApp Response", points: 15, maxOccurrence: 15, enabled: true },
  { id: 6, name: "Call Answered", points: 20, maxOccurrence: 10, enabled: true },
  { id: 7, name: "Campus Visit", points: 50, maxOccurrence: 3, enabled: true },
  { id: 8, name: "Document Uploaded", points: 30, maxOccurrence: 10, enabled: true },
];

const qualityCriteria = [
  { id: 1, name: "Academic Score (10th)", weight: 15, enabled: true },
  { id: 2, name: "Academic Score (12th)", weight: 20, enabled: true },
  { id: 3, name: "Entrance Exam Score", weight: 25, enabled: true },
  { id: 4, name: "Program Match", weight: 15, enabled: true },
  { id: 5, name: "Location Proximity", weight: 10, enabled: false },
  { id: 6, name: "Financial Capability", weight: 10, enabled: true },
  { id: 7, name: "Application Completeness", weight: 5, enabled: true },
];

const scoreRanges = [
  { range: "90-100", label: "Hot Lead", color: "bg-red-500", action: "Immediate follow-up" },
  { range: "70-89", label: "Warm Lead", color: "bg-orange-500", action: "Priority contact within 24h" },
  { range: "50-69", label: "Qualified Lead", color: "bg-yellow-500", action: "Scheduled follow-up" },
  { range: "30-49", label: "Nurture Lead", color: "bg-blue-500", action: "Email sequence" },
  { range: "0-29", label: "Cold Lead", color: "bg-gray-400", action: "Re-engagement campaign" },
];

const sampleLeads = [
  { name: "Rajesh Kumar", engagementScore: 78, qualityScore: 85, totalScore: 82, category: "Hot Lead" },
  { name: "Priya Sharma", engagementScore: 65, qualityScore: 72, totalScore: 69, category: "Qualified Lead" },
  { name: "Amit Patel", engagementScore: 45, qualityScore: 58, totalScore: 52, category: "Qualified Lead" },
  { name: "Sneha Reddy", engagementScore: 92, qualityScore: 88, totalScore: 90, category: "Hot Lead" },
  { name: "Vikram Singh", engagementScore: 25, qualityScore: 35, totalScore: 30, category: "Nurture Lead" },
];

function ScoringRulesPageContent() {
  const [engagementWeight, setEngagementWeight] = useState([50]);
  const [qualityWeight, setQualityWeight] = useState([50]);
  const [editMode, setEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast.success("Scoring rules saved successfully");
      setEditMode(false);
    } catch {
      toast.error("Failed to save scoring rules");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditMode(false);
    toast.info("Changes discarded");
  };

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
                <span className="text-2xl font-bold text-blue-600">{engagementWeight[0]}%</span>
              </div>
              <Slider
                value={engagementWeight}
                onValueChange={(value) => {
                  setEngagementWeight(value);
                  setQualityWeight([100 - value[0]]);
                }}
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
                <span className="text-2xl font-bold text-green-600">{qualityWeight[0]}%</span>
              </div>
              <Slider
                value={qualityWeight}
                onValueChange={(value) => {
                  setQualityWeight(value);
                  setEngagementWeight([100 - value[0]]);
                }}
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
                  <Button size="sm" className="gap-2">
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
                  {engagementCriteria.map((criteria) => (
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
                          <Input type="number" defaultValue={criteria.points} className="w-20" />
                        ) : (
                          <Badge variant="outline">+{criteria.points}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {editMode ? (
                          <Input type="number" defaultValue={criteria.maxOccurrence} className="w-20" />
                        ) : (
                          criteria.maxOccurrence
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-[#0b6d41]">
                          {criteria.points * criteria.maxOccurrence}
                        </span>
                      </TableCell>
                      <TableCell>
                        {editMode ? (
                          <Switch checked={criteria.enabled} />
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
                  <Button size="sm" className="gap-2">
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
                  {qualityCriteria.map((criteria) => (
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
                            <Slider defaultValue={[criteria.weight]} max={100} step={5} />
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
                          <Switch checked={criteria.enabled} />
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
                  <strong>Total Weight:</strong>{" "}
                  {qualityCriteria.filter((c) => c.enabled).reduce((sum, c) => sum + c.weight, 0)}%
                  {qualityCriteria.filter((c) => c.enabled).reduce((sum, c) => sum + c.weight, 0) !== 100 && (
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
                {scoreRanges.map((range, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-4 h-4 rounded-full ${range.color}`} />
                      <div>
                        <p className="font-medium">{range.label}</p>
                        <p className="text-sm text-gray-600">Score: {range.range}</p>
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
