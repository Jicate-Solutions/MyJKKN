'use client';

import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface ApiFetcherProps {
  endpoint: string;
  onDataReceived: (data: unknown) => void;
  apiKey?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

const BASE_URL = 'https://my.jkkn.ac.in/api';

export const ApiFetcher: React.FC<ApiFetcherProps> = ({
  endpoint,
  onDataReceived,
  apiKey,
  method = 'GET',
  body
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!apiKey) {
        toast({
          title: 'Error',
          description: 'API key is required',
          variant: 'destructive'
        });
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
          method,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: body ? JSON.stringify(body) : undefined,
          mode: 'cors'
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `HTTP error! status: ${response.status}, message: ${errorText}`
          );
        }

        const result = await response.json();
        onDataReceived(result);
      } catch (error) {
        console.error('Error:', error);
        toast({
          title: 'Error',
          description:
            error instanceof Error
              ? error.message
              : 'Failed to fetch data. Please try again later.',
          variant: 'destructive'
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [endpoint, apiKey, method, body, onDataReceived, toast]);

  return isLoading ? (
    <div className='flex justify-center items-center'>
      <div className='animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900'></div>
    </div>
  ) : null;
};
