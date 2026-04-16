import { POOL_TYPE_LABELS, type PoolTypeId } from "@/lib/pool-types";

/**
 * On-page copy aligned with docs/POOL_TYPES.md — update both when definitions change.
 */
const ROWS: {
  id: PoolTypeId;
  donors: string;
  optimizes: string;
  eligibility: string;
}[] = [
  {
    id: "community_match",
    donors: "Individuals, small sponsors, broad community backers",
    optimizes: "Broad participation across all listed repos",
    eligibility: "Every listed repo (always included).",
  },
  {
    id: "innovation",
    donors: "People who want to help newer projects",
    optimizes: "Early-stage projects with growth potential",
    eligibility:
      "Usually smaller projects, or projects that are active and still growing.",
  },
  {
    id: "security_compliance",
    donors: "Teams focused on safety and stability",
    optimizes: "Projects that need regular maintenance and security care",
    eligibility:
      "Projects with SECURITY.md, or projects that look mature and actively maintained.",
  },
  {
    id: "deep_deps",
    donors: "Donors who want to support core building blocks",
    optimizes: "Important dependencies that many other projects rely on",
    eligibility:
      "Projects that look important, but may rely on only a small number of maintainers.",
  },
];

export function PoolTypesGuide() {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Funding pool types</h2>
        <p className="text-muted-foreground mt-3 leading-relaxed">
          OpenGet runs <strong className="text-foreground font-medium">four parallel pools</strong> per month. Each
          pool has its own balance and weekly payout run. When you donate, you pick the kind of work you want
          to support.
        </p>
        <p className="text-muted-foreground mt-3 leading-relaxed">
          <strong className="text-foreground font-medium">Repos do not all receive every pool.</strong> Each listed
          repository is placed into pool types automatically by OpenGet. That means money from one pool only goes
          to repos that match that pool. Contributor scoring uses a{" "}
          <strong className="text-foreground font-normal">6-factor model</strong> that rewards coding, reviewing,
          releases, and issue work.
        </p>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="p-3 font-medium whitespace-nowrap">Pool</th>
                <th className="p-3 font-medium min-w-[10rem]">Typical donors</th>
                <th className="p-3 font-medium min-w-[10rem]">What it optimizes for</th>
                <th className="p-3 font-medium min-w-[12rem]">Automatic eligibility (v1)</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.id} className="border-b border-border/60 last:border-0">
                  <td className="p-3 align-top">
                    <span className="font-mono text-xs text-primary">{row.id}</span>
                    <div className="text-foreground mt-0.5">{POOL_TYPE_LABELS[row.id]}</div>
                  </td>
                  <td className="p-3 text-muted-foreground align-top">{row.donors}</td>
                  <td className="p-3 text-muted-foreground align-top">{row.optimizes}</td>
                  <td className="p-3 text-muted-foreground align-top">{row.eligibility}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-medium">Who gets paid</h3>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
          <li>
            <span className="text-foreground">Repos</span>: Listed once on OpenGet; eligibility per pool is recomputed
            during the regular scoring run.
          </li>
          <li>
            <span className="text-foreground">Contributors and maintainers</span>: Must register, connect payouts, and
            meet the public <strong className="text-foreground font-normal">6-factor score</strong>. In simple terms,
            OpenGet rewards real work: merged PRs, reviews, releases, issue work, and steady contribution over time.
          </li>
          <li>
            <span className="text-foreground">Governance</span>: Donors cannot direct money to specific PRs&mdash;only
            to a pool. OpenGet then shares the money using public rules.
          </li>
        </ul>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-medium">Which pool should I donate to?</h3>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">
          <li>
            <span className="text-foreground">Individuals</span> → usually{" "}
            <span className="font-mono text-xs text-primary">community_match</span> (default on Donate).
          </li>
          <li>
            <span className="text-foreground">Enterprises</span> → often{" "}
            <span className="font-mono text-xs text-primary">security_compliance</span> or{" "}
            <span className="font-mono text-xs text-primary">deep_deps</span>.
          </li>
          <li>
            <span className="text-foreground">Innovation / research</span> →{" "}
            <span className="font-mono text-xs text-primary">innovation</span>.
          </li>
        </ul>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/50 pt-4">
        Pool matching is automatic. Donors do not need to review repos one by one.
      </p>
    </section>
  );
}
