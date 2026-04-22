# OpenGet Project Brief (for Gemini)

Use this document as a high-context handoff so Gemini can reason about the codebase quickly and accurately.

## 1) What this project is

OpenGet is a Next.js + Appwrite **Trust-as-a-Service / Reputation Oracle** platform for:
- indexing open source repositories,
- **7-factor** Kinetic tier + percentile (raw scores in `internal_reputation` vault only; UI sees tier + GPS buckets),
- `openget.json` Guardian ingest (`ingest-openget-json`) and `repo_guardians` attestation,
- B2B `GET /api/enterprise/talent` and verification APIs without raw float leakage.

The system is split into:
- a Next.js App Router frontend (`src/app`),
- an Appwrite function router backend (`functions/openget-api`),
- Appwrite database collections (`openget-db`),
- operational scripts and GitHub Actions for deployment, schema sync, and scheduled jobs.

## 2) Tech stack and runtime

- Frontend: Next.js 14 App Router, React 18, TypeScript, Tailwind, Radix UI, Lucide.
- Backend logic: Appwrite Functions (Node.js), centralized in `functions/openget-api/src/main.js` with `scoring-engine.js`, `f7-entropy.js`.
- Data: Appwrite Databases (`openget-db`) and collections created/updated by `scripts/setup-database.js`.
- Integrations:
  - GitHub REST API (repo stats, contributors, issues/PR signals),
  - optional OpenAI summaries for repo pages.
- Deploy model:
  - frontend on Appwrite Sites,
  - function deployment via scripts/workflows,
  - schema sync via script/workflow.

## 3) High-level architecture

1. UI calls methods in `src/lib/api.ts`.
2. `src/lib/api.ts` either:
   - reads Appwrite DB directly (list/get pages), or
   - executes Appwrite Function `openget-api` with an action payload.
3. `openget-api` action router performs:
   - auth checks (when needed),
   - GitHub external calls,
   - Appwrite DB reads/writes.
4. UI renders normalized typed models from `src/types/index.ts`.
5. Scheduled workflows trigger periodic actions (e.g., contributor scoring refresh).

## 4) Key app routes

Main pages:
- `/` -> `src/app/page.tsx`
- `/repos` -> `src/app/repos/page.tsx`
- `/repos/[id]` -> `src/app/repos/[id]/page.tsx`
- `/contributors` -> `src/app/contributors/page.tsx`
- `/contributors/[id]` -> `src/app/contributors/[id]/page.tsx`
- `/list-repo` -> `src/app/list-repo/page.tsx`
- `/dashboard` -> `src/app/dashboard/page.tsx`
- `/enterprise` -> `src/app/enterprise/page.tsx`
- `/legal/terms` -> `src/app/legal/terms/page.tsx`
- `/legal/privacy` -> `src/app/legal/privacy/page.tsx`

Server route handlers:
- `GET /api/health` -> `src/app/api/health/route.ts`
- `GET /api/verify` -> `src/app/api/verify/route.ts` (tier + percentile, no raw score)
- `GET /api/badge/[username]` -> `src/app/api/badge/[username]/route.ts` (tier + percentile text)
- `GET /api/repos/[id]/summary` -> `src/app/api/repos/[id]/summary/route.ts`
- `GET /api/enterprise/talent` -> `src/app/api/enterprise/talent/route.ts` (B2B, `OPENGET_RECRUITMENT_API_KEY` or verify keys)

## 5) Backend function actions (`openget-api`)

Main router file: `functions/openget-api/src/main.js`

Notable actions include:
- `health` / `version`
- `list-repo`
- `delist-repo`
- `get-my-repos`
- `get-repo-contributors`
- `register-contributor`
- `fetch-contributors` (scoring/enrichment; ends with `recompute-percentiles` when a batch completes)
- `recompute-percentiles`
- `ingest-openget-json` (stewardship graph)
- `import-industry-repos`

Auth and protection patterns:
- Requires `x-appwrite-user-id` for sensitive actions (e.g., listing, registration, delist).
- `delist-repo` enforces owner-only behavior (`listed_by` match).
- `import-industry-repos` requires `OPENGET_INDUSTRY_IMPORT_SECRET`.

## 6) Data model (domain)

Core TypeScript domain contracts:
- `src/types/index.ts`

Major entities:
- `Repo`
- `Contributor`
- `ContributorDetail`
- `RepoContribution`
- `Pool`
- `Donation`
- `Payout`
- `PlatformFee`
- `WeeklyDistribution`
- `User`

Pool constants:
- `src/lib/pool-types.ts`

## 7) Appwrite database model

Central IDs:
- `src/lib/appwrite.ts`
  - `DATABASE_ID = openget-db`
  - collection IDs for repos, contributors, contributions, pools, etc.

Schema bootstrap/sync:
- `scripts/setup-database.js`

Important implementation detail:
- `repos.eligible_pool_types` is stored as JSON string in DB and parsed to string[] in frontend mapping (`src/lib/api.ts`).

## 8) Frontend API client contract

Main client layer:
- `src/lib/api.ts`

Patterns:
- Direct DB list/get for many read flows.
- Action-based function execution (`openget-api`) for writes/complex operations.
- Retry logic for transient function execution failures (`502/503/504`).

Important methods:
- Repo flows:
  - `listRepos`, `getRepo`, `listRepo`, `delistRepo`, `getRepoContributors`
- Contributor flows:
  - `listContributors`, `getContributor`, `getMyContributor`, `registerContributor`
- User GitHub repos:
  - `getMyGithubRepos`
- Enterprise:
  - `runDependencyAudit`
- Stats:
  - `getStats`

## 9) Next.js server helpers and AI summary

- `src/lib/appwrite-server.ts`
  - server-side Appwrite REST calls with `APPWRITE_API_KEY`
  - helper lookup/patch operations
- `src/lib/repo-ai-summary.ts`
  - optional OpenAI-powered repo summary + fallback summary generation
- `src/app/api/repos/[id]/summary/route.ts`
  - cache-aware summary endpoint (uses/stores `ai_summary`)

## 10) Environment variables

Reference template:
- `.env.example`

Common variables:
- Appwrite: `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`
- Next public: `NEXT_PUBLIC_APPWRITE_ENDPOINT`, `NEXT_PUBLIC_APPWRITE_PROJECT_ID`
- GitHub: `GITHUB_TOKEN`
- OpenGet controls:
  - `OPENGET_VERIFY_API_KEYS`
  - `OPENGET_INDUSTRY_IMPORT_SECRET`
  - `OPENGET_ACTION`, `OPENGET_FUNCTION_ID`, `OPENGET_BATCH_SIZE`, etc. for script-driven actions
- OpenAI (optional): `OPENAI_API_KEY`
- Site/legal metadata: `NEXT_PUBLIC_SITE_URL`, legal contact vars

## 11) Scripts and operations

Root scripts (`package.json`):
- `npm run dev`
- `npm run build`
- `npm start`
- `npm run lint`
- `npm run db:sync`
- `npm run deploy:api`
- `npm run backfill:contributors`
- `npm run seed:industry`
- `npm run mobile:test`

Operational scripts (`scripts/`):
- `setup-database.js` (idempotent schema sync)
- `deploy-functions.js`
- `deploy-single-function.js`
- `run-openget-action.js`
- `backfill-repo-contributors.js`
- `seed-industry-repos.mjs`

## 12) CI/CD workflows

- `.github/workflows/deploy-appwrite-functions.yml`
  - deploys functions on push/manual (default target: `openget-api`)
- `.github/workflows/sync-appwrite-schema.yml`
  - runs DB schema sync on push/manual
- `.github/workflows/openget-nightly-scoring.yml`
  - nightly `fetch-contributors` action run
- `.github/workflows/openget-weekly-distribution.yml`
  - intentionally disabled (`if: false`)

## 13) Current product/ops caveats

- Frontend deploy previews do not deploy backend functions or mutate DB schema.
- Some old standalone functions still exist but central behavior is routed via `openget-api`.
- If API action errors with unknown action, backend function deployment can be stale.
- Verify/badge endpoints depend on server-side `APPWRITE_API_KEY` availability.
- Payment-related Stripe-named functions are currently deprecated stubs.

## 14) Practical mental model for Gemini

When answering questions or proposing changes, Gemini should:
1. Treat `functions/openget-api/src/main.js` as the primary backend behavior source.
2. Treat `src/lib/api.ts` as the frontend-to-backend contract hub.
3. Treat `src/types/index.ts` as domain truth for frontend models.
4. Check `scripts/setup-database.js` before any schema assumptions.
5. Validate deployment impact separately for:
   - frontend (Next.js/Appwrite Sites),
   - backend functions (`openget-api` deploy),
   - database schema sync.

## 15) Prompt you can paste into Gemini

You are helping on the OpenGet codebase (Next.js + Appwrite).

Use this architecture context as ground truth:
- Frontend routes are in src/app/*
- Frontend API contracts are in src/lib/api.ts
- Domain types are in src/types/index.ts
- Main backend logic is in functions/openget-api/src/main.js (action router)
- Appwrite DB schema assumptions come from scripts/setup-database.js
- Server-side helper routes are in src/app/api/*

Behavior notes:
- Sensitive backend actions require user context; owner checks exist for delist.
- AI repo summaries are optional/cached.
- Nightly contributor refresh exists via workflow.

When proposing fixes:
1) identify exact files and symbols,
2) preserve current action-based API contracts,
3) call out if change needs function redeploy, schema sync, or frontend-only deploy,
4) provide test/verification steps for each changed path.
