import type { Metadata } from "next";
import Link from "next/link";
import { getLegalInfo } from "@/lib/legal-info";

export const metadata: Metadata = {
  title: "Terms of Service | OpenGet",
  description:
    "Terms of Service for OpenGet — a commercial platform for sponsor-funded pools and contributor payouts. Not a charitable trust or nonprofit.",
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

export default function TermsOfServicePage() {
  const legal = getLegalInfo();
  const contactLine =
    legal.contactEmail !== "" ? (
      <>
        Email:{" "}
        <a className="text-primary underline underline-offset-2" href={`mailto:${legal.contactEmail}`}>
          {legal.contactEmail}
        </a>
        .
      </>
    ) : (
      <>Contact channels will be published here once NEXT_PUBLIC_LEGAL_CONTACT_EMAIL is configured.</>
    );

  return (
    <div className="container py-10 max-w-3xl mx-auto space-y-10">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: April 18, 2026</p>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Important:</strong> OpenGet is a{" "}
          <strong className="text-foreground">commercial software platform</strong>. It is{" "}
          <strong className="text-foreground">not</strong> a charitable organization, trust, or nonprofit, and
          sponsor payments are <strong className="text-foreground">not</strong> charitable contributions unless we
          explicitly say otherwise in writing. These Terms are not legal or tax advice; consult your own adviser.
        </div>
      </div>

      <Section id="intro" title="1. Agreement and operator">
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of the websites, applications, and
          related services offered under the OpenGet name (collectively, the &quot;Platform&quot;) provided by{" "}
          <strong className="text-foreground">{legal.entityName}</strong> (&quot;Operator,&quot; &quot;we,&quot;
          &quot;us,&quot; or &quot;our&quot;). The Platform is operated as a{" "}
          <strong className="text-foreground">commercial marketplace-style service</strong> from India, not as a
          charitable trust or Section 8 company unless we state otherwise in writing.
        </p>
        <p>
          <strong className="text-foreground">Registered / business address:</strong> {legal.address}
        </p>
        <p>
          By creating an account, signing in, making a sponsor payment, registering as a contributor, or otherwise
          using the Platform at <strong className="text-foreground">{legal.siteUrl}</strong> (and any successor or
          additional domains we publish), you agree to these Terms. If you do not agree, do not use the Platform.
        </p>
      </Section>

      <Section id="definitions" title="2. Definitions">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-foreground">Services</strong> — The Platform, including tools to list open-source
            repositories, score and surface contributors, operate funding pools, process payments, and facilitate
            contributor payouts, as we make available from time to time.
          </li>
          <li>
            <strong className="text-foreground">User</strong> — Anyone who accesses the Platform.
          </li>
          <li>
            <strong className="text-foreground">Sponsor</strong> — A User who pays Operator to participate in sponsor
            funding of pools under these Terms. Colloquial labels (for example &quot;donate&quot; on older screens) do not
            change the nature of the transaction: it remains a{" "}
            <strong className="text-foreground">commercial payment to Operator</strong> for Services and allocated pool
            funding as described here, not a charitable gift.
          </li>
          <li>
            <strong className="text-foreground">Contributor</strong> — A User who participates in the contributor
            program and may receive payouts from allocated pool funds according to published rules.
          </li>
          <li>
            <strong className="text-foreground">Pool</strong> — A funding allocation track (including by pool type or
            lane) that holds sponsor-funded amounts for distribution under these Terms and our published rules.
          </li>
          <li>
            <strong className="text-foreground">Payout</strong> — A transfer of funds from Operator (or its payment
            partners) to a Contributor, subject to eligibility, verification, and successful processing.
          </li>
        </ul>
      </Section>

      <Section id="non-charity" title="3. Nature of the relationship (not a charity)">
        <p>
          The Platform is operated for <strong className="text-foreground">commercial purposes</strong>. Operator is{" "}
          <strong className="text-foreground">not</strong> registered as a charitable organization in any jurisdiction
          unless we state that in writing on the Platform.
        </p>
        <p>
          <strong className="text-foreground">Sponsor payments are not charitable donations.</strong> They are payments
          to Operator for Platform Services and for sponsor allocation into pools as described in these Terms. Unless we
          explicitly provide a qualified charitable receipt in your name, you must not treat any payment as tax-deductible
          or as a gift to a charity.
        </p>
        <p>
          <strong className="text-foreground">Contributor payouts</strong> are commercial benefits under the contributor
          program (for example, allocated shares of sponsor-funded pools), not wages, salary, or employment compensation
          from Operator unless a separate written agreement says otherwise.
        </p>
      </Section>

      <Section id="eligibility" title="4. Eligibility">
        <p>
          You must be at least the age of majority in your jurisdiction and able to enter a binding contract. If you use
          the Platform on behalf of an organization, you represent that you have authority to bind that organization.
        </p>
        <p>
          We may refuse service or close accounts that do not meet eligibility or verification requirements required by
          law or our payment partners.
        </p>
      </Section>

      <Section id="accounts" title="5. Accounts and authentication">
        <p>
          Accounts may be created or accessed through third-party identity providers (for example, GitHub via our
          authentication provider). You must provide accurate information and keep credentials secure. You are
          responsible for activity under your account.
        </p>
        <p>
          We may suspend or terminate accounts that violate these Terms, pose security risk, or are required by law or
          payment partners.
        </p>
      </Section>

      <Section id="sponsor-payments" title="6. Sponsor payments, fees, and taxes">
        <p>
          When you make a sponsor payment, you pay <strong className="text-foreground">Operator</strong>. Funds are
          credited to the applicable pool subject to successful payment processing. Operator retains a{" "}
          <strong className="text-foreground">platform fee</strong> (commission) on each sponsor-funded amount. Unless
          we notify you otherwise, the fee is calculated as follows (amounts are tracked in the smallest currency unit,
          e.g. cents or paise equivalents): a <strong className="text-foreground">percentage</strong> of each payment
          that depends on the size of the relevant pool (approximately <strong className="text-foreground">3%</strong>{" "}
          when the pool total is under about USD 1,000 equivalent, <strong className="text-foreground">2%</strong> when
          the pool is under about USD 10,000 equivalent, and <strong className="text-foreground">1%</strong> for larger
          pools), subject to a <strong className="text-foreground">minimum fee per payment</strong> (approximately USD
          0.50 equivalent) and never more than the sponsor payment itself. See also our{" "}
          <Link href="/enterprise" className="text-primary underline underline-offset-2">
            For enterprises
          </Link>{" "}
          page. Fees may change with reasonable notice where required by law.
        </p>
        <p>
          <strong className="text-foreground">Taxes.</strong> Sponsor payments may be subject to taxes depending on your
          jurisdiction and ours. You are responsible for any taxes applicable to you. We do not provide tax advice.
        </p>
        <p>
          <strong className="text-foreground">No refunds unless required.</strong> Sponsor payments are generally
          non-refundable once allocated, except where mandatory consumer rights apply or we elect to offer a refund in a
          specific case. Chargebacks and payment disputes may result in suspension or reversal of pool credits.
        </p>
      </Section>

      <Section id="pools" title="7. Pools, scoring, and allocation">
        <p>
          Pools run on schedules (for example, monthly collection and weekly distribution windows). Allocation among
          repositories and contributors uses <strong className="text-foreground">published rules</strong>, including
          scoring and eligibility criteria (see{" "}
          <Link href="/enterprise" className="text-primary underline underline-offset-2">
            For enterprises
          </Link>
          ). Rules may evolve; we will use reasonable efforts to keep descriptions accurate.
        </p>
        <p>
          Operator may adjust algorithms, weights, eligibility, or pool types to maintain integrity, comply with law, or
          respond to abuse. We do not guarantee a minimum distribution to any project or person.
        </p>
      </Section>

      <Section id="contributors" title="8. Contributor program and payouts">
        <p>
          Contributors may receive <strong className="text-foreground">Payouts</strong> from allocated pool funds when
          they meet eligibility requirements, complete any required verification (including Know Your Customer checks via
          payment partners), and provide valid payout details.
        </p>
        <p>
          Payouts may be subject to <strong className="text-foreground">minimum amounts</strong>, processing fees from
          third parties, delays, or holds for fraud prevention. If a payout cannot be completed (for example, failed
          verification or invalid bank details), funds may be forfeited or handled as we disclose in-product.
        </p>
        <p>
          <strong className="text-foreground">Taxes.</strong> Contributors are responsible for reporting and paying any
          taxes arising from payouts. Operator does not withhold taxes unless required by law.
        </p>
      </Section>

      <Section id="prohibited" title="9. Prohibited conduct">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Violate law or third-party rights.</li>
          <li>Misrepresent affiliation, identity, or the charitable nature of payments.</li>
          <li>Abuse, interfere with, or reverse-engineer the Platform (except as allowed by law).</li>
          <li>Use the Platform to launder money, defraud users, or circumvent payment rules.</li>
          <li>Scrape or overload our systems without permission.</li>
        </ul>
      </Section>

      <Section id="ip" title="10. Intellectual property">
        <p>
          The Platform, branding, and content we create are owned by Operator or its licensors. Open-source projects
          listed on the Platform remain under their respective licenses; listing does not transfer IP rights to Operator.
        </p>
        <p>
          You grant Operator a limited license to host, display, and process information you submit (for example, repo
          metadata and profile information) to operate the Services.
        </p>
      </Section>

      <Section id="third-parties" title="11. Third-party services">
        <p>
          The Platform relies on third parties, including hosting and authentication (for example,{" "}
          <strong className="text-foreground">Appwrite</strong>, which may process data in regions such as Singapore),
          <strong className="text-foreground"> GitHub</strong> for OAuth and repository data, and{" "}
          <strong className="text-foreground">payment processors</strong> authorized by Operator (for example Razorpay or
          other RBI-regulated aggregators in India, and such other providers as we enable for international cards or
          payouts). Their terms and privacy policies apply to your use of those services. We are not responsible for
          third-party failures beyond our reasonable control.
        </p>
      </Section>

      <Section id="disclaimers" title="12. Disclaimers">
        <p>
          THE PLATFORM AND SERVICES ARE PROVIDED <strong className="text-foreground">&quot;AS IS&quot;</strong> AND{" "}
          <strong className="text-foreground">&quot;AS AVAILABLE.&quot;</strong> TO THE MAXIMUM EXTENT PERMITTED BY LAW,
          WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
          AND NON-INFRINGEMENT.
        </p>
        <p>
          We do not guarantee any minimum earnings for Contributors, any specific ranking, or uninterrupted operation.
          Open-source software and third-party APIs may change or break; you use them at your own risk.
        </p>
      </Section>

      <Section id="liability" title="13. Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, OPERATOR AND ITS AFFILIATES WILL NOT BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL. OUR
          AGGREGATE LIABILITY FOR CLAIMS ARISING OUT OF THESE TERMS OR THE PLATFORM WILL NOT EXCEED THE GREATER OF (A)
          THE AMOUNT YOU PAID TO OPERATOR IN THE TWELVE (12) MONTHS BEFORE THE CLAIM OR (B) AN AMOUNT EQUIVALENT TO USD
          ONE HUNDRED (USD $100) IN INDIAN RUPEES AT A REASONABLE REFERENCE EXCHANGE RATE, EXCEPT WHERE LIABILITY CANNOT
          BE LIMITED BY LAW (INCLUDING APPLICABLE CONSUMER PROTECTION LAWS IN INDIA).
        </p>
        <p className="text-sm italic">
          Have counsel confirm caps and exclusions for India and any other country where you have users.
        </p>
      </Section>

      <Section id="indemnity" title="14. Indemnity">
        <p>
          You will indemnify and hold harmless Operator and its affiliates from claims, damages, and expenses (including
          reasonable legal fees) arising from your use of the Platform, your breach of these Terms, or your violation of
          law or third-party rights.
        </p>
      </Section>

      <Section id="termination" title="15. Termination">
        <p>
          You may stop using the Platform at any time. We may suspend or terminate access for violations, risk, legal
          requirements, or discontinuation of the Services. Provisions that by nature should survive (including Sections
          3, 10–14, 16–18) will survive termination.
        </p>
        <p>
          Termination does not remove obligations accrued before termination. Pending payouts may be completed or
          forfeited according to our rules and legal requirements.
        </p>
      </Section>

      <Section id="changes" title="16. Changes to these Terms">
        <p>
          We may update these Terms by posting a new version on this page and updating the &quot;Last updated&quot; date.
          Continued use after changes become effective constitutes acceptance, where allowed by law. If you do not agree,
          stop using the Platform.
        </p>
      </Section>

      <Section id="law" title="17. Governing law and disputes">
        <p>
          These Terms are governed by the laws of <strong className="text-foreground">{legal.governingLaw}</strong>,
          excluding conflict-of-law rules. Subject to mandatory laws, you agree that courts in{" "}
          <strong className="text-foreground">India</strong> shall have jurisdiction over disputes arising from these
          Terms or the Platform. Nothing in this Section limits any non-waivable rights you may have as a consumer.
        </p>
      </Section>

      <Section id="contact" title="18. Contact">
        <p>For questions about these Terms: {contactLine}</p>
        <p>
          Privacy requests: see our{" "}
          <Link href="/legal/privacy" className="text-primary underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
