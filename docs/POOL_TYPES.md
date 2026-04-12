# OpenGet funding pool types

> **Site copy:** The [/enterprise](/enterprise) page embeds this material in `src/components/enterprise/pool-types-guide.tsx`. Edit both when definitions change.

OpenGet splits the monthly donation lifecycle into **four parallel pool types**. Each pool has its own balance, fee accounting, and weekly distribution run. Donors pick which pool to fund at checkout.

**Repo bifurcation:** A listed repository does **not** automatically participate in every pool. The nightly `fetch-contributors` job computes **`eligible_pool_types`** (JSON array on each `repos` document) using automatic rules below. Weekly `distribute-pool` only allocates a pool’s budget to repos whose eligibility includes that pool’s `pool_type`.

**Legacy:** If `eligible_pool_types` is missing or empty (pre-migration / first deploy), distribution treats the repo as eligible for **all** pools until the next successful nightly run writes JSON.

## Summary

| `pool_type` | Primary donors (intent) | What it optimizes for | Eligibility (automatic v1) |
|-------------|-------------------------|------------------------|----------------------------|
| `community_match` | Individuals, small sponsors | Broad participation | **All** listed repos |
| `innovation` | Grants, incubators | Early-stage / upside | Low `stars+forks`, or moderate criticality + recent `pushed_at` |
| `security_compliance` | Enterprise GRC / compliance | Mature maintenance | `SECURITY.md` present, or popularity + open-issues heuristic |
| `deep_deps` | Platform engineering | Foundational / fragile | Higher `criticality_score`, lower `bus_factor`, below mega-star cap |

## Environment variables (tuning)

Set on the **fetch-contributors** function (optional; defaults in parentheses):

| Variable | Role (default) |
|----------|----------------|
| `OPENGET_INNOVATION_MAX_POP` | Max `stars+forks` for innovation lane (200) |
| `OPENGET_INNOVATION_CRITICALITY_MAX` | Max criticality to count as “innovation-style” (0.55) |
| `OPENGET_INNOVATION_PUSH_MAX_DAYS` | Days since push for recency arm (120) |
| `OPENGET_SECURITY_MIN_POP` | Min popularity for security heuristic without SECURITY.md (50) |
| `OPENGET_SECURITY_MAX_OPEN_ISSUES` | Max open issues for that heuristic (800) |
| `OPENGET_DEEPDEPS_CRITICALITY_MIN` | Min criticality for deep_deps (0.42) |
| `OPENGET_DEEPDEPS_BUS_FACTOR_MAX` | Max bus factor for deep_deps (5) |
| `OPENGET_DEEPDEPS_MEGA_POP_MAX` | Exclude mega-popular repos (50000) |

Implementation: [`functions/fetch-contributors/src/pool-eligibility.js`](../functions/fetch-contributors/src/pool-eligibility.js) (keep in sync with [`functions/distribute-pool/src/pool-eligibility.js`](../functions/distribute-pool/src/pool-eligibility.js)).

## Eligibility (product rules)

- **Listing**: A GitHub repo is listed once; **pool eligibility** is derived automatically (no manual picker).
- **Payouts**: Contributors still need registered OpenGet + Stripe Express and a positive **contributor score** (4-factor model). Pool type does not change contributor scoring.
- **Governance**: Payouts are **never** tied to a donor picking specific PRs. Donors only choose **which pool** to fund; distribution is algorithmic. See [README](../README.md#governance).

## Donor targeting

- **Individuals** → default to `community_match` in the UI.
- **Enterprises** → typically `security_compliance` or `deep_deps`.
- **Innovation / research** → `innovation`.

## Technical mapping

- Each `pool_type` has a separate Appwrite `pools` document per month (`round_start` / `round_end`).
- `repos.eligible_pool_types` stores `JSON.stringify(["community_match","innovation",...])`.
- `repos.has_security_md` caches whether `SECURITY.md` exists on the default branch.
- Checkout sends `pool_id` (resolved from `pool_type` + current collecting round) in Stripe metadata.
- Weekly cron runs distribution **once per active pool** with a non-zero remaining balance, **filtering repos** by `eligible_pool_types`.

## Migration

Run `npm run db:sync` from the repo root after pulling to add `eligible_pool_types` and `has_security_md` on `repos`. Deploy **fetch-contributors** and **distribute-pool** (and **openget-api**). Run fetch-contributors once to backfill eligibility for existing repos.
