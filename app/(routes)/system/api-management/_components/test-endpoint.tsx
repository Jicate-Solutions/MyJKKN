// app/(routes)/system/api-management/_components/test-endpoint.tsx
'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { ChevronDown, ChevronUp, Play, Copy, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const formSchema = z.object({
  endpoint: z.string().min(1, 'Endpoint is required'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
  apiKey: z.string().min(1, 'API Key is required'),
  params: z.record(z.string()).optional()
});

interface ParamField {
  key: string;
  value: string;
}

export function TestEndpoint() {
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [params, setParams] = useState<ParamField[]>([{ key: '', value: '' }]);
  const [hasCopied, setHasCopied] = useState(false);
  const [showResponse, setShowResponse] = useState(true);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      endpoint: '/api/profiles',
      method: 'GET',
      apiKey: '',
      params: {}
    }
  });

  const addParam = () => {
    setParams([...params, { key: '', value: '' }]);
  };

  const removeParam = (index: number) => {
    setParams(params.filter((_, i) => i !== index));
  };

  const updateParam = (
    index: number,
    field: 'key' | 'value',
    value: string
  ) => {
    const newParams = [...params];
    newParams[index] = { ...newParams[index], [field]: value };
    setParams(newParams);
  };

  const buildUrl = (endpoint: string, params: Record<string, string>) => {
    const url = new URL(window.location.origin + endpoint);
    Object.entries(params).forEach(([key, value]) => {
      if (key && value) {
        url.searchParams.append(key, value);
      }
    });
    return url.toString();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsLoading(true);
      setResponse(null);

      // Build URL with params
      const paramObject: Record<string, string> = {};
      params.forEach((param) => {
        if (param.key && param.value) {
          paramObject[param.key] = param.value;
        }
      });

      const url = buildUrl(values.endpoint, paramObject);

      // Make request
      const response = await fetch(url, {
        method: values.method,
        headers: {
          Authorization: `Bearer ${values.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      setResponse({
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data
      });
    } catch (error) {
      setResponse({
        error: true,
        message: error instanceof Error ? error.message : 'An error occurred'
      });
    } finally {
      setIsLoading(false);
      setShowResponse(true);
    }
  };

  return (
    <div className='w-full max-w-5xl mx-auto space-y-6 p-4'>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            <FormField
              control={form.control}
              name='endpoint'
              render={({ field }) => (
                <FormItem className='w-full'>
                  <FormLabel>Endpoint</FormLabel>
                  <FormControl>
                    <Input placeholder='/api/profiles' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='method'
              render={({ field }) => (
                <FormItem className='w-full'>
                  <FormLabel>Method</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder='Select method' />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value='GET'>GET</SelectItem>
                      <SelectItem value='POST'>POST</SelectItem>
                      <SelectItem value='PUT'>PUT</SelectItem>
                      <SelectItem value='DELETE'>DELETE</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name='apiKey'
            render={({ field }) => (
              <FormItem>
                <FormLabel>API Key</FormLabel>
                <FormControl>
                  <Input
                    type='password'
                    placeholder='Enter your API key'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className='space-y-4'>
            <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2'>
              <FormLabel>Query Parameters</FormLabel>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={addParam}
                className='w-full sm:w-auto'
              >
                Add Parameter
              </Button>
            </div>
            {params.map((param, index) => (
              <div key={index} className='flex flex-col sm:flex-row gap-2'>
                <Input
                  placeholder='Parameter name'
                  value={param.key}
                  onChange={(e) => updateParam(index, 'key', e.target.value)}
                  className='flex-1'
                />
                <Input
                  placeholder='Value'
                  value={param.value}
                  onChange={(e) => updateParam(index, 'value', e.target.value)}
                  className='flex-1'
                />
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  onClick={() => removeParam(index)}
                  className='self-center'
                >
                  ×
                </Button>
              </div>
            ))}
          </div>

          <div className='flex justify-end'>
            <Button
              type='submit'
              disabled={isLoading}
              className='w-full sm:w-auto'
            >
              <Play className='mr-2 h-4 w-4' />
              {isLoading ? 'Testing...' : 'Test Endpoint'}
            </Button>
          </div>
        </form>
      </Form>

      {response && (
        <Card className='mt-6'>
          <CardHeader className='flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-2'>
            <div>
              <CardTitle className='text-lg'>Response</CardTitle>
              <div className='flex items-center gap-2'>
                <span className='text-sm text-muted-foreground'>Status:</span>
                <Badge
                  variant={response.status < 400 ? 'default' : 'destructive'}
                >
                  {response.status}
                </Badge>
              </div>
            </div>
            <div className='flex gap-2 self-end sm:self-auto'>
              <Button
                variant='ghost'
                size='icon'
                onClick={() =>
                  copyToClipboard(JSON.stringify(response, null, 2))
                }
              >
                {hasCopied ? (
                  <Check className='h-4 w-4 text-green-500' />
                ) : (
                  <Copy className='h-4 w-4' />
                )}
              </Button>
              <Button
                variant='ghost'
                size='icon'
                onClick={() => setShowResponse(!showResponse)}
              >
                {showResponse ? (
                  <ChevronUp className='h-4 w-4' />
                ) : (
                  <ChevronDown className='h-4 w-4' />
                )}
              </Button>
            </div>
          </CardHeader>
          {showResponse && (
            <CardContent>
              <pre className='bg-white p-4 rounded-lg overflow-x-auto max-h-[400px] text-xs sm:text-sm'>
                <code>{JSON.stringify(response, null, 2)}</code>
              </pre>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
