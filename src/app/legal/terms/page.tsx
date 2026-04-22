import type { Metadata } from "next";
import Link from "next/link";
import { getLegalInfo } from "@/lib/legal-info";

export const metadata: Metadata = {
  title: "Terms of Service | OpenGet",
  description:
    "Terms of Service for OpenGet — Human Verification, stewardship signals, and B2B verification APIs (not a substitute for your own interview process).",
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
      <>Configure NEXT_PUBLIC_LEGAL_CONTACT_EMAIL for contact details.</>
    );

  return (
    <div className="container py-10 max-w-3xl mx-auto space-y-10">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: April 23, 2026</p>
        <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-sm text-muted-foreground leading-relaxed">
          OpenGet provides <strong className="text-foreground">software and data services</strong> for Human Verification
          and open-source stewardship signals: Kinetic tier, percentiles, public profiles, verification and badge APIs,
          optional B2B talent endpoints, and Guardian attestation. These Terms are not legal or tax advice.
        </div>
      </div>

      <Section id="intro" title="1. Agreement and operator">
        <p>
          These Terms govern your use of the websites, applications, and services offered as OpenGet (the &quot;
          <strong className="text-foreground">Platform</strong>
          &quot;) by <strong className="text-foreground">{legal.entityName}</strong> (&quot;Operator,&quot; &quot;we,&quot; &quot;us&quot;). Address: {legal.address}
        </p>
        <p>
          By using the Platform (including {legal.siteUrl}), you agree to these Terms. The Platform is operated from{" "}
          <strong className="text-foreground">India</strong> unless we state otherwise. If you do not agree, do not use
          the Platform.
        </p>
      </Section>

      <Section id="services" title="2. The Services">
        <p>
          <strong className="text-foreground">Reputation and scoring.</strong> We compute and display signals derived from
          public open-source activity (for example, merged work, review, and triage) for repositories and contributors
          you list or that we index, using rules published in our documentation. Scores are{" "}
          <strong className="text-foreground">heuristic</strong> — not an endorsement, certification, or guarantee of
          hireability, security, or fitness for a particular use.
        </p>
        <p>
          <strong className="text-foreground">APIs and badges.</strong> We may offer HTTP endpoints (for example, JSON
          verification or SVG images) for integrating OpenGet signals. Access may require keys, rate limits, or
          commercial terms as we publish.
        </p>
        <p>
          <strong className="text-foreground">Nature of the Platform.</strong> Operator is{" "}
          <strong className="text-foreground">not</strong> a bank, payment institution, or escrow service. The Platform
          is a software and analytics product. If we offer commercial plans (for example, enterprise software), their
          terms and checkout flow will be presented separately; nothing in this document obligates a particular product
          or price.
        </p>
      </Section>

      <Section id="recruiting" title="3. Recruiting, interviews, and technical assessment">
        <p>
          If you use the Platform to discover or shortlist people (for example, via talent listings or B2B APIs), you
          remain solely responsible for your hiring and interview process. OpenGet signals are{" "}
          <strong className="text-foreground">heuristic and informational</strong> — not an employment test, job
          offer, or certification of a candidate’s overall suitability.
        </p>
        <p>
          <strong className="text-foreground">If you source a candidate for an interview through OpenGet, you will
            assess that candidate in your own interview process on <em>logic and problem-solving skills only</em> —
            not on OpenGet tier, percentile, or any other Platform output as a substitute for a proper technical
            interview.</strong> You must not treat those signals as a complete or sufficient evaluation of a candidate,
          and you must comply with applicable employment and anti-discrimination laws in your jurisdiction.
        </p>
        <p>
          <strong className="text-foreground">OpenGet Shield</strong> (if offered) is an{" "}
          <strong className="text-foreground">optional</strong> timed exercise with automated solution checks plus{" "}
          <strong className="text-foreground">lightweight session rules</strong> (for example: no paste in the answer
          field, optional fullscreen — including prompts if fullscreen ends, for example with the Escape key — optional
          in-browser camera/microphone preview that stays on your device and is{" "}
          <strong className="text-foreground">not</strong> recorded or uploaded by us, and server-side limits when the
          browser tab is backgrounded). It is <strong className="text-foreground">not</strong> certified webcam or
          identity proctoring, does not record your screen to our servers, and{" "}
          <strong className="text-foreground">cannot</strong> guarantee that no assistive tools or separate devices were
          used. It is <strong className="text-foreground">not</strong> a substitute for your own interviews. Shield
          results are separate from Kinetic tier and percentile.
        </p>
      </Section>

      <Section id="accounts" title="4. Accounts and acceptable use">
        <p>
          You may authenticate via third parties (for example, GitHub through Appwrite). You are responsible for
          account security and for activity under your account. You must not abuse the Platform, misrepresent
          identity, overload systems, or use scores to defraud, harass, or discriminate in violation of law.
        </p>
      </Section>

      <Section id="ip" title="5. Third-party data and IP">
        <p>
          Open-source projects remain under their licenses. We process GitHub and similar data under their terms and
          public APIs. Our branding, UI, and generated reports are owned by Operator or its licensors, subject to any
          open content we expressly license.
        </p>
      </Section>

      <Section id="third-parties" title="6. Subprocessors">
        <p>
          The Platform uses infrastructure and identity providers (for example, <strong>Appwrite</strong> and{" "}
          <strong>GitHub</strong>). Their terms and privacy policies apply to those services. Our hosting and database
          region may be outside your country; see the Privacy Policy.
        </p>
      </Section>

      <Section id="disclaimers" title="7. Disclaimers">
        <p>
          THE PLATFORM IS PROVIDED <strong className="text-foreground">&quot;AS IS&quot;</strong> AND{" "}
          <strong className="text-foreground">&quot;AS AVAILABLE.&quot;</strong> WE DISCLAIM WARRANTIES TO THE MAXIMUM
          EXTENT PERMITTED BY LAW, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
          NON-INFRINGEMENT. WE DO NOT WARRANT THAT SCORES ARE ERROR-FREE, COMPLETE, OR SUITABLE FOR REGULATORY,
          COMPLIANCE, OR INSURANCE DECISIONS WITHOUT INDEPENDENT REVIEW.
        </p>
      </Section>

      <Section id="liability" title="8. Limitation of liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, OPERATOR AND ITS AFFILIATES WILL NOT BE LIABLE FOR INDIRECT, SPECIAL,
          CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL. OUR AGGREGATE LIABILITY FOR
          CLAIMS ARISING FROM THESE TERMS OR THE PLATFORM IN ANY TWELVE-MONTH PERIOD IS LIMITED TO THE AMOUNT YOU PAID
          OPERATOR FOR THE PLATFORM IN THAT PERIOD, OR (IF NONE) A NOMINAL CAP CONSISTENT WITH APPLICABLE INDIAN
          CONSUMER LAW — WHICHEVER IS HIGHER WHERE REQUIRED. SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS.
        </p>
      </Section>

      <Section id="indemnity" title="9. Indemnity">
        <p>
          You will defend and indemnify Operator against claims arising from your misuse of the Platform, your content,
          or your violation of these Terms or third-party rights, except to the extent caused by our gross negligence
          or willful misconduct.
        </p>
      </Section>

      <Section id="changes" title="10. Changes">
        <p>
          We may update these Terms by posting a new &quot;Last updated&quot; date. Continued use may constitute
          acceptance where permitted by law.
        </p>
      </Section>

      <Section id="law" title="11. Governing law">
        <p>
          These Terms are governed by the laws of <strong className="text-foreground">{legal.governingLaw}</strong>,
          subject to non-waivable rights. Courts in <strong>India</strong> shall have non-exclusive jurisdiction where
          permitted.
        </p>
      </Section>

      <Section id="contact" title="12. Contact">
        <p>{contactLine}</p>
        <p>
          <Link href="/legal/privacy" className="text-primary underline underline-offset-2">
            Privacy Policy
          </Link>
        </p>
      </Section>
    </div>
  );
}
