# Work-area tags (`eligible_pool_types`)

Repositories may carry a JSON list of **work-area tag ids** in Appwrite `repos.eligible_pool_types`, computed during nightly scoring. These tag ids align with the constants in `src/lib/pool-types.ts` and related server modules.

| Tag id | Label (UI) | Rough meaning |
|--------|------------|----------------|
| `community_match` | Community match | Broad, community-weighted fit |
| `innovation` | Innovation & incubation | Newer or experimental work |
| `security_compliance` | Security & compliance | Safety- and hardening-related |
| `deep_deps` | Deep dependencies | Foundational / transitive impact |

The **Focus** column on `/repos` shows these tags. They are **scoring metadata** for how the model buckets repos—not a separate product flow. See the main [README](../README.md) for how OpenGet works today.
