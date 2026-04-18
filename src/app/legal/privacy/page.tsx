import type { Metadata } from "next";
import Link from "next/link";
import { getLegalInfo } from "@/lib/legal-info";

export const metadata: Metadata = {
  title: "Privacy Policy | OpenGet",
  description:
    "How OpenGet collects, uses, and shares personal data when you use our platform — authentication, payments, and contributors.",
};

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="text-muted-foreground leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  const legal = getLegalInfo();
  const contactLine =
    legal.contactEmail !== "" ? (
      <>
        <a className="text-primary underline underline-offset-2" href={`mailto:${legal.contactEmail}`}>
          {legal.contactEmail}
        </a>
      </>
    ) : (
      <>Configure NEXT_PUBLIC_LEGAL_CONTACT_EMAIL for a public privacy contact.</>
    );

  return (
    <div className="container py-10 max-w-3xl mx-auto space-y-10">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: April 18, 2026</p>
        <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-sm text-muted-foreground leading-relaxed">
          This policy describes how <strong className="text-foreground">{legal.entityName}</strong> (&quot;Operator,&quot;
          &quot;we,&quot; &quot;us&quot;) processes personal data when you use OpenGet. It is a general notice;{" "}
          <strong className="text-foreground">local laws</strong> (for example, India&apos;s Digital Personal Data
          Protection Act, 2023) may give you additional rights. Have counsel review for your operating jurisdictions.
        </div>
      </div>

      <Section id="who" title="1. Who we are">
        <p>
          The data controller / business responsible for the Platform is <strong className="text-foreground">{legal.entityName}</strong>,{" "}
          {legal.address} The Platform is provided at{" "}
          <strong className="text-foreground">{legal.siteUrl}</strong>.
        </p>
        <p>
          Contact for privacy inquiries: {contactLine}
        </p>
      </Section>

      <Section id="collect" title="2. Data we collect">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-foreground">Account and profile:</strong> Information from your authentication
            provider (for example, GitHub user id, username, email, avatar URL) when you sign in; preferences and
            settings you save on the Platform.
          </li>
          <li>
            <strong className="text-foreground">Repository and contribution data:</strong> Public GitHub metadata and
            contribution signals we fetch to score repos and contributors (for example, repo names, stars, contributor
            lists, activity metrics) as permitted by GitHub&apos;s terms and APIs.
          </li>
          <li>
            <strong className="text-foreground">Payment-related data:</strong> When you pay or receive payouts, our
            payment processors collect payment details, billing information, and verification data (for example, KYC).
            We typically receive limited tokens, transaction ids, amounts, and status — not full card numbers.
          </li>
          <li>
            <strong className="text-foreground">Technical and usage data:</strong> IP address, device/browser type,
            approximate location, timestamps, logs, and cookies or similar technologies used to run and secure the
            service.
          </li>
          <li>
            <strong className="text-foreground">Communications:</strong> Messages you send us (support, legal notices).
          </li>
        </ul>
      </Section>

      <Section id="purposes" title="3. How we use data (purposes)">
        <ul className="list-disc pl-5 space-y-2">
          <li>Provide, operate, and improve the Platform (including pools, scoring, and payouts).</li>
          <li>Authenticate users, prevent fraud and abuse, and secure accounts.</li>
          <li>Process sponsor payments and contributor payouts; comply with financial regulations and processor rules.</li>
          <li>Communicate with you about the service, updates, and support.</li>
          <li>Comply with law, enforce our{" "}
            <Link href="/legal/terms" className="text-primary underline underline-offset-2">
              Terms of Service
            </Link>
            , and defend legal claims.
          </li>
          <li>Aggregate or de-identified analytics to understand usage (without identifying you where required).</li>
        </ul>
        <p>
          <strong className="text-foreground">Legal bases</strong> (summary): performance of a contract with you;
          legitimate interests in running a secure platform; compliance with legal obligations; consent where we rely on
          it (for example, certain cookies or marketing, if offered).
        </p>
      </Section>

      <Section id="sharing" title="4. Sharing and processors">
        <p>We share data with categories of recipients including:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-foreground">Appwrite</strong> (or successor backend) for authentication, database, and
            hosting of application data. Our Appwrite project region is configured as{" "}
            <strong className="text-foreground">Singapore</strong>, meaning personal data may be stored or processed
            outside India on Appwrite&apos;s infrastructure, subject to their terms and applicable law.
          </li>
          <li>
            <strong className="text-foreground">GitHub</strong> when you connect your account or when we read public
            repository data per GitHub&apos;s terms.
          </li>
          <li>
            <strong className="text-foreground">Payment processors</strong> authorized by Operator (for example
            Razorpay or other Reserve Bank of India–regulated payment aggregators for India, and such international
            providers as we enable) to collect sponsor payments and send contributor payouts.
          </li>
          <li>
            <strong className="text-foreground">Infrastructure and analytics providers</strong> we use to host, monitor,
            or operate the service.
          </li>
          <li>
            <strong className="text-foreground">Authorities</strong> when required by law or to protect rights and
            safety.
          </li>
        </ul>
        <p>
          We do not sell your personal information as a commodity. We may allow processors to process data only under
          contracts or terms consistent with their role.
        </p>
      </Section>

      <Section id="retention" title="5. Retention and security">
        <p>
          We retain data as long as needed to provide the Platform, meet legal and accounting obligations, and resolve
          disputes. Some logs and transaction records may be kept longer where required. We use reasonable technical and
          organizational measures to protect data; no method of transmission over the Internet is 100% secure.
        </p>
      </Section>

      <Section id="rights" title="6. Your rights">
        <p>
          Depending on your location, you may have rights to access, correct, delete, or port your data; to object or
          restrict certain processing; and to withdraw consent where processing is consent-based. Users in{" "}
          <strong className="text-foreground">India</strong> may have rights under the Digital Personal Data Protection
          Act, 2023, including nominating a nominee and grievance redressal; we will respond per applicable timelines
          once fully prescribed. You may also have the right to complain to the Data Protection Board of India or other
          authorities as the law provides.
        </p>
        <p>
          To exercise rights, contact us at {contactLine}. We may need to verify your identity before responding.
        </p>
      </Section>

      <Section id="transfers" title="7. International transfers">
        <p>
          Operator is oriented toward <strong className="text-foreground">India</strong>, but infrastructure (such as
          Appwrite in Singapore) and payment partners may process data outside India. Where Indian law requires it, we
          rely on permitted mechanisms for cross-border transfers (including government notifications and standard
          contractual clauses as applicable). By using the Platform, you understand that your data may be transferred to
          and processed in countries where our processors operate.
        </p>
      </Section>

      <Section id="children" title="8. Children">
        <p>
          The Platform is not directed at children under the age of majority. We do not knowingly collect personal data
          from children. If you believe we have, contact us and we will take appropriate steps.
        </p>
      </Section>

      <Section id="changes" title="9. Changes to this policy">
        <p>
          We may update this Privacy Policy by posting a new version here and changing the &quot;Last updated&quot; date.
          Material changes may require additional notice where the law applies.
        </p>
      </Section>

      <Section id="contact" title="10. Contact">
        <p>
          Questions: {contactLine} — See also{" "}
          <Link href="/legal/terms" className="text-primary underline underline-offset-2">
            Terms of Service
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
