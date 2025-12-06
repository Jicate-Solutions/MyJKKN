/**
 * AI Query Page
 * Main page for the Context-Aware AI Query System
 */

import { Metadata } from 'next';
import { AIQueryContainer } from '@/components/ai-query';

export const metadata: Metadata = {
  title: 'AI Assistant | MyJKKN',
  description: 'Ask questions about students, attendance, billing, and more using natural language',
};

export default function AIQueryPage() {
  return (
    <div className="h-[calc(100vh-4rem)]">
      <AIQueryContainer className="h-full" />
    </div>
  );
}
