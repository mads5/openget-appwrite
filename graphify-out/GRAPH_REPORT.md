# Graph Report - .  (2026-04-12)

## Corpus Check
- 53 files · ~36,697 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 147 nodes · 233 edges · 15 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `addStringAttribute()` - 13 edges
2. `ensureCollection()` - 12 edges
3. `addIntegerAttribute()` - 12 edges
4. `executeFunction()` - 9 edges
5. `addFloatAttribute()` - 7 edges
6. `isConflict()` - 6 edges
7. `waitForAttribute()` - 5 edges
8. `setupRepos()` - 5 edges
9. `setupContributors()` - 5 edges
10. `setupRepoContributions()` - 5 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (17): activateAllCollectingForCurrentMonth(), activatePool(), daysInMonth(), ensureActivePools(), ensureCollectingPools(), fetchGithubUser(), fetchMonthlyPrStats(), fetchStatsContributors() (+9 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (22): checkUpiQrStatus(), createCheckoutSession(), createUpiQr(), docAttrs(), donate(), executeFunction(), getActivePool(), getCollectingPool() (+14 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (0): 

### Community 3 - "Community 3"
Cohesion: 0.33
Nodes (19): addFloatAttribute(), addIntegerAttribute(), addStringAttribute(), ensureCollection(), ensureDatabase(), isConflict(), main(), setupContributors() (+11 more)

### Community 4 - "Community 4"
Cohesion: 0.19
Nodes (2): oauthRedirectUrl(), startGithubOAuthSession()

### Community 5 - "Community 5"
Cohesion: 0.7
Nodes (4): createTarGz(), deployFunction(), main(), syncExecuteFromConfig()

### Community 6 - "Community 6"
Cohesion: 0.67
Nodes (0): 

### Community 7 - "Community 7"
Cohesion: 1.0
Nodes (2): main(), syncOpengetApiExecute()

### Community 8 - "Community 8"
Cohesion: 1.0
Nodes (0): 

### Community 9 - "Community 9"
Cohesion: 1.0
Nodes (0): 

### Community 10 - "Community 10"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Community 11"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Community 12"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Community 14"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 8`** (2 nodes): `middleware.ts`, `middleware()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 9`** (2 nodes): `logo.tsx`, `LogoIcon()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 10`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (1 nodes): `next.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (1 nodes): `tailwind.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._