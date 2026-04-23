import { Metadata } from 'next';
import McpDocs from './_components/mcp-docs';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import Link from 'next/link';
import { ApiNav } from '../_components/api-nav';

/**
 * navMeta — documents that this page is invoked via a button/link on the
 * parent listing page. Required by `scripts/assert-nav-coverage.mjs`.
 */
export const navMeta = {
  invokedFrom: '/application-hub/api-guidelines',
} as const;


export const metadata: Metadata = {
  title: 'MCP Server Documentation | Application Hub',
  description:
    'Connect AI tools like Claude Desktop, ChatGPT, Cursor, and Claude Code to JKKN institutional data via the Model Context Protocol (MCP) server.'
};

export default function McpServerPage() {
  return (
    <ContentLayout title='Application Hub'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/application-hub/api-guidelines'>API Guidelines</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>MCP Server</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-2'>
        <div>
          <h1 className='text-2xl font-bold py-1'>MCP Server Documentation</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Connect AI assistants like Claude, ChatGPT, and Cursor to your JKKN institutional data using the Model Context Protocol.
          </p>
        </div>
        <ApiNav />
        <McpDocs />
      </div>
    </ContentLayout>
  );
}
