import { Card, CardContent } from '@/components/ui/card';
import { ReactNode } from 'react';

export default function PlaceholderContent({
  children
}: {
  children: ReactNode;
}) {
  return (
    <Card className='rounded-lg border-none mt-6'>
      <CardContent className='p-6'>
        <div className='flex flex-col justify-start items-center min-h-[calc(100vh-56px-64px-20px-24px-56px-48px)]'>
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
