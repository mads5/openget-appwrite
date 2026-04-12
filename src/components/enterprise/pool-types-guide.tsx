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
    donors: "Individuals, small sponsors, QF-style matching",
    optimizes: "Broad participation and democratic signal",
    eligibility: "Every listed repo (always included).",
  },
  {
    id: "innovation",
    donors: "Grants, incubators, retroactive-style backers",
    optimizes: "Early-stage and high-upside projects",
    eligibility:
      "Automatic: low stars+forks, or moderate criticality with recent activity (tunable via env).",
  },
  {
    id: "security_compliance",
    donors: "Enterprise security / GRC / compliance budgets",
    optimizes: "Mature maintenance, security posture",
    eligibility:
      "Automatic: SECURITY.md on default branch, or popularity/issue-count heuristics.",
  },
  {
    id: "deep_deps",
    donors: "Platform engineering, foundations",
    optimizes: "Foundational / fragile stack",
    eligibility:
      "Automatic: higher criticality score + lower bus factor + below mega-star cap (tunable via env).",
  },
];

export function PoolTypesGuide() {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Funding pool types</h2>
        <p className="text-muted-foreground mt-3 leading-relaxed">
          OpenGet runs <strong className="text-foreground font-medium">four parallel pools</strong> per month. Each
          pool has its own balance and weekly distribution run. When you donate, you pick a pool to match your
          narrative (e.g. compliance vs. community).
        </p>
        <p className="text-muted-foreground mt-3 leading-relaxed">
          <strong className="text-foreground font-medium">Repos do not all receive every pool.</strong> Each listed
          repository gets an automatic <span className="font-mono text-xs">eligible_pool_types</span> set by the nightly
          GitHub job (stars, forks, criticality, bus factor, SECURITY.md, recency). Weekly payouts for pool{" "}
          <span className="font-mono text-xs">T</span> only flow to repos that include <span className="font-mono text-xs">T</span>{" "}
          in that set. Contributor scoring (4-factor) is unchanged; only which pool&apos;s budget a repo can share is
          filtered.
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
            when the nightly job runs. Missing data (pre-migration) falls back to participating in all pools until the
            first successful run stores JSON eligibility.
          </li>
          <li>
            <span className="text-foreground">Contributors</span>: Must register, connect payouts, and meet the public{" "}
            <strong className="text-foreground font-normal">4-factor score</strong>. Pool choice does not change that
            score.
          </li>
          <li>
            <span className="text-foreground">Governance</span>: Donors cannot direct money to specific PRs—only to a
            pool. Distribution within that pool is algorithmic. See the project README (Governance section).
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
            <span className="font-mono text-xs text-primary">deep_deps</span> for risk and supply-chain narratives.
          </li>
          <li>
            <span className="text-foreground">Innovation / research</span> →{" "}
            <span className="font-mono text-xs text-primary">innovation</span>.
          </li>
        </ul>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/50 pt-4">
        Thresholds are configurable with environment variables on the fetch-contributors function (see{" "}
        <span className="font-mono">docs/POOL_TYPES.md</span>). Canonical spec lives in that file—keep it aligned with
        this page.
      </p>
    </section>
  );
}
