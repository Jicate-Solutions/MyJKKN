// hooks/admission/use-ai-responses.ts
// React Query hooks for AI response generation

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  CommunicationChannel,
  ResponseIntent,
  LeadContext,
  GenerateResponseResult,
  SuggestedResponse,
  PersonalizeTemplateInput,
  PersonalizedTemplate
} from '@/lib/services/admission/ai-response-service';
import { AIResponseService } from '@/lib/services/admission/ai-response-service';

// Query keys
export const aiResponseKeys = {
  all: ['ai-responses'] as const,
  status: () => [...aiResponseKeys.all, 'status'] as const,
  suggestions: (leadId: string, channel: CommunicationChannel) =>
    [...aiResponseKeys.all, 'suggestions', leadId, channel] as const
};

/**
 * Check AI service availability
 */
export function useAIServiceStatus() {
  return useQuery({
    queryKey: aiResponseKeys.status(),
    queryFn: async () => {
      const response = await fetch('/api/ai/generate-response');
      if (!response.ok) {
        throw new Error('Failed to check AI service status');
      }
      return response.json() as Promise<{
        status: 'available' | 'unavailable';
        message: string;
      }>;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false
  });
}

/**
 * Generate AI response suggestions
 */
export function useGenerateResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadContext,
      channel,
      intent,
      customPrompt
    }: {
      leadContext: LeadContext;
      channel: CommunicationChannel;
      intent?: ResponseIntent;
      customPrompt?: string;
    }) => {
      const response = await fetch('/api/ai/generate-response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          leadContext,
          channel,
          intent: intent || 'general',
          customPrompt
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate response');
      }

      return response.json() as Promise<GenerateResponseResult>;
    },
    onSuccess: (data, variables) => {
      // Cache the suggestions
      queryClient.setQueryData(
        aiResponseKeys.suggestions(variables.leadContext.lead.id, variables.channel),
        data
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate AI suggestions');
    }
  });
}

/**
 * Get cached suggestions for a lead
 */
export function useSuggestedReplies(
  leadId: string | undefined,
  channel: CommunicationChannel | undefined
) {
  return useQuery({
    queryKey: aiResponseKeys.suggestions(leadId || '', channel || 'email'),
    queryFn: async () => {
      // This would fetch from cache or generate new
      // For now, return null to indicate no cached data
      return null as GenerateResponseResult | null;
    },
    enabled: !!leadId && !!channel,
    staleTime: 10 * 60 * 1000 // 10 minutes
  });
}

/**
 * Hook for personalizing templates
 */
export function usePersonalizeTemplate() {
  return useMutation({
    mutationFn: async (input: PersonalizeTemplateInput) => {
      // This runs client-side using the service directly
      return AIResponseService.personalizeTemplate(input);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to personalize template');
    }
  });
}

/**
 * Combined hook for AI response functionality
 */
export function useAIResponses(leadId?: string) {
  const queryClient = useQueryClient();
  const { data: status, isLoading: statusLoading } = useAIServiceStatus();
  const generateMutation = useGenerateResponse();
  const personalizeMutation = usePersonalizeTemplate();

  const generateSuggestions = async (
    leadContext: LeadContext,
    channel: CommunicationChannel,
    intent?: ResponseIntent,
    customPrompt?: string
  ) => {
    return generateMutation.mutateAsync({
      leadContext,
      channel,
      intent,
      customPrompt
    });
  };

  const personalizeTemplate = (input: PersonalizeTemplateInput) => {
    return personalizeMutation.mutateAsync(input);
  };

  const clearCache = () => {
    queryClient.invalidateQueries({ queryKey: aiResponseKeys.all });
  };

  return {
    // Status
    isAvailable: status?.status === 'available',
    statusMessage: status?.message,
    isCheckingStatus: statusLoading,

    // Generation
    generateSuggestions,
    isGenerating: generateMutation.isPending,
    suggestions: generateMutation.data?.suggestions || [],
    generationError: generateMutation.error,

    // Personalization
    personalizeTemplate,
    isPersonalizing: personalizeMutation.isPending,
    personalizedContent: personalizeMutation.data,

    // Cache
    clearCache
  };
}

/**
 * Hook for getting intent options
 */
export function useResponseIntents() {
  const intents: { value: ResponseIntent; label: string; description: string }[] = [
    {
      value: 'greeting',
      label: 'Greeting',
      description: 'Initial contact or welcome message'
    },
    {
      value: 'follow_up',
      label: 'Follow Up',
      description: 'Continue a previous conversation'
    },
    {
      value: 'inquiry_response',
      label: 'Inquiry Response',
      description: 'Answer questions about programs'
    },
    {
      value: 'document_reminder',
      label: 'Document Reminder',
      description: 'Request or remind about documents'
    },
    {
      value: 'interview_schedule',
      label: 'Interview Schedule',
      description: 'Schedule or confirm interviews'
    },
    {
      value: 'offer_details',
      label: 'Offer Details',
      description: 'Share admission offer information'
    },
    {
      value: 'payment_reminder',
      label: 'Payment Reminder',
      description: 'Remind about fees or payments'
    },
    {
      value: 'general',
      label: 'General',
      description: 'General communication'
    }
  ];

  return { intents };
}

/**
 * Hook for channel options
 */
export function useCommunicationChannels() {
  const channels: {
    value: CommunicationChannel;
    label: string;
    icon: string;
    maxLength?: number;
  }[] = [
    {
      value: 'email',
      label: 'Email',
      icon: 'mail'
    },
    {
      value: 'whatsapp',
      label: 'WhatsApp',
      icon: 'message-circle'
    },
    {
      value: 'sms',
      label: 'SMS',
      icon: 'smartphone',
      maxLength: 160
    }
  ];

  return { channels };
}
