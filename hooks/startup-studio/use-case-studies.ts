import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CaseStudyService } from '@/lib/services/startup-studio/case-study-service'
import type {
  CreateCaseStudyDto,
  UpdateCaseStudyDto,
  AdminUpdateCaseStudyDto,
} from '@/types/startup-studio'

// Guards against Next.js 15 DRP placeholders like "%%drp:id:abc%%" passed as route params
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string | undefined | null): boolean => !!id && !id.includes('%%drp:') && UUID_REGEX.test(id);

export function useMyCaseStudy(eventId: string, registrationId: string | null | undefined) {
  return useQuery({
    queryKey: ['case-study', eventId, registrationId],
    queryFn: () => CaseStudyService.getMyCaseStudy(eventId, registrationId!),
    enabled: isValidUUID(eventId) && isValidUUID(registrationId),
  })
}

export function useEventCaseStudies(eventId: string) {
  return useQuery({
    queryKey: ['event-case-studies', eventId],
    queryFn: () => CaseStudyService.getEventCaseStudies(eventId),
    enabled: isValidUUID(eventId),
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
