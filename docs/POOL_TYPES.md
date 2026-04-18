# OpenGet funding pool types

> **Site copy:** The [/enterprise](/enterprise) page embeds this material in `src/components/enterprise/pool-types-guide.tsx`. Edit both when definitions change.

OpenGet has **four pool types**. Each pool collects sponsor payments separately and pays out every week. When someone sponsors a pool, they choose which kind of work they want to support.

**Not every repo is in every pool:** OpenGet refreshes repo matching during the regular scoring run. Weekly payouts for a pool only go to repos that match that pool.

**Legacy:** If `eligible_pool_types` is missing or empty (pre-migration / first deploy), distribution treats the repo as eligible for **all** pools until the next successful nightly run writes JSON.

## Summary

| `pool_type` | Primary sponsors (intent) | What it optimizes for | Eligibility (automatic v1) |
|-------------|-------------------------|------------------------|----------------------------|
| `community_match` | Individuals, broad community backers | Broad participation | **All** listed repos |
| `innovation` | Grants, incubators | Early-stage / upside | Low `stars+forks`, or moderate criticality + recent `pushed_at` |
| `security_compliance` | Enterprise security and platform teams | Patch velocity and maintenance continuity | `SECURITY.md` present, or popularity + open-issues heuristic |
| `deep_deps` | Platform engineering | Foundational / fragile dependencies | Higher `criticality_score`, lower `bus_factor`, below mega-star cap |

## How scoring works

OpenGet uses a **6-factor score** so it can reward both people who write code and people who help keep projects running.

```
Score = (F1 * 0.15) + (F2 * 0.10 * merge_penalty) + (F3 * 0.40) + (F4 * 0.10) + (F5 * 0.15) + (F6 * 0.10)
```

| Factor | Weight | What it measures |
|--------|:------:|-----------------|
| **F1** Total contributions | 15% | Commits, merged PRs, reviews, and closed issues |
| **F2** PRs raised | 10% | How many PRs someone opened this month |
| **F3** PRs merged | **40%** | How many PRs were actually merged |
| **F4** Qualified repos | 10% | How many real repos they helped outside their own |
| **F5** Review activity | 15% | Reviews and review comments |
| **F6** Release & triage | 10% | Release work and issue handling |

**Important:** Repo owners are not blocked from earning. They still get credit for real work like merged PRs, reviews, releases, and issue work. The only thing excluded is using their own repo to increase the “number of repos helped” score.

## Why sponsors might like this

- **Individuals** can support open source without picking winners one by one.
- **Companies** can support the open-source work they depend on in a more organized way.
- **Maintainers and contributors** can be rewarded for real work, not just popularity.

## Environment variables (tuning)

Set on the **`openget-api`** function (optional; defaults in parentheses):

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

Implementation: [`functions/openget-api/src/pool-eligibility.js`](../functions/openget-api/src/pool-eligibility.js).

## Eligibility (product rules)

- **Listing**: A GitHub repo is listed once; **pool eligibility** is derived automatically (no manual picker).
- **Payouts**: Contributors still need registered OpenGet, completed payout onboarding with our payment partner, and a positive **contributor score** (6-factor model). Pool type does not change contributor scoring.
- **Governance**: Payouts are **never** tied to a sponsor picking specific PRs. Sponsors only choose **which pool** to fund; distribution is algorithmic. See [README](../README.md#governance).

## Who each pool is for

- **Individuals** → default to `community_match` in the UI.
- **Enterprises** → usually `security_compliance` or `deep_deps`.
- **Innovation / research** → `innovation`.

## Sponsor transparency

The sponsor page (`/donate`) shows a simple preview of repos in the selected pool type. This helps sponsors understand where their money is likely to go, without needing to review hundreds of repos manually.

## Technical notes

- Each `pool_type` has a separate Appwrite `pools` document per month (`round_start` / `round_end`).
- `repos.eligible_pool_types` stores `JSON.stringify(["community_match","innovation",...])`.
- `repos.has_security_md` caches whether `SECURITY.md` exists on the default branch.
- `repos.license` stores the SPDX license identifier from GitHub (e.g. `"MIT"`, `"Apache-2.0"`).
- Checkout creates a Razorpay order with `pool_id` / donation id in order `notes` (resolved from `pool_type` + current collecting round).
- Weekly GitHub Actions runs distribution **once per active pool** with a non-zero remaining balance, **filtering repos** by `eligible_pool_types`.

## Deployment notes

Run `npm run db:sync` from the repo root after pulling to add new attributes (`license` on `repos`, `review_comments` and `releases_count` on `repo_contributions`). Then deploy **`openget-api`**. After that, manually run the scoring workflow once if you want to backfill old repos right away.
