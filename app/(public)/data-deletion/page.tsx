import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Data Deletion Instructions | MyJKKN — JKKN Educational Institutions',
  description:
    'How to request deletion of your personal data from MyJKKN, including data received through Facebook and Instagram (Meta Lead Ads and messages to JKKN official accounts).',
};

const LAST_UPDATED = '11 June 2026';

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-12 md:py-16">
        <header className="mb-10 border-b pb-6">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            MyJKKN — JKKN Educational Institutions
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            Data Deletion Instructions
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
        </header>

        <div className="space-y-8 text-[15px] leading-7 text-foreground/90">
          <section>
            <p>
              MyJKKN is the institutional platform of JKKN Educational
              Institutions, Tamil Nadu, India. This page explains how you can
              request the deletion of personal data we hold about you — including
              data we received through Meta platforms (Facebook and Instagram),
              such as Lead Ads form submissions and messages you sent to
              JKKN&apos;s official pages and accounts.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">1. How to Request Deletion</h2>
            <p className="mt-3">
              Send an email to{' '}
              <a
                href="mailto:support@jkkn.ac.in"
                className="font-medium text-primary underline underline-offset-4"
              >
                support@jkkn.ac.in
              </a>{' '}
              with the subject line <span className="font-medium">&quot;Data Deletion Request&quot;</span>.
              Include the following so we can locate your records:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>your full name;</li>
              <li>
                the phone number and/or email address you used when contacting
                JKKN (for example, the details you entered in a Facebook or
                Instagram Lead Ads form, an enquiry form, or a referral form); and
              </li>
              <li>
                if your request relates to messages, the Facebook or Instagram
                username you messaged us from and, if known, which JKKN page or
                account you contacted.
              </li>
            </ul>
            <p className="mt-3">
              You may also contact the JKKN Educational Institutions
              administration office via{' '}
              <a
                href="https://www.jkkn.ac.in"
                className="font-medium text-primary underline underline-offset-4"
                rel="noopener noreferrer"
                target="_blank"
              >
                www.jkkn.ac.in
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">2. What Will Be Deleted</h2>
            <p className="mt-3">On a verified request, we delete:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                your admission enquiry / lead records, including submissions
                received through Meta Lead Ads (name, contact details, program of
                interest, and related notes);
              </li>
              <li>
                the stored history of your Messenger and Instagram Direct
                conversations with JKKN&apos;s official pages and accounts, as held
                in our admission inbox; and
              </li>
              <li>
                your contact details held in our admission CRM and any follow-up
                records linked to them.
              </li>
            </ul>
            <p className="mt-3">
              Note: deleting our copy does not remove your conversation from your
              own Facebook or Instagram account, or from Meta&apos;s systems —
              those are controlled by Meta and by you through your Meta account
              settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">3. What May Be Retained</h2>
            <p className="mt-3">
              If you are or were an enrolled student of a JKKN institution, certain
              academic and financial records must be retained under applicable
              educational and statutory regulations and cannot be deleted on
              request. We will tell you in our response if any part of your data
              falls under such an obligation. We may also retain a minimal record
              of the deletion request itself for compliance purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">4. Timeline</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                We acknowledge deletion requests within{' '}
                <span className="font-medium">7 days</span> of receipt.
              </li>
              <li>
                Verified requests are completed within{' '}
                <span className="font-medium">30 days</span> of receipt, and we
                confirm by reply once deletion is done.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              5. Removing the App from Your Facebook Account
            </h2>
            <p className="mt-3">
              If you interacted with JKKN through Facebook and want to disconnect
              the connection on Meta&apos;s side, you can also remove the app from
              your Facebook settings: open{' '}
              <span className="font-medium">
                Settings &amp; Privacy → Settings → Apps and Websites
              </span>
              , find the JKKN app, and remove it. Removing the app stops future
              data sharing from your account, but it does not delete data we have
              already received — for that, send us a deletion request as described
              in Section 1.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">6. Questions</h2>
            <p className="mt-3">
              For anything related to your data, write to{' '}
              <a
                href="mailto:support@jkkn.ac.in"
                className="font-medium text-primary underline underline-offset-4"
              >
                support@jkkn.ac.in
              </a>
              . How we collect and use data is described in our{' '}
              <Link
                href="/privacy"
                className="font-medium text-primary underline underline-offset-4"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>

        <footer className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          <p>
            See also:{' '}
            <Link
              href="/privacy"
              className="font-medium text-primary underline underline-offset-4"
            >
              Privacy Policy
            </Link>{' '}
            ·{' '}
            <Link
              href="/terms"
              className="font-medium text-primary underline underline-offset-4"
            >
              Terms of Use
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
