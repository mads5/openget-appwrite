<p align="center">
  <img src="public/logo.png" alt="OpenGet Logo" width="120" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/Appwrite-Cloud-F02E65?style=for-the-badge&logo=appwrite&logoColor=white" alt="Appwrite" />
  <img src="https://img.shields.io/badge/Stripe-Payments-635BFF?style=for-the-badge&logo=stripe&logoColor=white" alt="Stripe" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind" />
</p>

<h1 align="center">OpenGet</h1>
<h3 align="center">Reward the People Behind Open Source</h3>

<p align="center">
  List repos. Fund a pool. Pay contributors weekly — based on real code quality, not popularity contests.
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> &bull;
  <a href="#-how-it-works">How It Works</a> &bull;
  <a href="#-scoring-formula">Scoring</a> &bull;
  <a href="#-environment-variables">Config</a> &bull;
  <a href="#-architecture">Architecture</a> &bull;
  <a href="#-governance">Governance</a> &bull;
  <a href="#-for-enterprises">For enterprises</a>
</p>

---

## The Problem

Open source runs the world, but most contributors never see a dollar. Sponsorship platforms reward maintainers, not the people writing code. There's no fair, automated way to distribute funds based on *actual work*.

## The Solution

OpenGet creates a **monthly donation pool** and shares it **weekly** with contributors using a **6-factor scoring model**. It rewards real work like merged PRs, reviews, releases, and issue work — not just popularity.

---

## How It Works

```
   List a Repo          Donate               Score              Distribute          Get Paid
  ┌───────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐
  │ Sign in   │    │ Anyone can   │    │ Nightly cron │    │ Weekly cron  │    │ Register  │
  │ with      │───>│ donate to    │───>│ scrapes      │───>│ splits pool  │───>│ + connect │
  │ GitHub    │    │ the monthly  │    │ GitHub &     │    │ across repos │    │ Stripe    │
  │ + pick    │    │ pool via     │    │ computes     │    │ then across  │    │ Express   │
  │ your repo │    │ Stripe / UPI │    │ 6-factor     │    │ contributors │    │ = weekly  │
  │           │    │              │    │ score        │    │ by score     │    │ payouts   │
  └───────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └───────────┘
```

| Step | What Happens |
|------|-------------|
| **1. List** | Sign in with GitHub, pick a repo. OpenGet saves the repo right away and starts finding contributors. |
| **2. Donate** | Anyone donates to the monthly pool (9 currencies via Stripe, UPI stub for INR). Donations target the **collecting** pool for next month. |
| **3. Score** | A nightly GitHub Actions job calls `openget-api` to refresh repo data, check contribution activity, and update contributor scores. |
| **4. Distribute** | A weekly GitHub Actions job calls `openget-api` every Monday to split the week's budget across repos, then across eligible contributors. Min payout: **$0.50**. |
| **5. Get Paid** | Contributors register on OpenGet, connect Stripe Express, and receive weekly payouts directly to their bank. |

---

## Scoring Formula

Contributors are scored using a **6-factor model** designed to reward real work and reduce gaming:

```
Score = (F1 * 0.15) + (F2 * 0.10 * merge_penalty) + (F3 * 0.40) + (F4 * 0.10) + (F5 * 0.15) + (F6 * 0.10)
```

| Factor | Weight | Formula | What It Measures |
|--------|:------:|---------|-----------------|
| **F1** Total Contributions | 15% | `log2(total + 1) / log2(1001)` | General contribution activity |
| **F2** PRs Raised | 10% | `min(raised, 100) / 100` | PRs opened this month |
| **F3** PRs Merged | **40%** | `min(merged, 80) / 80` | PRs actually merged |
| **F4** Qualified Repos | 10% | `log2(min(repos, 20) + 1) / log2(21)` | Real repos helped outside your own |
| **F5** Review Activity | 15% | `log2(min(reviews, 200) + 1) / log2(201)` | Reviews and review comments |
| **F6** Release & Triage | 10% | `log2(min(releases, 30) + 1) / log2(31)` | Release work and issue handling |

### Anti-Fraud Safeguards

| Protection | How |
|-----------|-----|
| **PR Spam Penalty** | If merge ratio < 30%, F2 weight is halved (0.5x). If < 50%, reduced by 25% (0.75x). |
| **Self-Owned Exclusion** | Your own repos don't count toward F4 (qualified repo count). Owners earn F1–F3 and F5–F6 for real work on their own repos. |
| **Low-Quality Filter** | Repos with `stars + forks < 5` are excluded from F4. |
| **Merge Gate** | A repo only counts in F4 if the contributor has at least 1 merged PR there. |
| **Hard Caps** | Every factor is capped to prevent outlier gaming. |

---

## Pool & Distribution Lifecycle

```
                          MONTHLY LIFECYCLE
  ╔═══════════════╗                              ╔═══════════════╗
  ║   COLLECTING   ║  ──── 1st of month ────>    ║    ACTIVE      ║
  ║               ║                              ║               ║
  ║ Donations     ║                              ║ Weekly dist.  ║
  ║ go here       ║                              ║ every Monday  ║
  ╚═══════════════╝                              ╚═══════╤═══════╝
                                                         │
                                              last day of month
                                                         │
                                                         ▼
                                                 ╔═══════════════╗
                                                 ║   COMPLETED    ║
                                                 ║               ║
                                                 ║ Remaining     ║
                                                 ║ funds dist.   ║
                                                 ╚═══════════════╝
                                                         │
                                              new Collecting pool
                                               auto-created ──►
```

| Concept | Detail |
|---------|--------|
| **Platform fee** | Tiered fee with a small minimum floor, tracked in `platform_fees` |
| **Daily budget** | `distributable_cents / days_in_month` |
| **Weekly budget** | `daily_budget * 7` (or remaining, whichever is less) |
| **Strategic pools** | Four parallel lanes per month; donors pick at checkout. Each **listed repo** gets automatic `eligible_pool_types` from OpenGet's scoring run, so repos do not all share every pool's budget. See [docs/POOL_TYPES.md](docs/POOL_TYPES.md). |
| **Repo weighting** | `sqrt(stars+forks) × (0.35 + 0.65 × criticality_score) × (1 + min(1.5, 1/bus_factor))` — nightly GitHub heuristic for **criticality** (v1) and **bus factor** (authors needed for ~50% of commits), reducing pure star-count bias. |
| **Contributor weighting** | `total_score` within each repo's budget |
| **Minimum payout** | $0.50 — smaller amounts roll over |
| **Audit trail** | Every distribution creates a `weekly_distributions` record |

## Governance

OpenGet does **not** let donors direct payouts to specific pull requests. Funds flow through **public contributor scoring** and **repo weighting** rules so no single employer captures a maintainer’s roadmap—supporting neutral, multi-sponsor narratives.

## For enterprises

Patch speed, project health, simple pooled funding, and fair distribution are summarized in-app on **`/enterprise`** and in [docs/POOL_TYPES.md](docs/POOL_TYPES.md).

---

## Quick Start

> **Prerequisites:** Node.js >= 18 &bull; An [Appwrite Cloud](https://cloud.appwrite.io) project &bull; [Stripe](https://stripe.com) account &bull; [GitHub PAT](https://github.com/settings/tokens)

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
│   /repos  /contributors  /donate  /dashboard  /list-repo       │
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
              │  Stripe Checkout      │
              │  Stripe Connect       │
              │  GitHub Actions cron  │
              └───────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|:------|:----------|
| **Frontend** | Next.js 14 &bull; React 18 &bull; TypeScript &bull; Tailwind CSS &bull; Radix UI &bull; Lucide icons |
| **Backend** | Appwrite Cloud (SGP) — Database, Auth, Functions, Sites |
| **Payments** | Stripe Checkout &bull; Webhooks &bull; Connect Express |
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
| `/donate` | Multi-currency donation (9 currencies, Stripe + UPI stub) | Yes |
| `/donate/success` | Post-payment thank-you | No |
| `/list-repo` | GitHub repo picker — one-click listing | Yes |
| `/dashboard` | Earnings, registration, Stripe Connect onboarding | Yes |

---

## Project Structure

<details>
<summary><strong>Click to expand full tree</strong></summary>

```
openget-appwrite/
├── src/
│   ├── app/                        # Next.js App Router pages
│   │   ├── page.tsx                #   Homepage (stats, how-it-works)
│   │   ├── repos/                  #   Browse listed repos
│   │   ├── contributors/           #   Leaderboard + detail pages
│   │   ├── donate/                 #   Multi-currency donation flow
│   │   ├── list-repo/              #   GitHub repo picker (authed)
│   │   └── dashboard/              #   Earnings, registration, Stripe Connect
│   ├── components/                 # Reusable UI (header, tables, pool card)
│   ├── lib/
│   │   ├── appwrite.ts             #   Appwrite client + collection constants
│   │   ├── api.ts                  #   Data fetchers + function executors
│   │   ├── seed-data.ts            #   Currency config + formatCents()
│   │   └── utils.ts                #   cn(), formatCurrency(), formatNumber()
│   ├── types/index.ts              # Shared TypeScript interfaces
│   └── middleware.ts               # Passthrough (required by Appwrite Sites)
│
├── functions/                      # Appwrite Functions (each has own package.json)
│   ├── openget-api/                #   Consolidated action router
│   ├── fetch-contributors/         #   Legacy standalone scoring job
│   ├── distribute-pool/            #   Legacy standalone distribution job
│   ├── create-checkout/            #   Stripe Checkout session
│   ├── stripe-webhook/             #   Stripe payment confirmation
│   ├── stripe-connect/             #   Stripe Express onboarding
│   ├── list-repo/                  #   List a GitHub repo
│   ├── get-my-repos/               #   Fetch user's GitHub repos
│   ├── get-repo-contributors/      #   Contributors for a repo
│   ├── register-contributor/       #   Link user to contributor record
│   ├── get-earnings/               #   Payout history
│   └── upi-payment/                #   UPI QR stub (INR)
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

> Appwrite endpoint and project ID are set in `src/lib/appwrite.ts`. Change them there if using a different project.

</details>

<details>
<summary><strong>Backend</strong> (Appwrite Function env vars)</summary>

| Variable | Required | Default | Description |
|:---------|:--------:|:-------:|:------------|
| `APPWRITE_API_KEY` | **Yes** | — | Server API key (database + users perms) |
| `APPWRITE_ENDPOINT` | No | `https://sgp.cloud.appwrite.io/v1` | Appwrite API endpoint |
| `APPWRITE_PROJECT_ID` | No | `69cd72ef00259a9a29b9` | Appwrite project ID |
| `GITHUB_TOKEN` | **Yes** | — | GitHub PAT for `openget-api` scoring, repo listing, and other server-side GitHub calls. The **`openget-api` `get-my-repos`** action prefers each signed-in user’s OAuth token from Appwrite (GitHub identity); if none is available, it falls back to this variable (so it lists repos for the **PAT owner**—useful for local dev, not multi-user production). |
| `STRIPE_SECRET_KEY` | **Yes** | — | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | **Yes** | — | Stripe webhook signing secret |
| `STRIPE_CONNECT_REFRESH_URL` | No | — | Redirect after Connect refresh |
| `STRIPE_CONNECT_RETURN_URL` | No | — | Redirect after Connect completes |

**GitHub OAuth (list repos & contributor registration):** In Appwrite Console → **Auth** → **GitHub**, ensure scopes allow the [authenticated user](https://docs.github.com/en/rest/users/users) and [listing repositories](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user). Include **`repo`** if private repositories should appear. The **browser** reads the GitHub OAuth token from **`account.listIdentities()`** and sends it to **`openget-api`** as `github_access_token` (the Functions admin API often cannot read that token). The function then falls back to the **`users`** document, server-side identities, or **`GITHUB_TOKEN`**.

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

The Appwrite database (`openget-db`) has **10 collections**:

| Collection | Purpose |
|:-----------|:--------|
| `repos` | Listed GitHub repos (stars, forks, `repo_score`, owner, language) |
| `contributors` | Discovered contributors (`total_score`, `total_contributions`, registration status) |
| `repo_contributions` | Per-repo metrics: commits, PRs merged, reviews, lines, issues, score |
| `pools` | Monthly funding pools (`collecting` / `active` / `completed` lifecycle) |
| `donations` | Individual donation records linked to pools |
| `payouts` | Payout records per contributor per distribution round |
| `platform_fees` | 1% fee tracking per donation |
| `monthly_contributor_stats` | Monthly PR raised/merged per contributor per repo |
| `weekly_distributions` | Audit trail for each weekly distribution run |
| `users` | Profiles (Stripe Connect account, GitHub info) |

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
3. Update **`repo_contributions`** (and **`payouts`**, if any) that reference the duplicate **`contributor_id`** to point at the canonical contributor `$id`, or delete the duplicate only after references are moved.

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

### Scheduled Jobs

| Trigger | Schedule | Purpose |
|:--------|:---------|:--------|
| `openget-nightly-scoring.yml` | Daily at 2:00 AM UTC | Calls `openget-api` with `action=fetch-contributors` |
| `openget-weekly-distribution.yml` | Weekly Monday at midnight UTC | Calls `openget-api` with `action=distribute-pool` |

---

## CI / CD

### Automatic Function Deploy

Pushes to `master` / `main` run [`.github/workflows/deploy-appwrite-functions.yml`](.github/workflows/deploy-appwrite-functions.yml), which executes [`scripts/deploy-functions.js`](scripts/deploy-functions.js) for **`openget-api`**. Add the **`APPWRITE_API_KEY`** repository secret to enable deployments; optional **`APPWRITE_ENDPOINT`** and **`APPWRITE_PROJECT_ID`** override defaults. If the secret is missing, the workflow skips deployment so forks do not fail CI.

### Scheduled Scoring And Payouts

GitHub Actions now handles the schedule on free tier:

1. [`.github/workflows/openget-nightly-scoring.yml`](.github/workflows/openget-nightly-scoring.yml) calls `openget-api` with `action=fetch-contributors`.
2. [`.github/workflows/openget-weekly-distribution.yml`](.github/workflows/openget-weekly-distribution.yml) calls `openget-api` with `action=distribute-pool`.
3. Both workflows also support `workflow_dispatch`, so you can run them manually from GitHub when needed.

### Automatic Schema Sync

Every push to `master` triggers `.github/workflows/sync-appwrite-schema.yml`:

1. Checks out repo
2. Installs `scripts/` dependencies
3. Runs `setup-database.js` with secrets from GitHub Actions

**Result:** database schema always matches the codebase — no manual migration steps.

### Appwrite Sites

The frontend deploys as an **Appwrite Site** (SSR via `output: 'standalone'`). Appwrite watches the repo and triggers builds on push. Preview URLs are generated per PR automatically.

**Limitations of PR previews:** Previews rebuild **only the Next.js site**, not Appwrite **Functions** or database data. Testing flows that depend on `openget-api` (GitHub repos, registration, checkout, etc.) requires a **new deployment** of [`functions/openget-api`](functions/openget-api) as described above, then retest on the preview or production URL.

**OAuth on preview hosts:** If **Sign in with GitHub** fails or redirects incorrectly on a `*.appwrite.network` preview but works on your main Site URL, check **Appwrite Console** → **Auth** (allowed platforms / redirect URLs for your Site and OAuth providers) and your **GitHub OAuth App** settings so the preview origin is permitted where Appwrite requires it. The GitHub authorization callback usually remains Appwrite’s endpoint; the **success redirect** back to your app may use the preview hostname and must be allowed by Appwrite Auth configuration.

---

## Stripe Setup

OpenGet uses Stripe for two distinct flows that share one set of credentials:

- **Donations in** &mdash; Checkout Sessions (`create-checkout`) land in the platform balance and are booked onto the monthly pool by the `stripe-webhook` action on `checkout.session.completed`.
- **Payouts out** &mdash; The weekly `distribute-pool` cron creates `payouts` rows (`status: pending`), then chains into `process-payouts` which issues Stripe Connect transfers to each contributor's Express account. Webhook events (`account.updated`, `transfer.paid/failed/reversed`) keep user/payout rows in sync.

Follow the checklist end-to-end once in **test mode**, verify, then repeat in **live mode**.

### 1. Stripe dashboard

1. Create / activate a Stripe account.
2. **Settings &rarr; Connect &rarr; Get started**. Pick **Express** and enable the **Transfers** capability.
3. **Connect &rarr; Settings &rarr; Branding**: set display name (e.g. "OpenGet"), icon, support email, and business URL so the Express onboarding pages are branded.
4. **Connect &rarr; Settings &rarr; Redirects**: set the default refresh and return URLs to your deployed app (e.g. `https://<your-domain>/dashboard`). These values should match `STRIPE_CONNECT_REFRESH_URL` / `STRIPE_CONNECT_RETURN_URL` below.
5. **Developers &rarr; Webhooks &rarr; Add endpoint**:
   - **URL:** the Appwrite execution URL for the `openget-api` function with `?action=stripe-webhook` as a query param. The router resolves the action from `req.query.action`, see [`functions/openget-api/src/main.js`](functions/openget-api/src/main.js).
   - **Events to send:** `checkout.session.completed`, `account.updated`, `transfer.paid`, `transfer.failed`, `transfer.reversed`. Optionally also `payout.paid` and `payout.failed` (these are logged only).
   - Enable **"Listen to events on connected accounts"** so `account.updated` and transfer events fire for Express sub-accounts.
   - Copy the **Signing secret** &rarr; this becomes `STRIPE_WEBHOOK_SECRET`.
6. **Developers &rarr; API keys**: copy the **Secret key** &rarr; this becomes `STRIPE_SECRET_KEY`.

### 2. Environment variables

Configure these as **Appwrite function variables** on the `openget-api` function (not only in `.env.local`, since the router executes inside Appwrite Functions):

| Variable                      | Purpose                                                         |
| ----------------------------- | --------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`           | Platform secret key (`sk_test_...` / `sk_live_...`).            |
| `STRIPE_WEBHOOK_SECRET`       | Signing secret from the webhook endpoint step above.            |
| `STRIPE_CONNECT_REFRESH_URL`  | Where contributors are sent if their onboarding link expires.   |
| `STRIPE_CONNECT_RETURN_URL`   | Where Express sends contributors after completing onboarding.   |

Placeholders for local dev live in [`.env.example`](.env.example).

### 3. Database schema

Run `npm run db:sync` after pulling so `stripe_charges_enabled` / `stripe_payouts_enabled` booleans are added to `users` and `failure_reason` to `payouts`. See [`scripts/setup-database.js`](scripts/setup-database.js).

### 4. Test plan (test mode)

1. **Donation:** open `/donate`, pick a pool, pay with test card `4242 4242 4242 4242`. The matching `donations` row should flip `pending` &rarr; `confirmed`, the pool totals update, and a `platform_fees` row is written.
2. **Contributor onboarding:** sign in to `/dashboard`, click **Connect Stripe Account**, complete Express onboarding with Stripe test data. Wait for `account.updated` &rarr; the user doc gets `stripe_payouts_enabled: true`.
3. **Payout transfer:** run the weekly distribute (or insert a test `payouts` row manually) and invoke `process-payouts`:

   ```bash
   APPWRITE_API_KEY=... \
   OPENGET_ACTION=process-payouts \
   node scripts/run-openget-action.js
   ```

   The row should go `pending` &rarr; `processing` with a `stripe_transfer_id`.
4. **Completion webhook:** use the Stripe CLI (`stripe trigger transfer.paid`) or wait for the real event &rarr; row flips to `completed`.
5. Repeat once in live mode with a real bank account and a real $1 donation before announcing.

Common failure states you'll see on `payouts`:

- `blocked` + `failure_reason: no_connected_account` &mdash; contributor hasn't started Stripe onboarding.
- `blocked` + `failure_reason: payouts_not_enabled` &mdash; onboarding started but Stripe hasn't verified the account yet.
- `failed` &mdash; `stripe.transfers.create` threw (e.g. insufficient platform balance). See `failure_reason` for the Stripe error message.

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
  <strong>Open<span>Get</span></strong> — Rewarding Open Source Contributors
  <br />
  <sub>Built with Appwrite &bull; Stripe &bull; Next.js &bull; GitHub API</sub>
</p>
