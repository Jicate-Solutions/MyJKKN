import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CaseStudyService } from '@/lib/services/startup-studio/case-study-service'
import type {
  CreateCaseStudyDto,
  UpdateCaseStudyDto,
  AdminUpdateCaseStudyDto,
} from '@/types/startup-studio'

export function useMyCaseStudy(eventId: string, registrationId: string | null | undefined) {
  return useQuery({
    queryKey: ['case-study', eventId, registrationId],
    queryFn: () => CaseStudyService.getMyCaseStudy(eventId, registrationId!),
    enabled: !!eventId && !!registrationId,
  })
}

export function useEventCaseStudies(eventId: string) {
  return useQuery({
    queryKey: ['event-case-studies', eventId],
    queryFn: () => CaseStudyService.getEventCaseStudies(eventId),
    enabled: !!eventId,
  })
}

export function useCreateCaseStudy(eventId: string, registrationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (dto: CreateCaseStudyDto) => CaseStudyService.createCaseStudy(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-study', eventId, registrationId] })
      queryClient.invalidateQueries({ queryKey: ['event-case-studies', eventId] })
      toast.success("Case study submitted! Your story is now part of the JKKN portfolio.")
    },
    onError: (error: Error) => {
      toast.error('Save failed — your content is preserved. Tap to retry.', {
        description: error.message,
      })
    },
  })
}

export function useUpdateCaseStudy(eventId: string, registrationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCaseStudyDto }) =>
      CaseStudyService.updateCaseStudy(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-study', eventId, registrationId] })
      queryClient.invalidateQueries({ queryKey: ['event-case-studies', eventId] })
      toast.success('Case study updated.')
    },
    onError: (error: Error) => {
      toast.error('Save failed — your content is preserved. Tap to retry.', {
        description: error.message,
      })
    },
  })
}

export function useAdminUpdateCaseStudy(eventId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: AdminUpdateCaseStudyDto }) =>
      CaseStudyService.adminUpdateCaseStudy(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-case-studies', eventId] })
    },
    onError: (error: Error) => {
      toast.error('Failed to update case study', { description: error.message })
    },
  })
}
