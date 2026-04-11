# Graph Report - .  (2026-04-11)

## Corpus Check
- Corpus is ~30,478 words - fits in a single context window. You may not need a graph.

## Summary
- 123 nodes · 195 edges · 18 communities detected
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `addStringAttribute()` - 13 edges
2. `ensureCollection()` - 12 edges
3. `addIntegerAttribute()` - 12 edges
4. `executeFunction()` - 8 edges
5. `isConflict()` - 6 edges
6. `addFloatAttribute()` - 6 edges
7. `fetchMonthlyPrStats()` - 5 edges
8. `waitForAttribute()` - 5 edges
9. `setupContributors()` - 5 edges
10. `setupRepoContributions()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Next.js app icon` --conceptually_related_to--> `OpenGet`  [INFERRED]
  src/app/icon.png → README.md
- `OpenGet` --references--> `fetchMonthlyPrStats()`  [INFERRED]
  README.md → functions\fetch-contributors\src\main.js
- `4-factor anti-fraud scoring model` --rationale_for--> `computeContributorScore()`  [INFERRED]
  README.md → functions\fetch-contributors\src\main.js
- `OpenGet logo (braces + upward arrow on orange gradient)` --conceptually_related_to--> `OpenGet`  [EXTRACTED]
  public/logo.png → README.md
- `OpenGet` --references--> `distributeWeekly()`  [EXTRACTED]
  README.md → functions\distribute-pool\src\main.js

## Communities

### Community 0 - "Scoring, pools & cron functions"
Cohesion: 0.1
Nodes (18): Next.js app icon, OpenGet logo (braces + upward arrow on orange gradient), activatePool(), computeContributorScore(), daysInMonth(), distributeWeekly(), ensureCollectingPool(), fetchMonthlyPrStats() (+10 more)

### Community 1 - "openget-api action router"
Cohesion: 0.14
Nodes (21): checkUpiQrStatus(), createCheckoutSession(), createUpiQr(), docAttrs(), donate(), executeFunction(), getActivePool(), getCollectingPool() (+13 more)

### Community 2 - "Database schema setup"
Cohesion: 0.32
Nodes (19): addFloatAttribute(), addIntegerAttribute(), addStringAttribute(), ensureCollection(), ensureDatabase(), isConflict(), main(), setupContributors() (+11 more)

### Community 3 - "Donate & listing page handlers"
Cohesion: 0.2
Nodes (0): 

### Community 4 - "Tabs, progress & formatters"
Cohesion: 0.29
Nodes (0): 

### Community 5 - "Layout, header & Appwrite"
Cohesion: 0.33
Nodes (0): 

### Community 6 - "Pool cards & seed data"
Cohesion: 0.4
Nodes (0): 

### Community 7 - "Bulk function deployment"
Cohesion: 0.83
Nodes (3): createTarGz(), deployFunction(), main()

### Community 8 - "Tables & badges"
Cohesion: 0.5
Nodes (0): 

### Community 9 - "Single-function deploy script"
Cohesion: 1.0
Nodes (0): 

### Community 10 - "Next.js middleware"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Logo component"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "next-env.d.ts"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "next.config.js"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "PostCSS config"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Tailwind config"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Shared TypeScript types"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Architecture documentation"
Cohesion: 1.0
Nodes (1): Next.js + Appwrite Cloud architecture

## Knowledge Gaps
- **5 isolated node(s):** `4-factor anti-fraud scoring model`, `Pool lifecycle (Collecting → Active → Completed)`, `Next.js + Appwrite Cloud architecture`, `OpenGet logo (braces + upward arrow on orange gradient)`, `Next.js app icon`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Single-function deploy script`** (2 nodes): `deploy-single-function.js`, `main()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next.js middleware`** (2 nodes): `middleware.ts`, `middleware()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Logo component`** (2 nodes): `logo.tsx`, `LogoIcon()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `next-env.d.ts`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `next.config.js`** (1 nodes): `next.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `PostCSS config`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tailwind config`** (1 nodes): `tailwind.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Shared TypeScript types`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Architecture documentation`** (1 nodes): `Next.js + Appwrite Cloud architecture`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `4-factor anti-fraud scoring model`, `Pool lifecycle (Collecting → Active → Completed)`, `Next.js + Appwrite Cloud architecture` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Scoring, pools & cron functions` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `openget-api action router` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._