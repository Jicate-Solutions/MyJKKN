/**
 * /schools-portal — root entry.
 *
 * The proxy redirects authed HMs to /schools-portal/dashboard (and unauthed
 * to /schools-portal/login), so this page only renders during the brief
 * window between the proxy decision and a hard navigation. Keep it minimal.
 */
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function SchoolsPortalRootPage() {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <h1 className="text-2xl font-semibold text-[#11243a]">
        JKKN Schools Network
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in to your school portal to see sessions JKKN has conducted at
        your school and contributions delivered.
      </p>
      <div className="mt-6">
        <Button asChild className="bg-[#0b6d41] hover:bg-[#0e7a49]">
          <Link href="/schools-portal/login">Sign in</Link>
        </Button>
      </div>
    </div>
  );
}
