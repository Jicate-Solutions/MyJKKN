'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Mail,
  MessageCircle,
  Smartphone,
  Loader2,
  AlertCircle,
  Wand2
} from 'lucide-react';
import {
  useAIResponses,
  useResponseIntents,
  useCommunicationChannels
} from '@/hooks/admission/use-ai-responses';
import type {
  CommunicationChannel,
  ResponseIntent,
  LeadContext,
  SuggestedResponse
} from '@/lib/services/admission/ai-response-service';
import type { AdmissionLead } from '@/types/admission';

// ============================================
// TYPES
// ============================================

interface AISuggestedResponsesProps {
  lead: AdmissionLead;
  counselorName?: string;
  institutionName?: string;
  defaultChannel?: CommunicationChannel;
  onSelectResponse?: (response: SuggestedResponse) => void;
  className?: string;
}

// ============================================
// CHANNEL ICON COMPONENT
// ============================================

function ChannelIcon({
  channel,
  className = 'h-4 w-4'
}: {
  channel: CommunicationChannel;
  className?: string;
}) {
  switch (channel) {
    case 'email':
      return <Mail className={className} />;
    case 'whatsapp':
      return <MessageCircle className={className} />;
    case 'sms':
      return <Smartphone className={className} />;
    default:
      return <MessageCircle className={className} />;
  }
}

// ============================================
// TONE BADGE COMPONENT
// ============================================

function ToneBadge({ tone }: { tone: SuggestedResponse['tone'] }) {
  const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
    formal: 'default',
    friendly: 'secondary',
    professional: 'outline'
  };

  return (
    <Badge variant={variants[tone] || 'outline'} className="capitalize text-xs">
      {tone}
    </Badge>
  );
}

// ============================================
// RESPONSE CARD COMPONENT
// ============================================

interface ResponseCardProps {
  response: SuggestedResponse;
  channel: CommunicationChannel;
  onSelect?: (response: SuggestedResponse) => void;
  onCopy?: (content: string) => void;
}

function ResponseCard({ response, channel, onSelect, onCopy }: ResponseCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const textToCopy =
      channel === 'email' && response.subject
        ? `Subject: ${response.subject}\n\n${response.content}`
        : response.content;

    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success('Copied to clipboard');
    onCopy?.(textToCopy);

    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelect = () => {
    onSelect?.(response);
    toast.success('Response selected');
  };

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardContent className="p-4 space-y-3">
        {/* Header with tone and confidence */}
        <div className="flex items-center justify-between">
          <ToneBadge tone={response.tone} />
          <span className="text-xs text-muted-foreground">
            {Math.round(response.confidence * 100)}% match
          </span>
        </div>

        {/* Subject line for email */}
        {channel === 'email' && response.subject && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Subject:</p>
            <p className="text-sm font-medium">{response.subject}</p>
          </div>
        )}

        {/* Message content */}
        <div className="space-y-1">
          {channel === 'email' && response.subject && (
            <p className="text-xs font-medium text-muted-foreground">Message:</p>
          )}
          <p className="text-sm whitespace-pre-wrap">{response.content}</p>
        </div>

        {/* Character count for SMS */}
        {channel === 'sms' && (
          <p
            className={`text-xs ${
              response.content.length > 160 ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            {response.content.length}/160 characters
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleCopy}>
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
          {onSelect && (
            <Button size="sm" className="flex-1" onClick={handleSelect}>
              Use This
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// LOADING SKELETON
// ============================================

function ResponseSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 flex-1" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function AISuggestedResponses({
  lead,
  counselorName,
  institutionName,
  defaultChannel = 'whatsapp',
  onSelectResponse,
  className
}: AISuggestedResponsesProps) {
  const [channel, setChannel] = useState<CommunicationChannel>(defaultChannel);
  const [intent, setIntent] = useState<ResponseIntent>('general');
  const [customPrompt, setCustomPrompt] = useState('');
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);

  const { intents } = useResponseIntents();
  const { channels } = useCommunicationChannels();
  const {
    isAvailable,
    statusMessage,
    isCheckingStatus,
    generateSuggestions,
    isGenerating,
    suggestions,
    generationError
  } = useAIResponses(lead.id);

  const handleGenerate = async () => {
    const leadContext: LeadContext = {
      lead,
      counselorName,
      institutionName
    };

    await generateSuggestions(
      leadContext,
      channel,
      intent,
      customPrompt || undefined
    );
  };

  // Loading state while checking service availability
  if (isCheckingStatus) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5" />
            AI Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Service unavailable state
  if (!isAvailable) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5" />
            AI Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {statusMessage || 'AI service is not available'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-amber-500" />
          AI Response Suggestions
        </CardTitle>
        <CardDescription>
          Generate personalized responses for {lead.full_name}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Channel Selection */}
        <Tabs value={channel} onValueChange={(v) => setChannel(v as CommunicationChannel)}>
          <TabsList className="grid w-full grid-cols-3">
            {channels.map((ch) => (
              <TabsTrigger key={ch.value} value={ch.value} className="flex items-center gap-1">
                <ChannelIcon channel={ch.value} className="h-3 w-3" />
                {ch.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Intent Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Message Intent</label>
          <Select value={intent} onValueChange={(v) => setIntent(v as ResponseIntent)}>
            <SelectTrigger>
              <SelectValue placeholder="Select intent" />
            </SelectTrigger>
            <SelectContent>
              {intents.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  <div className="flex flex-col">
                    <span>{i.label}</span>
                    <span className="text-xs text-muted-foreground">{i.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom Prompt Toggle */}
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCustomPrompt(!showCustomPrompt)}
            className="text-xs"
          >
            <Wand2 className="h-3 w-3 mr-1" />
            {showCustomPrompt ? 'Hide' : 'Add'} Custom Instructions
          </Button>

          {showCustomPrompt && (
            <Textarea
              placeholder="Add specific instructions or context..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="min-h-[80px]"
            />
          )}
        </div>

        {/* Generate Button */}
        <Button onClick={handleGenerate} disabled={isGenerating} className="w-full">
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : suggestions.length > 0 ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerate
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Suggestions
            </>
          )}
        </Button>

        {/* Error State */}
        {generationError && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            {generationError.message}
          </div>
        )}

        {/* Loading State */}
        {isGenerating && (
          <div className="space-y-3">
            <ResponseSkeleton />
            <ResponseSkeleton />
            <ResponseSkeleton />
          </div>
        )}

        {/* Suggestions */}
        {!isGenerating && suggestions.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {suggestions.length} suggestions generated
            </p>
            {suggestions.map((suggestion) => (
              <ResponseCard
                key={suggestion.id}
                response={suggestion}
                channel={channel}
                onSelect={onSelectResponse}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isGenerating && suggestions.length === 0 && !generationError && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            Click "Generate Suggestions" to get AI-powered response options
          </div>
        )}
      </CardContent>
    </Card>
  );
}
