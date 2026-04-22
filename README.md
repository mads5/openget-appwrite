<p align="center">
  <img src="public/logo.png" alt="OpenGet Logo" width="120" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/Appwrite-Cloud-F02E65?style=for-the-badge&logo=appwrite&logoColor=white" alt="Appwrite" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind" />
</p>

<h1 align="center">OpenGet</h1>
<h3 align="center">The Human Verification Layer for the AI-Code Era</h3>

<p align="center">
  <strong>Trust-as-a-Service:</strong> 7-factor <strong>Kinetic</strong> tiers, percentile rank, GPS-style factor guidance, SVG badges, and
  optional B2B talent and verification APIs. Internals in <code>internal_reputation</code> (vault). See <code>CONTEXT.md</code> and <code>docs/REPUTATION_ORACLE.md</code>.
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> &bull;
  <a href="#-how-it-works">How It Works</a> &bull;
  <a href="#-scoring-formula">Scoring</a> &bull;
  <a href="#-environment-variables">Config</a> &bull;
  <a href="#-architecture">Architecture</a> &bull;
  <a href="#-for-enterprises">For enterprises</a>
</p>

---

## The problem

When AI can generate code at near-zero cost, the scarce signal is **human** judgment: who merges, reviews, and maintains critical dependencies.

## The solution

OpenGet is a **reputation and open-source stewardship** data platform. The **7-factor engine** (plus **F7** human-rhythm entropy) with **repo criticality weighting** powers **Kinetic tier + percentile** on **public leaderboards** (raw scores stay server-side), **embeddable badges** (`/api/badge/{username}`) showing tier and percentile, **verification JSON** (`/api/verify` returns tier/percentile, not raw floats), **B2B talent** (`GET /api/enterprise/talent` with API key), and **Guardian attestation** via `openget.json` ingest. See **`docs/REPUTATION_ORACLE.md`** for tier cut rules and engine v2.

**Web UI (v2):** **Outfit** + **JetBrains Mono** (see `src/lib/fonts.ts`), teal-forward theme (`globals.css`), shared `PageHeader` layout, and `/api/health` for the Next app. The **`openget-api`** function exposes `?action=health` / `?action=version` and reads optional **`app_meta.schema_version`** after `db:sync`.

---

## How it works

| Step | What happens |
|------|----------------|
| **1. List** | Sign in with GitHub, pick a repo. OpenGet discovers contributors and runs the **7-factor** + vault pipeline (nightly `fetch-contributors`). |
| **2. Claim** | Register your handle so the leaderboard and **badge** reflect verified stewardship (Kinetic tier + percentile). |
| **3. Prove** | **/api/badge/`{github}`** (SVG), **/api/verify?user=`** (JSON), optional `OPENGET_VERIFY_API_KEYS` / `OPENGET_RECRUITMENT_API_KEY` for B2B. |
| **4. Enterprise** | **/enterprise** — product overview; **/api/enterprise/talent** — filtered contributor list (API key). |

---

## Scoring Formula (engine v2)

Contributors are evaluated with a **7-factor** model; **raw linear combinations** and vault scores live in **`internal_reputation`** only. The UI and public APIs receive **Kinetic tier** (Spark → Singularity), **global percentile (0–100)**, and **GPS** coarse factor buckets (1–5) — see `functions/openget-api/src/scoring-engine.js` and `docs/REPUTATION_ORACLE.md`.

```
Score = (F1*0.10) + (F2*0.05*merge_penalty) + (F3*0.35) + (F4*0.10) + (F5*0.15) + (F6*0.20) + (F7*0.05)
```

| Factor | Weight | Role |
|--------|:------:|------|
| **F1** Activity | 10% | Normalized total contribution signal (criticality-weighted aggregation) |
| **F2** PRs raised | 5% (× penalty) | Merge-ratio penalty on spammy open/merge patterns |
| **F3** Merged work | **35%** | Primary merged PR signal |
| **F4** Repo breadth | 10% | Qualified repo spread |
| **F5** Review | 15% | Reviews and review comments |
| **F6** Triage / releases | 20% | Releases and triage |
| **F7** Entropy | 5% | Human rhythm from recent commits (`f7-entropy.js`) |

### Anti-Fraud Safeguards

| Protection | How |
|-----------|-----|
| **PR Spam Penalty** | If merge ratio < 30%, F2 weight is halved (0.5x). If < 50%, reduced by 25% (0.75x). |
| **Self-Owned Exclusion** | Your own repos don't count toward F4 (qualified repo count). Owners earn F1–F3 and F5–F6 for real work on their own repos. |
| **Low-Quality Filter** | Repos with `stars + forks < 5` are excluded from F4. |
| **Merge Gate** | A repo only counts in F4 if the contributor has at least 1 merged PR there. |
| **Hard Caps** | Every factor is capped to prevent outlier gaming. |

## For enterprises

OSPOs, security, and talent teams can use **Kinetic** stewardship signals, verification APIs, and optional B2B talent endpoints. Overview and copy live at **`/enterprise`**.

---

## Quick Start

> **Prerequisites:** Node.js >= 18 &bull; An [Appwrite Cloud](https://cloud.appwrite.io) project &bull; [GitHub PAT](https://github.com/settings/tokens) (for `openget-api` and scoring)

```bash
# 1. Clone
git clone https://github.com/mads5/openget-appwrite.git
cd openget-appwrite

# 2. Install
npm install

# 3. Configure
cp .env.example .env.local
# Edit .env.local with your keys (see Environment Variables below)

# 4. Set up database (one-time, idempotent)
APPWRITE_API_KEY=your_key npm run db:sync

# 5. Run
npm run dev
# Open http://localhost:3000
```

<details>
<summary><strong>Production build</strong></summary>

```bash
npm run build    # standalone Next.js output
npm start        # serve locally
```

Appwrite Sites handles this automatically on push — see [CI / CD](#-ci--cd).

</details>

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER                                  │
│              Next.js 14 (SSR on Appwrite Sites)                │
│                                                                 │
│   /repos  /contributors  /list-repo  /dashboard  /enterprise │
└──────────────┬──────────────────────┬───────────────────────────┘
               │                      │
        Appwrite SDK            Appwrite Functions
        (direct DB reads)       (via createExecution)
               │                      │
┌──────────────▼──────────────────────▼───────────────────────────┐
│                     APPWRITE CLOUD (SGP)                        │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────────┐  │
│  │   Auth   │  │ Database │  │         Functions             │  │
│  │  GitHub  │  │ 10 cols  │  │                               │  │
│  │  OAuth   │  │          │  │  openget-api (action router)  │  │
│  └──────────┘  └──────────┘  │  one runtime function         │  │
│                               │  for app + admin actions      │  │
│                               └──────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │   External Services   │
              │                       │
              │  GitHub API (v3)      │
              │  GitHub Actions cron  │
              └───────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|:------|:----------|
| **Frontend** | Next.js 14 &bull; React 18 &bull; TypeScript &bull; Tailwind CSS &bull; Radix UI &bull; Lucide icons |
| **Backend** | Appwrite Cloud (SGP) — Database, Auth, Functions, Sites |
| **Data** | GitHub REST API v3 (`stats/contributors`, `search/issues`) |
| **CI** | GitHub Actions (auto schema sync on push to master) |
| **Font** | Self-hosted Inter via `@fontsource-variable/inter` |

---

## Pages & Features

| Route | Page | Auth? |
|:------|:-----|:-----:|
| `/` | Landing — live stats, how-it-works, CTA | No |
| `/repos` | Browse listed repos (sorted by stars) | No |
| `/repos/[id]` | Repo detail + contributor breakdown | No |
| `/contributors` | Leaderboard ranked by quality score | No |
| `/contributors/[id]` | Contributor detail + per-repo contributions | No |
| `/list-repo` | GitHub repo picker — one-click listing | Yes |
| `/dashboard` | Steward profile, registration, and stats | Yes |
| `/shield` | OpenGet Shield — optional timed check (via `openget-api`) | Yes |
| `/enterprise` | Enterprise messaging | No |
| `/legal/terms`, `/legal/privacy` | Legal pages | No |

---

## Project Structure

<details>
<summary><strong>Click to expand full tree</strong></summary>

```
openget-appwrite/
├── src/
│   ├── app/                        # Next.js App Router pages
│   │   ├── page.tsx                #   Homepage
│   │   ├── repos/                  #   Browse listed repos
│   │   ├── contributors/           #   Leaderboard + detail pages
│   │   ├── list-repo/              #   GitHub repo picker (authed)
│   │   └── dashboard/              #   Steward profile, registration, stats
│   ├── components/                 # Reusable UI (header, tables)
│   ├── lib/
│   │   ├── appwrite.ts             #   Appwrite client + collection constants
│   │   ├── api.ts                  #   Data fetchers + function executors
│   │   ├── seed-data.ts            #   Display helpers
│   │   └── utils.ts                #   cn(), formatCurrency(), formatNumber()
│   ├── types/index.ts              # Shared TypeScript interfaces
│   └── middleware.ts               # Passthrough (required by Appwrite Sites)
│
├── functions/                      # Appwrite Functions (each has own package.json)
│   ├── openget-api/                #   Consolidated action router
│   ├── fetch-contributors/         #   Nightly scoring job
│   ├── list-repo/                  #   List a GitHub repo
│   ├── get-my-repos/               #   Fetch user's GitHub repos
│   ├── get-repo-contributors/      #   Contributors for a repo
│   ├── register-contributor/       #   Link user to contributor record
│   └── …                           #   Other workers as needed
│
├── scripts/
│   ├── setup-database.js           # Idempotent DB schema provisioning
│   ├── deploy-functions.js         # Programmatic function deployment
│   └── deploy-single-function.js   # Deploy openget-api only
│
├── .github/workflows/
│   └── sync-appwrite-schema.yml    # Auto-sync schema on push to master
│
├── next.config.js                  # standalone output, image remotePatterns
├── tailwind.config.ts              # Dark theme, shadcn/ui tokens
├── package.json                    # Frontend deps + db:sync script
└── .env.example                    # Environment variable template
```

</details>

---

## Environment Variables

<details>
<summary><strong>Frontend</strong> (<code>.env.local</code> or Appwrite Sites env)</summary>

| Variable | Required | Default | Description |
|:---------|:--------:|:-------:|:------------|
| `NEXT_PUBLIC_CURRENCY` | No | `usd` | Display currency. Supports: `usd`, `eur`, `gbp`, `inr`, `jpy`, `cad`, `aud`, `sgd`, `brl` |
| `APPWRITE_API_KEY` | For server routes / `db:sync` | — | **Server only.** Used by Next.js API routes (`/api/verify`, `/api/badge/...`) and `npm run db:sync`. Never expose to the client. |
| `OPENGET_VERIFY_API_KEYS` | No | — | Comma-separated keys for optional keyed access to verification JSON (if enforced in your deployment). |
| `OPENGET_RECRUITMENT_API_KEY` | No | — | If set, required for `GET /api/enterprise/talent` (otherwise verify keys are accepted). |

> Appwrite endpoint and project ID are set in `src/lib/appwrite.ts`. Change them there if using a different project.

**Production: SVG badge and verification API (Next.js host):** The browser uses the public Appwrite client, but `/api/badge/...` and `/api/verify` run on the **Next.js server** and need **`APPWRITE_API_KEY`** in that environment (e.g. Appwrite Sites **Environment variables** or Vercel **Project** → **Settings** → **Environment Variables**), not only on Appwrite Functions. After adding the key, redeploy the site. You can check readiness with `GET /api/health` — the JSON includes `badge_routes_configured: true` when the key is present.

</details>

<details>
<summary><strong>Backend</strong> (Appwrite Function env vars)</summary>

| Variable | Required | Default | Description |
|:---------|:--------:|:-------:|:------------|
| `APPWRITE_API_KEY` | **Yes** | — | Server API key (database + users perms) |
| `APPWRITE_ENDPOINT` | No | `https://sgp.cloud.appwrite.io/v1` | Appwrite API endpoint |
| `APPWRITE_PROJECT_ID` | No | `69cd72ef00259a9a29b9` | Appwrite project ID |
| `GITHUB_TOKEN` | **Yes** | — | GitHub PAT for `openget-api` scoring, repo listing, and other server-side GitHub calls. The **`openget-api` `get-my-repos`** action prefers each signed-in user’s OAuth token from Appwrite (GitHub identity); if none is available, it falls back to this variable (so it lists repos for the **PAT owner**—useful for local dev, not multi-user production). |
| `OPENGET_INDUSTRY_IMPORT_SECRET` | For bulk seed | — | Shared secret to authorize **`import-industry-repos`**: add the same value to the function env, then set it locally in `.env.local` and run **`npm run seed:industry`** to ingest 20 public benchmark repos (`listed_by`: `industry-curated`). Chains in batches; re-run is safe. |
| `OPENGET_SCORE_SALT` | Recommended | — | HMAC input for **deterministic** noise in scoring (set on `openget-api` only; not in the browser). |
| `OPENGET_JSON_INGEST_SECRET` | For Guardian ingest | — | Authorize **`ingest-openget-json`**; can match **`OPENGET_INDUSTRY_IMPORT_SECRET`** for simplicity. |

**After schema migration:** run **`APPWRITE_API_KEY=… npm run db:sync`**, deploy **`openget-api`**, then **`npm run recompute:percentiles`** to refresh global percentiles and GPS for existing contributors.

**GitHub OAuth (list repos & contributor registration):** In Appwrite Console → **Auth** → **GitHub**, ensure scopes allow the [authenticated user](https://docs.github.com/en/rest/users/users) and [listing repositories](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user). Include **`repo`** if private repositories should appear. The **browser** reads the GitHub OAuth token from **`account.listIdentities()`** and sends it to **`openget-api`** as `github_access_token` (the Functions admin API often cannot read that token). The function then falls back to the **`users`** document, server-side identities, or **`GITHUB_TOKEN`**.

**Industry benchmark repos:** The **Repos** table can include a fixed set of 20 well-known public GitHub projects (see `src/lib/industry-default-repos.ts` and `functions/openget-api/src/industry-refs.js`). They are not magic: run **`npm run deploy:api`**, set **`OPENGET_INDUSTRY_IMPORT_SECRET`** on the function, run **`npm run seed:industry`** from a machine with **`APPWRITE_API_KEY`** and the same secret. Each repo is ingested like **List a repository**, then **`fetch-contributors`** runs in the background; contributors appear on **Contributors** as discovery completes. Default sort on **Repos** is “Industry reference, then stars” when you use the seed.

</details>

<details>
<summary><strong>CI Secrets</strong> (GitHub Actions)</summary>

| Secret | Used By |
|:-------|:--------|
| `APPWRITE_API_KEY` | `sync-appwrite-schema.yml`, `deploy-appwrite-functions.yml` |
| `APPWRITE_ENDPOINT` | Optional override |
| `APPWRITE_PROJECT_ID` | Optional override |

</details>

---

## Database

The Appwrite database (`openget-db`) includes collections for **repos**, **contributors**, **repo_contributions**, **monthly_contributor_stats**, **users**, and supporting tables used by the scoring pipeline and the app. Run **`npm run db:sync`** to align schema with the repo.

| Collection | Purpose |
|:-----------|:--------|
| `app_meta` | Singleton rows; **`schema_version`** (default `2`) for migration hooks and function health |
| `repos` | Listed GitHub repos (stars, forks, `repo_score`, owner, language) |
| `contributors` | Discovered contributors (scores, `percentile_global`, registration) |
| `repo_contributions` | Per-repo metrics: commits, PRs merged, reviews, lines, issues, score |
| `monthly_contributor_stats` | Monthly PR raised/merged per contributor per repo |
| `users` | Profiles, GitHub linkage, and session-related fields |
| *others* | Additional tables from `setup-database.js` (full historical data model) |

### Apply / Update Schema

```bash
# From repo root
APPWRITE_API_KEY=your_key npm run db:sync
```

> The script is **idempotent** — safe to run on every deploy. Creates missing collections/attributes, skips existing ones.

After merging schema changes (for example the optional **`github_access_token`** attribute on **`users`**), run **`npm run db:sync`** on `master` (or locally with `APPWRITE_API_KEY`) so new attributes exist before the app or functions rely on them. Pushes to `master` also trigger the [schema sync workflow](.github/workflows/sync-appwrite-schema.yml) if GitHub Actions secrets are configured.

### Duplicate contributor rows (same GitHub account)

If you see two **`contributors`** documents for one person (one with GitHub **login**, one with **display name**), keep the row whose **`github_username`** matches your [GitHub username](https://github.com/settings/admin). Merge data as needed:

1. Prefer the document created by contributor discovery (correct **`github_id`** / **`github_username`** from GitHub).
2. If the wrong row has **`user_id`** set, copy that value onto the canonical document, then delete the duplicate.
3. Update any documents that reference the duplicate **`contributor_id`** to point at the canonical contributor `$id`, or delete the duplicate only after references are updated.

---

## Deploying Functions

<details>
<summary><strong>Option A: Deploy script</strong></summary>

```bash
cd scripts && npm install
APPWRITE_API_KEY=your_key node deploy-functions.js
```

Creates functions (if missing), bundles `node_modules`, and uploads deployments. **`openget-api` is deployed first** and is the free-tier default.

GitHub Actions sets **`DEPLOY_FUNCTION_IDS=openget-api`** so CI only updates the router the Next app uses. To deploy **all** functions from this repo, run locally without that variable and make sure your Appwrite plan has enough function slots.

</details>

<details>
<summary><strong>Option B: Appwrite CLI</strong></summary>

```bash
appwrite login
appwrite push functions
```

</details>

### Deploying the `openget-api` router (required for API fixes)

The Next.js app invokes a **single** function ID, **`openget-api`**, for actions such as `get-my-repos` and `register-contributor` (see [`src/lib/api.ts`](src/lib/api.ts)). **Merging a PR does not update runtime behavior** until a new deployment of that function is active in Appwrite.

After you merge changes under [`functions/openget-api/`](functions/openget-api/):

1. Pull the latest `master` (or check out the commit you want in production).
2. Run **Option A** or **B** above — the deploy script includes `openget-api` and uploads a new deployment.
3. In Appwrite Console → **Functions** → **`openget-api`**, confirm the **active deployment** matches the commit you expect.

**Execute access:** If the UI shows **`No permissions provided for action 'execute'`** (for example on **List your repo**), the function’s **Execute access** in Appwrite Console → **Functions** → **`openget-api`** → **Settings** must include **`users`** (and usually **`any`**). Older functions may have been created without those roles; [`scripts/deploy-functions.js`](scripts/deploy-functions.js) updates execute permissions from `FUNCTION_CONFIG` after each successful deployment so redeploying **`openget-api`** applies the fix without manual edits.

**PR preview URLs** (for example `https://*.appwrite.network/`) build the **frontend** from your branch only. They still call the **same** project and the **currently deployed** `openget-api` revision, so backend fixes will not appear on a preview until you deploy that function.

### Scheduled jobs

| Trigger | Schedule | Purpose |
|:--------|:---------|:--------|
| `openget-nightly-scoring.yml` | Daily at 2:00 AM UTC | Calls `openget-api` with `action=fetch-contributors` |

---

## CI / CD

### Automatic Function Deploy

Pushes to `master` / `main` run [`.github/workflows/deploy-appwrite-functions.yml`](.github/workflows/deploy-appwrite-functions.yml), which executes [`scripts/deploy-functions.js`](scripts/deploy-functions.js) for **`openget-api`**. Add the **`APPWRITE_API_KEY`** repository secret to enable deployments; optional **`APPWRITE_ENDPOINT`** and **`APPWRITE_PROJECT_ID`** override defaults. If the secret is missing, the workflow skips deployment so forks do not fail CI.

### Scheduled scoring

[`.github/workflows/openget-nightly-scoring.yml`](.github/workflows/openget-nightly-scoring.yml) calls `openget-api` with `action=fetch-contributors`.

### Automatic Schema Sync

Every push to `master` triggers `.github/workflows/sync-appwrite-schema.yml`:

1. Checks out repo
2. Installs `scripts/` dependencies
3. Runs `setup-database.js` with secrets from GitHub Actions

**Result:** database schema always matches the codebase — no manual migration steps.

### Appwrite Sites

The frontend deploys as an **Appwrite Site** (SSR via `output: 'standalone'`). Appwrite watches the repo and triggers builds on push. Preview URLs are generated per PR automatically.

**Limitations of PR previews:** Previews rebuild **only** the **Next.js site**, not Appwrite **Functions** or database data. Testing flows that depend on `openget-api` (GitHub repos, registration, scoring) requires a **new deployment** of [`functions/openget-api`](functions/openget-api) as described above, then retest on the preview or production URL.

**OAuth on preview hosts:** If **Sign in with GitHub** fails or redirects incorrectly on a `*.appwrite.network` preview but works on your main Site URL, check **Appwrite Console** → **Auth** (allowed platforms / redirect URLs for your Site and OAuth providers) and your **GitHub OAuth App** settings so the preview origin is permitted where Appwrite requires it. The GitHub authorization callback usually remains Appwrite’s endpoint; the **success redirect** back to your app may use the preview hostname and must be allowed by Appwrite Auth configuration.

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes
4. Push and open a PR

All PRs get an Appwrite preview deployment automatically (frontend only; deploy Functions separately to validate backend changes).

---

## License

This project is open source. See the repository for license details.

---

<p align="center">
  <strong>Open<span>Get</span></strong> — Human Verification for Open Source
  <br />
  <sub>Built with Appwrite &bull; Next.js &bull; GitHub API</sub>
</p>
