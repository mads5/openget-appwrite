# OpenGet — product context

OpenGet is **Trust-as-a-Service** for open source: a **7-factor** non-linear reputation engine with a **vaulted** internal score, **Kinetic tier** names (Spark → Singularity), **percentile rank**, and **GPS-style** factor guidance on profiles. Public surfaces never expose raw numerical scores. **Enterprise** gets **compliance-oriented** supply-chain views and a **B2B talent** API (tier/attestation, not extractable raw weights). See **`docs/REPUTATION_ORACLE.md`** for tier cut rules and scope decisions.

Stack: **Next.js 14** (App Router) on **Appwrite Sites** — UI v2 uses **Outfit** + **JetBrains Mono** and a teal verification theme. **Appwrite** (Auth, Databases, Functions) in **Singapore**, **GitHub** API for public metadata. **Database** includes **`app_meta`**, **`internal_reputation`** (server-only vault), **`repo_guardians`** (stewardship graph), and **`openget-api`** `health` / `version` actions for ops. See `README.md` for setup and environment variables.

Cursor rule: **`.cursor/rules/openget.mdc`**.
