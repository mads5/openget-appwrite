# OpenGet funding pool types

> **Site copy:** The [/enterprise](/enterprise) page embeds this material in `src/components/enterprise/pool-types-guide.tsx`. Edit both when definitions change.

OpenGet splits the monthly donation lifecycle into **four parallel pool types**. Each pool has its own balance, fee accounting, and weekly distribution run. Donors pick which pool to fund at checkout.

**Repo bifurcation:** A listed repository does **not** automatically participate in every pool. The nightly `fetch-contributors` job computes **`eligible_pool_types`** (JSON array on each `repos` document) using automatic rules below. Weekly `distribute-pool` only allocates a pool's budget to repos whose eligibility includes that pool's `pool_type`.

**Legacy:** If `eligible_pool_types` is missing or empty (pre-migration / first deploy), distribution treats the repo as eligible for **all** pools until the next successful nightly run writes JSON.

## Summary

| `pool_type` | Primary donors (intent) | What it optimizes for | Eligibility (automatic v1) |
|-------------|-------------------------|------------------------|----------------------------|
| `community_match` | Individuals, broad community backers | Broad participation | **All** listed repos |
| `innovation` | Grants, incubators | Early-stage / upside | Low `stars+forks`, or moderate criticality + recent `pushed_at` |
| `security_compliance` | Enterprise security and platform teams | Patch velocity and maintenance continuity | `SECURITY.md` present, or popularity + open-issues heuristic |
| `deep_deps` | Platform engineering | Foundational / fragile dependencies | Higher `criticality_score`, lower `bus_factor`, below mega-star cap |

## Scoring model (6-factor)

Contributors are scored using a **6-factor model** that rewards both code authorship and stewardship:

```
Score = (F1 * 0.15) + (F2 * 0.10 * merge_penalty) + (F3 * 0.40) + (F4 * 0.10) + (F5 * 0.15) + (F6 * 0.10)
```

| Factor | Weight | What it measures |
|--------|:------:|-----------------|
| **F1** Total contributions | 15% | Commits + merged PRs + reviews + issues closed (log-scaled) |
| **F2** PRs raised | 10% | Monthly PR activity, capped at 100. Penalized if merge ratio < 50% |
| **F3** PRs merged | **40%** | Monthly merged PRs — heaviest signal, capped at 80 |
| **F4** Qualified repos | 10% | Repos contributed to, excluding self-owned and low-quality |
| **F5** Review activity | 15% | PR reviews + review comments across repos (log-scaled, cap 200) |
| **F6** Release & triage | 10% | Release tags created + issues closed (log-scaled, cap 30) |

**Self-owned exclusion** applies only to F4 (breadth of contribution). Owners who actively review, merge, and release on their own repos earn F1–F3 and F5–F6 credit for that work.

## Enterprise value proposition

OpenGet helps companies reduce **patch velocity risk** (upstream patches reviewed faster when maintainers are funded), ensure **dependency continuity** (insurance against project abandonment), and fund at **ecosystem level** (one pool covers all relevant deps instead of managing individual contracts). See [/enterprise](/enterprise) for the full pitch.

## Environment variables (tuning)

Set on the **fetch-contributors** function (optional; defaults in parentheses):

| Variable | Role (default) |
|----------|----------------|
| `OPENGET_INNOVATION_MAX_POP` | Max `stars+forks` for innovation lane (200) |
| `OPENGET_INNOVATION_CRITICALITY_MAX` | Max criticality to count as "innovation-style" (0.55) |
| `OPENGET_INNOVATION_PUSH_MAX_DAYS` | Days since push for recency arm (120) |
| `OPENGET_SECURITY_MIN_POP` | Min popularity for security heuristic without SECURITY.md (50) |
| `OPENGET_SECURITY_MAX_OPEN_ISSUES` | Max open issues for that heuristic (800) |
| `OPENGET_DEEPDEPS_CRITICALITY_MIN` | Min criticality for deep_deps (0.42) |
| `OPENGET_DEEPDEPS_BUS_FACTOR_MAX` | Max bus factor for deep_deps (5) |
| `OPENGET_DEEPDEPS_MEGA_POP_MAX` | Exclude mega-popular repos (50000) |

Implementation: [`functions/fetch-contributors/src/pool-eligibility.js`](../functions/fetch-contributors/src/pool-eligibility.js) (keep in sync with [`functions/distribute-pool/src/pool-eligibility.js`](../functions/distribute-pool/src/pool-eligibility.js)).

## Eligibility (product rules)

- **Listing**: A GitHub repo is listed once; **pool eligibility** is derived automatically (no manual picker).
- **Payouts**: Contributors still need registered OpenGet + Stripe Express and a positive **contributor score** (6-factor model). Pool type does not change contributor scoring.
- **Governance**: Payouts are **never** tied to a donor picking specific PRs. Donors only choose **which pool** to fund; distribution is algorithmic. See [README](../README.md#governance).

## Donor targeting

- **Individuals** → default to `community_match` in the UI.
- **Enterprises** → typically `security_compliance` or `deep_deps` for patch velocity and supply-chain continuity.
- **Innovation / research** → `innovation`.

## Donor transparency

The donate page shows a live preview of which repos are in the selected pool type (top repos by stars, with language and license badges). This helps donors understand where their money will flow without requiring per-repo curation.

## Technical mapping

- Each `pool_type` has a separate Appwrite `pools` document per month (`round_start` / `round_end`).
- `repos.eligible_pool_types` stores `JSON.stringify(["community_match","innovation",...])`.
- `repos.has_security_md` caches whether `SECURITY.md` exists on the default branch.
- `repos.license` stores the SPDX license identifier from GitHub (e.g. `"MIT"`, `"Apache-2.0"`).
- Checkout sends `pool_id` (resolved from `pool_type` + current collecting round) in Stripe metadata.
- Weekly cron runs distribution **once per active pool** with a non-zero remaining balance, **filtering repos** by `eligible_pool_types`.

## Migration

Run `npm run db:sync` from the repo root after pulling to add new attributes (`license` on `repos`, `review_comments` and `releases_count` on `repo_contributions`). Deploy **fetch-contributors** and **distribute-pool** (and **openget-api**). Run fetch-contributors once to backfill eligibility, license, and stewardship metrics for existing repos.
