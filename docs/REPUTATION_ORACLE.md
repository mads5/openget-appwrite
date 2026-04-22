# Reputation Oracle — scope decisions (v1)

This document locks product and technical decisions for the Trust-as-a-Service / Kinetic tier pivot. **Do not edit** the plan file; update this file when rules change.

## Enterprise surfaces

- The **npm → GitHub → OpenGet package audit** product surface and `audit-dependencies` action have been **removed** from the codebase.
- **Raw `openget_total_score` is never returned to clients** on supported surfaces. Public views expose **Kinetic tier**, **percentile band**, and **attestation** status (and GPS-style factor bands where applicable), matching the public projection model.

## F7 (Manual Entropy) feasibility

- **Primary signal:** Inter-commit timing entropy and burstiness from a **sampled** list of commits (GitHub API, bounded page count) per contributor+repo, merged with a **lightweight complexity proxy** (e.g. lines in touched files where available) vs time.
- **Fallback:** If GitHub data is missing or rate-limited, F7 uses a **neutral prior** (mid-range normalized value) so scoring still runs.

## Kinetic tier cut rules (global percentile)

Percentiles are **0–100** (higher = stronger stewardship). Tiers (by `percentile_global` after each scoring run, stored as projection only in public surfaces):

| Tier        | Percentile range (0–100) |
|------------|---------------------------|
| Spark      | 0 up to (but not including) 15 |
| Current    | 15 up to 40               |
| Kinetic    | 40 up to 65               |
| Reactor    | 65 up to 85               |
| Fusion     | 85 up to 97               |
| Singularity| 97 through 100            |

**Engine version:** `2` (see `app_meta.schema_version` and `internal_reputation.engine_version`).

## Adversarial noise

- **Deterministic** noise derived from HMAC(contributor_id + month bucket + `OPENGET_SCORE_SALT` or a fixed app secret in env) so the same user gets stable within-version results while regression on raw internal weights is harder.
- Applied **after** raw linear combination, **before** vault persistence.

## 7-factor formula (public documentation)

The internal engine implements:

`Score = (F1×0.10) + (F2×0.05×penalty) + (F3×0.35) + (F4×0.10) + (F5×0.15) + (F6×0.20) + (F7×0.05)`

- **F1–F6** are normalized 0–1 strength signals (same spirit as the previous model, with F7 added).
- **penalty** on F2: merge ratio penalty when `prsRaised > 5` (same thresholds as v1, tunable).
- **Dynamic weighting:** Per-repo contribution rows are scaled by `repo.criticality_score` (or a default) before aggregation.

Raw `Score` never leaves the vault; UI sees **tier**, **percentile**, and **coarse factor buckets (GPS)**.
