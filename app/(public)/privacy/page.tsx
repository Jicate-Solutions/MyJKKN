import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | MyJKKN — JKKN Educational Institutions',
  description:
    'Privacy Policy for MyJKKN, the institutional platform of JKKN Educational Institutions: what data we collect, how we use it, how it is stored, and how to contact us.',
};

const LAST_UPDATED = '11 June 2026';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-12 md:py-16">
        <header className="mb-10 border-b pb-6">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            MyJKKN — JKKN Educational Institutions
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
        </header>

        <div className="space-y-8 text-[15px] leading-7 text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold text-foreground">1. Who We Are</h2>
            <p className="mt-3">
              MyJKKN (available at www.jkkn.ai) is the institutional management
              platform operated by JKKN Educational Institutions, a group of
              educational institutions based in Tamil Nadu, India. The platform is
              used by JKKN staff, faculty, students, and admission teams to manage
              academic operations, admissions, billing, and related institutional
              activities. This Privacy Policy explains what personal data we
              collect, how we use it, and the choices available to you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">2. Information We Collect</h2>
            <p className="mt-3">We collect the following categories of information:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <span className="font-medium">Institutional account data.</span>{' '}
                Names, official email addresses, roles, institution and department
                affiliations, and profile details of staff, faculty, and students
                who hold accounts on the platform.
              </li>
              <li>
                <span className="font-medium">Admission enquiry data.</span> When a
                prospective student or their representative submits an enquiry —
                through our website forms, referral forms, phone or walk-in entries
                recorded by our admission team, or through advertisements on Meta
                platforms (Facebook and Instagram Lead Ads) — we collect the details
                provided in that submission, such as name, phone number, email
                address, and program of interest.
              </li>
              <li>
                <span className="font-medium">Social media data via the Meta Graph API.</span>{' '}
                For Facebook Pages and Instagram accounts officially operated by
                JKKN institutions, we receive page and account insights
                (aggregate metrics such as reach, impressions, and follower
                counts) and the content and metadata of messages sent to those
                official pages and accounts (Messenger and Instagram Direct), which
                our admission and communications teams use to respond to enquiries.
              </li>
              <li>
                <span className="font-medium">Usage and log data.</span> Standard
                technical information generated when the platform is used, such as
                authentication events and audit logs, used for security and
                troubleshooting.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">3. How We Use Information</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Processing admissions: responding to enquiries, counselling
                prospective students, and managing the application and enrollment
                process.
              </li>
              <li>
                Institutional operations: academic administration, billing, and
                student lifecycle management for enrolled students.
              </li>
              <li>
                Institutional analytics: understanding admission trends and the
                performance of our official social media presence, using aggregate
                metrics.
              </li>
              <li>
                Communications: replying to messages sent to JKKN&apos;s official
                pages and accounts, and contacting people who have asked to be
                contacted about admission.
              </li>
              <li>Security: protecting the platform, its users, and their data.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">4. Meta Platform Data</h2>
            <p className="mt-3">
              Where we receive data from Meta Platforms (Facebook and Instagram) —
              including Lead Ads submissions, page and account insights, and
              messages sent to our official pages and accounts — we handle that
              data in accordance with the{' '}
              <a
                href="https://developers.facebook.com/terms/"
                className="font-medium text-primary underline underline-offset-4"
                rel="noopener noreferrer"
                target="_blank"
              >
                Meta Platform Terms
              </a>{' '}
              and applicable Meta developer policies. Lead Ads data is used only
              for the purpose for which the person submitted it: admission
              enquiries and follow-up by JKKN&apos;s admission team. Message data is
              used only to manage and respond to conversations with our official
              accounts. We do not use Meta Platform data for advertising to third
              parties, and we do not sell it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">5. Storage and Security</h2>
            <p className="mt-3">
              Platform data is stored in a managed PostgreSQL database hosted on
              Supabase. Access is restricted through role-based permissions and
              database-level row security, so that staff can only access the data
              required for their role and institution. Data is encrypted in
              transit. Access to administrative functions is limited to authorized
              personnel.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">6. Sharing of Information</h2>
            <p className="mt-3">We do not sell personal data. Information is shared only:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                within JKKN Educational Institutions, among the staff who need it
                to perform their roles;
              </li>
              <li>
                with service providers who host and operate our infrastructure
                (such as our hosting and database providers), under appropriate
                safeguards; and
              </li>
              <li>
                when required by law, regulation, or a valid request from a
                competent authority.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">7. Data Retention</h2>
            <p className="mt-3">
              Admission enquiry data is retained for the duration of the relevant
              admission cycle and for a reasonable period afterwards for follow-up
              and record-keeping, after which it is deleted or anonymized unless
              the enquirer becomes an enrolled student. Records of enrolled
              students are retained as required by applicable educational
              regulations. You may request earlier deletion of your data as
              described on our{' '}
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
            <h2 className="text-xl font-semibold text-foreground">8. Your Rights</h2>
            <p className="mt-3">
              You may request access to, correction of, or deletion of your
              personal data by contacting us using the details below. If your data
              reached us through a Meta platform (for example, a Lead Ads form or a
              message to one of our official accounts), the instructions on our{' '}
              <Link
                href="/data-deletion"
                className="font-medium text-primary underline underline-offset-4"
              >
                Data Deletion
              </Link>{' '}
              page apply.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">9. Changes to This Policy</h2>
            <p className="mt-3">
              We may update this Privacy Policy from time to time. The &quot;Last
              updated&quot; date at the top of this page indicates when it was last
              revised. Continued use of the platform after changes take effect
              constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">10. Contact Us</h2>
            <p className="mt-3">
              For questions about this Privacy Policy or about how your data is
              handled, contact:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Email:{' '}
                <a
                  href="mailto:support@jkkn.ac.in"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  support@jkkn.ac.in
                </a>
              </li>
              <li>
                JKKN Educational Institutions administration office, via{' '}
                <a
                  href="https://www.jkkn.ac.in"
                  className="font-medium text-primary underline underline-offset-4"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  www.jkkn.ac.in
                </a>
              </li>
            </ul>
          </section>
        </div>

        <footer className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          <p>
            See also:{' '}
            <Link href="/terms" className="font-medium text-primary underline underline-offset-4">
              Terms of Use
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
