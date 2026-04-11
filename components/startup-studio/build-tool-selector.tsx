'use client';

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  BUILD_TOOL_OPTIONS,
  MATLAB_TOOLBOXES,
  type BuildTool,
} from '@/lib/constants/startup-studio/matlab-toolbox-map';
import type { SSBuild } from '@/types/startup-studio';

interface BuildToolSelectorProps {
  buildData: Partial<SSBuild> | null;
  onSave: (data: Record<string, any>) => Promise<void>;
  isSaving?: boolean;
  readOnly?: boolean;
}

export function BuildToolSelector({
  buildData,
  onSave,
  isSaving = false,
  readOnly = false,
}: BuildToolSelectorProps) {
  const [buildTool, setBuildTool] = useState<BuildTool | ''>(
    buildData?.build_tool || ''
  );
  const [lovableUrl, setLovableUrl] = useState(buildData?.lovable_project_url || '');
  const [deployedUrl, setDeployedUrl] = useState(buildData?.deployed_url || '');
  const [githubRepoUrl, setGithubRepoUrl] = useState(buildData?.github_repo_url || '');
  const [toolName, setToolName] = useState(buildData?.tool_name || '');
  const [notes, setNotes] = useState(buildData?.notes || '');
  const [matlabToolboxes, setMatlabToolboxes] = useState<string[]>(
    buildData?.matlab_toolboxes_used || []
  );

  useEffect(() => {
    if (buildData) {
      setBuildTool(buildData.build_tool || '');
      setLovableUrl(buildData.lovable_project_url || '');
      setDeployedUrl(buildData.deployed_url || '');
      setGithubRepoUrl(buildData.github_repo_url || '');
      setToolName(buildData.tool_name || '');
      setNotes(buildData.notes || '');
      setMatlabToolboxes(buildData.matlab_toolboxes_used || []);
    }
  }, [buildData]);

  const handleToolboxToggle = (toolbox: string) => {
    setMatlabToolboxes((prev) =>
      prev.includes(toolbox)
        ? prev.filter((t) => t !== toolbox)
        : [...prev, toolbox]
    );
  };

  const handleSave = async () => {
    const data: Record<string, any> = {
      build_tool: buildTool || null,
      deployed_url: deployedUrl || null,
      notes: notes || null,
    };

    if (buildTool === 'lovable') {
      data.lovable_project_url = lovableUrl || null;
    } else if (buildTool === 'matlab') {
      data.matlab_toolboxes_used = matlabToolboxes.length > 0 ? matlabToolboxes : null;
    } else if (buildTool === 'code') {
      data.github_repo_url = githubRepoUrl || null;
    } else if (buildTool === 'other') {
      data.tool_name = toolName || null;
    }

    try {
      await onSave(data);
      toast.success('Build data saved');
    } catch {
      toast.error('Failed to save build data');
    }
  };

  return (
    <div className="space-y-4">
      {/* Build Tool Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Build Tool</Label>
        <RadioGroup
          value={buildTool}
          onValueChange={(val) => setBuildTool(val as BuildTool)}
          disabled={readOnly}
          className="grid grid-cols-2 gap-2"
        >
          {BUILD_TOOL_OPTIONS.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <RadioGroupItem value={option.value} id={`build-tool-${option.value}`} />
              <Label htmlFor={`build-tool-${option.value}`} className="text-sm cursor-pointer">
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Conditional Fields */}
      {buildTool === 'lovable' && (
        <div className="space-y-2">
          <Label htmlFor="lovable-url" className="text-sm">Lovable Project URL</Label>
          <Input
            id="lovable-url"
            value={lovableUrl}
            onChange={(e) => setLovableUrl(e.target.value)}
            placeholder="https://lovable.dev/projects/..."
            disabled={readOnly}
          />
        </div>
      )}

      {buildTool === 'matlab' && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">MATLAB Toolboxes Used</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto border rounded-md p-2">
            {MATLAB_TOOLBOXES.map((toolbox) => (
              <div key={toolbox} className="flex items-center space-x-2">
                <Checkbox
                  id={`toolbox-${toolbox}`}
                  checked={matlabToolboxes.includes(toolbox)}
                  onCheckedChange={() => handleToolboxToggle(toolbox)}
                  disabled={readOnly}
                />
                <Label htmlFor={`toolbox-${toolbox}`} className="text-xs cursor-pointer">
                  {toolbox}
                </Label>
              </div>
            ))}
          </div>
          {matlabToolboxes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {matlabToolboxes.map((t) => (
                <Badge key={t} variant="secondary" className="text-xs">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {buildTool === 'code' && (
        <div className="space-y-2">
          <Label htmlFor="github-url" className="text-sm">GitHub Repository URL</Label>
          <Input
            id="github-url"
            value={githubRepoUrl}
            onChange={(e) => setGithubRepoUrl(e.target.value)}
            placeholder="https://github.com/..."
            disabled={readOnly}
          />
        </div>
      )}

      {buildTool === 'other' && (
        <div className="space-y-2">
          <Label htmlFor="tool-name" className="text-sm">Tool Name</Label>
          <Input
            id="tool-name"
            value={toolName}
            onChange={(e) => setToolName(e.target.value)}
            placeholder="e.g., Flutter, Unity, etc."
            disabled={readOnly}
          />
        </div>
      )}

      {/* Common Fields */}
      <div className="space-y-2">
        <Label htmlFor="deployed-url" className="text-sm">Deployed URL</Label>
        <Input
          id="deployed-url"
          value={deployedUrl}
          onChange={(e) => setDeployedUrl(e.target.value)}
          placeholder="https://..."
          disabled={readOnly}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="build-notes" className="text-sm">Notes</Label>
        <Textarea
          id="build-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Build notes, challenges faced, etc."
          rows={3}
          disabled={readOnly}
        />
      </div>

      {!readOnly && (
        <Button
          onClick={handleSave}
          disabled={isSaving || !buildTool}
          size="sm"
          className="w-full"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          Save Build Data
        </Button>
      )}
    </div>
  );
}
