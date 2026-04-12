# OpenGet funding pool types

OpenGet splits the monthly donation lifecycle into **four parallel pool types**. Each pool has its own balance, fee accounting, and weekly distribution run. Donors pick which pool to fund at checkout.

This matches the strategic split in the sustainability research: different capital sources and eligibility stories map to different pool purposes—not only “repo size bands.”

## Summary

| `pool_type` | Primary donors (intent) | What it optimizes for | Distribution notes (v1) |
|-------------|-------------------------|------------------------|---------------------------|
| `innovation` | Grants, incubators, retroactive-style backers | Early-stage and high-upside projects | Same algorithmic split across listed repos; future: RPGF-style rounds |
| `security_compliance` | Enterprise security / GRC / compliance budgets | Mature maintenance, security posture | Same split; future: conditional on `SECURITY.md`, Scorecard, etc. |
| `deep_deps` | Platform engineering, foundations | Transitive / foundational dependencies | Same split today; future: dependency-graph propagation |
| `community_match` | Individuals, small sponsors, QF-style matching | Broad participation and democratic signal | Same split; future: quadratic matching layer |

## Eligibility (product rules)

- **Listing**: A GitHub repo is listed once; it participates in **every** active pool’s weekly split for that month (v1). Pool-specific repo filters can be added later (e.g. only certain tiers in `security_compliance`).
- **Payouts**: Contributors still need registered OpenGet + Stripe Express and a positive **contributor score** (4-factor model). Pool type does not change contributor scoring in v1.
- **Governance**: Payouts are **never** tied to a donor picking specific PRs. Donors only choose **which pool** to fund; distribution is algorithmic. See [README](../README.md#governance).

## Donor targeting

- **Individuals** → default to `community_match` in the UI (aligned with small donations and matching narratives).
- **Enterprises** → typically `security_compliance` or `deep_deps` (risk and supply-chain framing).
- **Innovation / research** → `innovation`.

## Technical mapping

- Each `pool_type` has a separate Appwrite `pools` document per month (`round_start` / `round_end`).
- Checkout sends `pool_id` (resolved from `pool_type` + current collecting round) in Stripe metadata.
- Weekly cron runs distribution **once per active pool** with a non-zero remaining balance.

## Migration

Existing pools without `pool_type` are treated as legacy. New collecting rounds create **four** documents (one per type). Run `npm run db:sync` from the repo root after pulling to add schema fields.
