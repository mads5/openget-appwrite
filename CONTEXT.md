# OpenGet — product context

OpenGet is **Human Verification** for open source: a **6-factor** model (merged work, reviews, triage, and related signals) turned into **public scores**, **profiles**, **embeddable SVG badges**, and a **verification JSON API** for integrations. **Enterprise** surfaces focus on **supply-chain and maintainer risk** (audit shell and reports on the roadmap).

Stack: **Next.js 14** (App Router) on **Appwrite Sites** — UI v2 uses **Outfit** + **JetBrains Mono** and a teal verification theme. **Appwrite** (Auth, Databases, Functions) in **Singapore**, **GitHub** API for public metadata. **Database** includes **`app_meta`** for schema generation tracking; **`openget-api`** `health` / `version` actions for ops. See `README.md` for setup and environment variables.

Cursor rule: **`.cursor/rules/openget.mdc`**.
