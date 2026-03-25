import Link from 'next/link';
import { FileText, ArrowLeft, Search } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function InvoiceNotFound() {
  return (
    <ContentLayout title='Invoice Not Found'>
      <div className='flex items-center justify-center min-h-[400px]'>
        <Card className='w-full max-w-md'>
          <CardContent className='flex flex-col items-center justify-center py-16 text-center'>
            <FileText className='h-16 w-16 text-muted-foreground mb-4' />

            <h1 className='text-2xl font-bold mb-2'>Invoice Not Found</h1>

            <p className='text-muted-foreground mb-6 px-4'>
              The invoice you&apos;re looking for doesn&apos;t exist or has been
              removed. Please check the invoice number and try again.
            </p>

            <div className='flex flex-col sm:flex-row gap-3 w-full px-4'>
              <Button asChild className='flex-1'>
                <Link href='/billing/invoices'>
                  <ArrowLeft className='mr-2 h-4 w-4' />
                  Back to Invoices
                </Link>
              </Button>

              <Button variant='outline' asChild className='flex-1'>
                <Link href='/billing/invoices'>
                  <Search className='mr-2 h-4 w-4' />
                  Search Invoices
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
