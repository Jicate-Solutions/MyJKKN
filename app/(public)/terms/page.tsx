import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Use | MyJKKN — JKKN Educational Institutions',
  description:
    'Terms of Use for MyJKKN, the institutional management platform of JKKN Educational Institutions.',
};

const LAST_UPDATED = '11 June 2026';

export default function TermsOfUsePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-12 md:py-16">
        <header className="mb-10 border-b pb-6">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            MyJKKN — JKKN Educational Institutions
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            Terms of Use
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
        </header>

        <div className="space-y-8 text-[15px] leading-7 text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold text-foreground">1. About the Platform</h2>
            <p className="mt-3">
              MyJKKN (available at www.jkkn.ai, the &quot;Platform&quot;) is the
              institutional management platform operated by JKKN Educational
              Institutions (&quot;JKKN&quot;, &quot;we&quot;, &quot;us&quot;), a
              group of educational institutions based in Tamil Nadu, India. By
              accessing or using the Platform you agree to these Terms of Use. If
              you do not agree, do not use the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">2. Authorized Users</h2>
            <p className="mt-3">
              Authenticated areas of the Platform are intended for use by JKKN
              staff, faculty, students, and other persons expressly authorized by
              JKKN. Access is granted through institutional accounts and is
              role-based: you may only access the modules and data that your role
              permits. Certain pages — such as admission enquiry forms, referral
              forms, and these policy pages — are available to the public without
              an account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">3. Accounts and Security</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                You are responsible for maintaining the confidentiality of your
                account credentials and for all activity that occurs under your
                account.
              </li>
              <li>
                You must notify JKKN promptly of any unauthorized use of your
                account or any other security concern.
              </li>
              <li>
                JKKN may suspend or revoke account access where required for
                security, policy, or administrative reasons.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">4. Acceptable Use</h2>
            <p className="mt-3">You agree not to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                access or attempt to access data, accounts, or modules you are not
                authorized to use;
              </li>
              <li>
                interfere with or disrupt the Platform, its infrastructure, or
                other users&apos; access;
              </li>
              <li>
                use automated means to scrape, harvest, or extract data from the
                Platform without written authorization;
              </li>
              <li>
                submit false, misleading, or unlawful information through any
                Platform form;
              </li>
              <li>
                use personal data accessed through the Platform for any purpose
                other than your authorized institutional duties; or
              </li>
              <li>use the Platform in violation of any applicable law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">5. Intellectual Property</h2>
            <p className="mt-3">
              The Platform, including its software, design, text, and branding, is
              the property of JKKN Educational Institutions or its licensors and is
              protected by applicable intellectual property laws. No rights are
              granted to you other than the limited right to use the Platform in
              accordance with these Terms. JKKN names, logos, and marks may not be
              used without prior written permission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">6. Third-Party Services</h2>
            <p className="mt-3">
              The Platform integrates with third-party services, including hosting
              and database infrastructure and Meta Platforms (Facebook and
              Instagram) for admission enquiries and official institutional
              communications. Your use of those third-party services is governed by
              their own terms and policies. Our handling of data received from Meta
              Platforms is described in our{' '}
              <Link
                href="/privacy"
                className="font-medium text-primary underline underline-offset-4"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">7. Privacy</h2>
            <p className="mt-3">
              Our collection and use of personal data is described in our{' '}
              <Link
                href="/privacy"
                className="font-medium text-primary underline underline-offset-4"
              >
                Privacy Policy
              </Link>
              . Instructions for requesting deletion of your data are on our{' '}
              <Link
                href="/data-deletion"
                className="font-medium text-primary underline underline-offset-4"
              >
                Data Deletion
              </Link>{' '}
              page.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">8. Disclaimers</h2>
            <p className="mt-3">
              The Platform is provided on an &quot;as is&quot; and &quot;as
              available&quot; basis. While we work to keep the Platform accurate,
              secure, and available, JKKN does not warrant that the Platform will
              be uninterrupted, error-free, or free of harmful components.
              Information displayed on the Platform (such as schedules, fees, or
              academic records) is subject to verification against official
              institutional records.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">9. Limitation of Liability</h2>
            <p className="mt-3">
              To the maximum extent permitted by applicable law, JKKN Educational
              Institutions and its officers, staff, and service providers shall not
              be liable for any indirect, incidental, special, or consequential
              damages arising out of or in connection with the use of, or inability
              to use, the Platform. Nothing in these Terms excludes liability that
              cannot be excluded under applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">10. Suspension and Termination</h2>
            <p className="mt-3">
              JKKN may suspend or terminate access to the Platform, in whole or in
              part, for any user who violates these Terms, where required by law,
              or where necessary to protect the Platform or its users.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">11. Governing Law</h2>
            <p className="mt-3">
              These Terms are governed by the laws of India. Any dispute arising
              out of or relating to these Terms or the Platform shall be subject to
              the exclusive jurisdiction of the competent courts in Tamil Nadu,
              India.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">12. Changes to These Terms</h2>
            <p className="mt-3">
              We may revise these Terms from time to time. The &quot;Last
              updated&quot; date at the top of this page indicates when they were
              last revised. Continued use of the Platform after changes take effect
              constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">13. Contact</h2>
            <p className="mt-3">
              Questions about these Terms may be directed to{' '}
              <a
                href="mailto:support@jkkn.ac.in"
                className="font-medium text-primary underline underline-offset-4"
              >
                support@jkkn.ac.in
              </a>{' '}
              or to the JKKN Educational Institutions administration office via{' '}
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
              href="/data-deletion"
              className="font-medium text-primary underline underline-offset-4"
            >
              Data Deletion Instructions
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
