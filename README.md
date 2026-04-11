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
  <a href="#-architecture">Architecture</a>
</p>

---

## The Problem

Open source runs the world, but most contributors never see a dollar. Sponsorship platforms reward maintainers, not the people writing code. There's no fair, automated way to distribute funds based on *actual work*.

## The Solution

OpenGet creates a **monthly donation pool** and distributes it **weekly** to contributors using a **4-factor anti-fraud scoring model** that measures real contributions — merged PRs, code reviews, issue resolution — not just star counts.

---

## How It Works

```
   List a Repo          Donate               Score              Distribute          Get Paid
  ┌───────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐
  │ Sign in   │    │ Anyone can   │    │ Nightly cron │    │ Weekly cron  │    │ Register  │
  │ with      │───>│ donate to    │───>│ scrapes      │───>│ splits pool  │───>│ + connect │
  │ GitHub    │    │ the monthly  │    │ GitHub &     │    │ across repos │    │ Stripe    │
  │ + pick    │    │ pool via     │    │ computes     │    │ then across  │    │ Express   │
  │ your repo │    │ Stripe / UPI │    │ 4-factor     │    │ contributors │    │ = weekly  │
  │           │    │              │    │ score        │    │ by score     │    │ payouts   │
  └───────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └───────────┘
```

| Step | What Happens |
|------|-------------|
| **1. List** | Sign in with GitHub, pick a repo. OpenGet auto-discovers all contributors via the GitHub Stats API. |
| **2. Donate** | Anyone donates to the monthly pool (9 currencies via Stripe, UPI stub for INR). Donations target the **collecting** pool for next month. |
| **3. Score** | `fetch-contributors` runs nightly — refreshes repo metadata, scrapes contribution stats, computes monthly PR counts, and applies the **4-factor anti-fraud score**. |
| **4. Distribute** | `distribute-pool` runs every Monday — splits the week's budget across repos (sqrt-weighted by repo score), then to eligible contributors (weighted by `total_score`). Min payout: **$0.50**. |
| **5. Get Paid** | Contributors register on OpenGet, connect Stripe Express, and receive weekly payouts directly to their bank. |

---

## Scoring Formula

Contributors are scored using a **4-factor model** designed to reward real work and punish gaming:

```
Score = (F1 * 0.20) + (F2 * 0.15 * merge_penalty) + (F3 * 0.55) + (F4 * 0.10)
```

| Factor | Weight | Formula | What It Measures |
|--------|:------:|---------|-----------------|
| **F1** Total Contributions | 20% | `log2(total + 1) / log2(1001)` | Commits + merged PRs + reviews + issues closed (log-scaled) |
| **F2** PRs Raised | 15% | `min(raised, 100) / 100` | Monthly PR activity, capped at 100 |
| **F3** PRs Merged | **55%** | `min(merged, 80) / 80` | Monthly merged PRs — the heaviest signal, capped at 80 |
| **F4** Qualified Repos | 10% | `log2(min(repos, 20) + 1) / log2(21)` | Repos contributed to (excluding self-owned, low-quality) |

### Anti-Fraud Safeguards

| Protection | How |
|-----------|-----|
| **PR Spam Penalty** | If merge ratio < 30%, F2 weight is halved (0.5x). If < 50%, reduced by 25% (0.75x). |
| **Self-Owned Exclusion** | Your own repos don't count toward F4 (qualified repo count). |
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
| **Platform fee** | 1% deducted per donation, tracked in `platform_fees` |
| **Daily budget** | `distributable_cents / days_in_month` |
| **Weekly budget** | `daily_budget * 7` (or remaining, whichever is less) |
| **Repo weighting** | `sqrt(stars + forks)` — popular repos get more, but diminishing returns |
| **Contributor weighting** | `total_score` within each repo's budget |
| **Minimum payout** | $0.50 — smaller amounts roll over |
| **Audit trail** | Every distribution creates a `weekly_distributions` record |

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
│  └──────────┘  └──────────┘  │  fetch-contributors (cron)   │  │
│                               │  distribute-pool   (cron)   │  │
│                               │  create-checkout             │  │
│                               │  stripe-webhook              │  │
│                               │  stripe-connect              │  │
│                               │  + 5 more                    │  │
│                               └──────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │   External Services   │
              │                       │
              │  GitHub API (v3)      │
              │  Stripe Checkout      │
              │  Stripe Connect       │
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
│   ├── fetch-contributors/         #   Nightly: GitHub scrape + 4-factor scoring
│   ├── distribute-pool/            #   Weekly: dual-pool distribution engine
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
| `GITHUB_TOKEN` | **Yes** | — | GitHub PAT for contributor discovery |
| `STRIPE_SECRET_KEY` | **Yes** | — | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | **Yes** | — | Stripe webhook signing secret |
| `STRIPE_CONNECT_REFRESH_URL` | No | — | Redirect after Connect refresh |
| `STRIPE_CONNECT_RETURN_URL` | No | — | Redirect after Connect completes |

</details>

<details>
<summary><strong>CI Secrets</strong> (GitHub Actions)</summary>

| Secret | Used By |
|:-------|:--------|
| `APPWRITE_API_KEY` | `sync-appwrite-schema.yml` |
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

---

## Deploying Functions

<details>
<summary><strong>Option A: Deploy script</strong></summary>

```bash
cd scripts && npm install
APPWRITE_API_KEY=your_key node deploy-functions.js
```

Creates functions (if missing), bundles `node_modules`, and uploads deployments.

</details>

<details>
<summary><strong>Option B: Appwrite CLI</strong></summary>

```bash
appwrite login
appwrite push functions
```

</details>

### Scheduled Functions

| Function | Schedule | Purpose |
|:---------|:---------|:--------|
| `fetch-contributors` | Daily at 2:00 AM UTC | Refresh repo metadata, scrape GitHub, compute 4-factor scores |
| `distribute-pool` | Weekly Monday at midnight UTC | Distribute weekly budget from active pool |

---

## CI / CD

### Automatic Schema Sync

Every push to `master` triggers `.github/workflows/sync-appwrite-schema.yml`:

1. Checks out repo
2. Installs `scripts/` dependencies
3. Runs `setup-database.js` with secrets from GitHub Actions

**Result:** database schema always matches the codebase — no manual migration steps.

### Appwrite Sites

The frontend deploys as an **Appwrite Site** (SSR via `output: 'standalone'`). Appwrite watches the repo and triggers builds on push. Preview URLs are generated per PR automatically.

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes
4. Push and open a PR

All PRs get an Appwrite preview deployment automatically.

---

## License

This project is open source. See the repository for license details.

---

<p align="center">
  <strong>Open<span>Get</span></strong> — Rewarding Open Source Contributors
  <br />
  <sub>Built with Appwrite &bull; Stripe &bull; Next.js &bull; GitHub API</sub>
</p>
