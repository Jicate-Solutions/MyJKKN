'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Wand2,
  Eye,
  Edit,
  Copy,
  Check,
  Send,
  Variable,
  AlertCircle
} from 'lucide-react';
import { usePersonalizeTemplate } from '@/hooks/admission/use-ai-responses';
import type { AdmissionLead } from '@/types/admission';

// ============================================
// TYPES
// ============================================

interface ResponsePersonalizerProps {
  lead: AdmissionLead;
  templateContent: string;
  templateSubject?: string;
  counselorName?: string;
  institutionName?: string;
  onSend?: (content: string, subject?: string) => void;
  onCancel?: () => void;
  className?: string;
}

interface VariableInfo {
  name: string;
  value: string;
  isCustom: boolean;
}

// ============================================
// VARIABLE EXTRACTION
// ============================================

function extractVariables(content: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const matches = content.matchAll(regex);
  const variables = new Set<string>();

  for (const match of matches) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ResponsePersonalizer({
  lead,
  templateContent,
  templateSubject,
  counselorName,
  institutionName,
  onSend,
  onCancel,
  className
}: ResponsePersonalizerProps) {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [editedContent, setEditedContent] = useState('');
  const [editedSubject, setEditedSubject] = useState('');
  const [customVariables, setCustomVariables] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const personalizeMutation = usePersonalizeTemplate();

  // Extract variables from template
  const contentVariables = extractVariables(templateContent);
  const subjectVariables = templateSubject ? extractVariables(templateSubject) : [];
  const allVariables = [...new Set([...contentVariables, ...subjectVariables])];

  // Build initial variables map
  const getVariableValue = (varName: string): string => {
    // Check custom variables first
    if (customVariables[varName]) {
      return customVariables[varName];
    }

    // Lead data
    switch (varName) {
      case 'first_name':
        return lead.full_name.split(' ')[0] || lead.full_name;
      case 'last_name':
        return lead.full_name.split(' ').slice(1).join(' ') || '';
      case 'full_name':
        return lead.full_name;
      case 'email':
        return lead.email || '';
      case 'phone':
        return lead.phone;
      case 'program':
      case 'program_interest':
        return lead.interested_programs?.join(', ') || 'your program of interest';
      case 'funnel_stage':
        return lead.funnel_stage
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
      case 'priority':
        return lead.priority;
      case 'city':
        return lead.city || '';
      case 'state':
        return lead.state || '';

      // Counselor & Institution
      case 'counselor_name':
        return counselorName || 'your counselor';
      case 'institution_name':
        return institutionName || 'our institution';

      default:
        return `{{${varName}}}`;
    }
  };

  // Build variable info list
  const variableInfoList: VariableInfo[] = allVariables.map((varName) => ({
    name: varName,
    value: getVariableValue(varName),
    isCustom: !!customVariables[varName]
  }));

  // Personalize content
  const personalizeContent = (content: string): string => {
    return content.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const value = getVariableValue(varName);
      return value !== `{{${varName}}}` ? value : match;
    });
  };

  // Update edited content when switching to edit mode
  useEffect(() => {
    if (mode === 'edit') {
      setEditedContent(personalizeContent(templateContent));
      if (templateSubject) {
        setEditedSubject(personalizeContent(templateSubject));
      }
    }
  }, [mode]);

  // Get final content
  const getFinalContent = (): { content: string; subject?: string } => {
    if (mode === 'edit') {
      return {
        content: editedContent,
        subject: templateSubject ? editedSubject : undefined
      };
    }
    return {
      content: personalizeContent(templateContent),
      subject: templateSubject ? personalizeContent(templateSubject) : undefined
    };
  };

  // Copy to clipboard
  const handleCopy = async () => {
    const { content, subject } = getFinalContent();
    const textToCopy = subject ? `Subject: ${subject}\n\n${content}` : content;

    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success('Copied to clipboard');

    setTimeout(() => setCopied(false), 2000);
  };

  // Send message
  const handleSend = () => {
    const { content, subject } = getFinalContent();
    onSend?.(content, subject);
  };

  // Check for unresolved variables
  const { content: finalContent, subject: finalSubject } = getFinalContent();
  const unresolvedInContent = extractVariables(finalContent);
  const unresolvedInSubject = finalSubject ? extractVariables(finalSubject) : [];
  const hasUnresolvedVariables =
    unresolvedInContent.length > 0 || unresolvedInSubject.length > 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wand2 className="h-5 w-5 text-purple-500" />
          Personalize Response
        </CardTitle>
        <CardDescription>
          Customize the message for {lead.full_name}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Mode Tabs */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'preview' | 'edit')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preview" className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="edit" className="flex items-center gap-1">
              <Edit className="h-3 w-3" />
              Edit
            </TabsTrigger>
          </TabsList>

          {/* Preview Mode */}
          <TabsContent value="preview" className="space-y-4 mt-4">
            {/* Variables Panel */}
            {allVariables.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Variable className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Variables</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {variableInfoList.map((v) => (
                    <Badge
                      key={v.name}
                      variant={v.value.startsWith('{{') ? 'destructive' : 'secondary'}
                      className="text-xs"
                    >
                      {v.name}: {v.value.slice(0, 20)}
                      {v.value.length > 20 ? '...' : ''}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Subject Preview */}
            {templateSubject && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Subject</Label>
                <div className="p-3 bg-muted rounded-lg text-sm font-medium">
                  {personalizeContent(templateSubject)}
                </div>
              </div>
            )}

            {/* Content Preview */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Message</Label>
              <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap min-h-[100px]">
                {personalizeContent(templateContent)}
              </div>
            </div>

            {/* Custom Variables Input */}
            {allVariables.some(
              (v) => getVariableValue(v).startsWith('{{')
            ) && (
              <div className="space-y-2">
                <Separator />
                <p className="text-sm font-medium">Fill Missing Variables</p>
                {allVariables
                  .filter((v) => getVariableValue(v).startsWith('{{'))
                  .map((varName) => (
                    <div key={varName} className="space-y-1">
                      <Label className="text-xs">{varName}</Label>
                      <Input
                        placeholder={`Enter ${varName}`}
                        value={customVariables[varName] || ''}
                        onChange={(e) =>
                          setCustomVariables((prev) => ({
                            ...prev,
                            [varName]: e.target.value
                          }))
                        }
                      />
                    </div>
                  ))}
              </div>
            )}
          </TabsContent>

          {/* Edit Mode */}
          <TabsContent value="edit" className="space-y-4 mt-4">
            {templateSubject && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Subject</Label>
                <Input
                  value={editedSubject}
                  onChange={(e) => setEditedSubject(e.target.value)}
                  placeholder="Enter subject..."
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Message</Label>
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                placeholder="Enter message..."
                className="min-h-[200px]"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {editedContent.length} characters
            </p>
          </TabsContent>
        </Tabs>

        {/* Warning for unresolved variables */}
        {hasUnresolvedVariables && (
          <div className="flex items-center gap-2 p-3 text-sm text-amber-600 bg-amber-50 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            Some variables could not be resolved. Please fill in the missing values.
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleCopy}
            className="flex-1"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </>
            )}
          </Button>
          {onSend && (
            <Button
              onClick={handleSend}
              className="flex-1"
              disabled={hasUnresolvedVariables}
            >
              <Send className="h-4 w-4 mr-2" />
              Send
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// QUICK PERSONALIZER (Inline version)
// ============================================

interface QuickPersonalizerProps {
  lead: AdmissionLead;
  content: string;
  counselorName?: string;
  institutionName?: string;
  className?: string;
}

export function QuickPersonalizer({
  lead,
  content,
  counselorName,
  institutionName,
  className
}: QuickPersonalizerProps) {
  const [copied, setCopied] = useState(false);

  // Simple personalization
  const personalizedContent = content
    .replace(/\{\{first_name\}\}/g, lead.full_name.split(' ')[0] || lead.full_name)
    .replace(/\{\{full_name\}\}/g, lead.full_name)
    .replace(/\{\{email\}\}/g, lead.email || '')
    .replace(/\{\{phone\}\}/g, lead.phone)
    .replace(/\{\{program\}\}/g, lead.program_interest || 'your program')
    .replace(/\{\{counselor_name\}\}/g, counselorName || 'your counselor')
    .replace(/\{\{institution_name\}\}/g, institutionName || 'our institution');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(personalizedContent);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">
        {personalizedContent}
      </div>
      <Button variant="outline" size="sm" onClick={handleCopy}>
        {copied ? (
          <>
            <Check className="h-3 w-3 mr-1" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3 w-3 mr-1" />
            Copy
          </>
        )}
      </Button>
    </div>
  );
}
