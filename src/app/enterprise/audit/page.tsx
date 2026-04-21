import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/site/page-header";
import { Button } from "@/components/ui/button";

/**
 * B2B Human-Risk / dependency audit (MVP shell).
 * Full upload + npm maintainer graph: openget-api `audit-dependencies` + rate limits.
 */
export default function EnterpriseAuditPage() {
  return (
    <div>
      <PageHeader
        title="Supply-chain Human-Risk audit"
        description={
          <>
            Map dependencies to the maintainers OpenGet already scores—bus factor and stewardship in one place.{" "}
            <span className="text-amber-200/90">MVP: UI shell; file upload and full resolver ship next.</span>
          </>
        }
      />
      <div className="container max-w-3xl py-8 space-y-8">
        <Card className="og-glass border-border/50">
          <CardHeader>
            <CardTitle>What&apos;s next</CardTitle>
            <CardDescription>
              Upload a <code className="text-xs font-mono">package.json</code> or lockfile, resolve to GitHub
              identities, and print a Human-Risk report from the same 6-factor data as the public leaderboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-4">
            <p>Planned: organization accounts, report export, and API access with counsel-reviewed terms.</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="default">
                <Link href="/enterprise">For enterprises</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Home</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
