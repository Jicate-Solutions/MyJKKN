// CDC Industry Mentor hooks — agent ζ Sprint 7b
'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  IndustryMentor,
  IndustryMentorListParams,
  IndustryMentorListResponse,
  CreateIndustryMentorInput,
  UpdateIndustryMentorInput,
} from '@/types/cdc/industry-mentors';

export function useIndustryMentors(params: IndustryMentorListParams = {}) {
  const [data, setData] = useState<IndustryMentorListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (params.sector)   qs.set('sector', params.sector);
      if (params.status)   qs.set('status', params.status);
      if (params.page)     qs.set('page', String(params.page));
      if (params.limit)    qs.set('limit', String(params.limit));
      if (params.search)   qs.set('search', params.search);

      const res = await fetch(`/api/cdc/industry-mentors?${qs.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error ?? 'Request failed');
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.sector, params.status, params.page, params.limit, params.search]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { data, loading, error, refetch: fetch_ };
}

export function useIndustryMentor(id: string) {
  const [mentor, setMentor] = useState<IndustryMentor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/cdc/industry-mentors/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Not found' }));
          throw new Error(err.error ?? 'Not found');
        }
        return res.json();
      })
      .then((data: IndustryMentor) => {
        setMentor(data);
        setError(null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  return { mentor, loading, error };
}

export function useCreateIndustryMentor() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createMentor(
    input: CreateIndustryMentorInput
  ): Promise<IndustryMentor> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cdc/industry-mentors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Create failed' }));
        throw new Error(err.error ?? 'Create failed');
      }
      return await res.json() as IndustryMentor;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  return { createMentor, loading, error };
}

export function useUpdateIndustryMentor(id: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateMentor(
    input: UpdateIndustryMentorInput
  ): Promise<IndustryMentor> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cdc/industry-mentors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Update failed' }));
        throw new Error(err.error ?? 'Update failed');
      }
      return await res.json() as IndustryMentor;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  return { updateMentor, loading, error };
}
