'use server';

import { ApiKeyService } from '@/lib/api-keys/api-key-service';

export async function generateTestApiKey(institutionId?: string | null) {
  return ApiKeyService.generateTestApiKey(institutionId);
}
