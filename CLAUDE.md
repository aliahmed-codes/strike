# CLAUDE.md — Project Context for AI Assistants

This file exists so that **any AI assistant** (Claude, or another model/tool) can pick up this project cold and understand what it is, how it's built, and how to work on it correctly. Read this fully before writing any code. If something here conflicts with what you observe in the actual codebase, the codebase wins — but flag the mismatch to the developer instead of silently guessing.

Companion files:
- [DEV.md](./DEV.md) — human developer setup guide, folder structure, commands.
- [FEATURES.md](./FEATURES.md) — the living backlog/tracker and the mandatory workflow for building each feature.
- [README.md](./README.md) — quick project overview for anyone landing on the repo.

## 1. What this project is

**PriceFRAME** is a cross-border payment pricing/quoting engine. A sales user builds a **quote** for a client, adds one or more **corridors** (a priced payment lane, e.g. "US → Mexico, payout in MXN"), the system computes revenue/margin/take-rate for each corridor and for the quote as a whole, and the quote can go through an approval workflow before being turned into client-facing documents.

This is a **from-scratch rebuild** of an earlier codebase (referred to below as "the old project", located at `D:\buy-frame\STRIKE`). The old project works, but has structural problems: duplicated implementations of the same feature, inconsistent naming, ad-hoc folder structure, and comments/patterns that don't follow a single convention. **Do not copy code from the old project.** Its database schema and business rules are a reference for *what the system needs to do*, not for *how to build it*. When in doubt, prefer the industry-standard AdonisJS/React pattern over whatever the old project did.

## 2. Non-negotiable working process

**This is the most important section for an AI assistant to internalize.** The developer has explicitly asked for step-by-step, reviewable progress — not large unattended batches of work.

- **Plan before coding.** Before writing any implementation for a step, state the approach (what will be built, which endpoints/files, what will be tested) and get a go-ahead — even when the next step is obvious from FEATURES.md.
- **One step at a time.** Do not scaffold, implement, or wire up multiple unrelated pieces in a single pass. Finish and get confirmation on one thing before starting the next.
- **Follow [FEATURES.md](./FEATURES.md).** It lists every feature, its status, and the current priority order. Do not start work that isn't tracked there — add an entry first.
- **Backend before frontend, every time.** For any feature: build the backend (migrations, models, controllers, validation) and write test cases for every endpoint it adds. Get those tests passing before writing a single line of frontend code for that feature.
- **Test plan before moving on.** Once the frontend for a feature is built against the real (non-mocked) API, write and execute a test plan for it. It must pass before starting the next feature.
- **Explain what was built.** After finishing a step, give a complete, plain-language summary of what was actually built and how it works — the user is building this project through AI assistance but wants to remain a fully-informed developer, not just receive finished code.
- **The user tests it personally before any commit.** Automated tests passing (Japa, typecheck, build) is necessary but never sufficient on its own — wait for the user to try the change themselves and explicitly confirm it, every time, before committing.
- **Commit only after that confirmation.** A feature is "done" once backend tests pass, frontend works against the real API, its test plan passes, **and the user has personally confirmed it**. Only then commit it to git with a clear message. **Never start the next feature on top of an uncommitted one, and never commit on the strength of automated tests alone.**
- If you're unsure whether something is in scope for the current step, stop and ask rather than expanding scope on your own.

## 3. Tech stack and why

| Layer | Choice | Why |
|---|---|---|
| Backend framework | AdonisJS 6 (TypeScript) | Matches the old project's proven stack; batteries-included (Lucid ORM, validation, auth, ace CLI) reduces boilerplate and bikeshedding. |
| ORM | Lucid | Ships with AdonisJS; migrations + models + query builder in one place. |
| Database | PostgreSQL | Industry standard for relational, transactional data with strong JSON support (useful for things like tiered-pricing breakpoints later). |
| Auth | AdonisJS `@adonisjs/auth` with the **access_tokens** guard | Standard, well-tested token auth. We do **not** reinvent auth with hand-rolled JWTs + a parallel sessions table the way the old project did (see §5). |
| Frontend | React + Vite + TypeScript | Fast dev loop, no framework magic, full control. |
| Server-state management | TanStack Query | Handles all data fetched from the API (auth session, quotes, etc.) — caching, loading/error states, refetching. This is the only place server data lives; components never copy it into a separate client store. |
| Client-state management | Zustand | For the small amount of state that is genuinely client-only and shared across components (e.g. a multi-step quote-wizard draft that must survive navigation, global UI toggles) — not for anything fetched from the API. Chosen over Redux/Redux Toolkit because, with TanStack Query already owning server state, what's left for a client store to manage is small and mostly independent; Redux's ceremony (actions/reducers/slices, a dedicated store Provider) is built to make a *large, interdependent* state tree predictable, which isn't this app's shape, and Redux's other real advantages (Redux DevTools' time-travel debugging, conventions that keep 10+ engineers or rotating teams consistent over years) don't apply at this team's current size. **Revisit this in favor of Redux Toolkit if** the team grows substantially, or if a pricing-calculation bug ever needs serious record/replay debugging — that's a deliberate trigger to re-decide, not a default to drift into. Purely local state (a dropdown being open, a single form's in-progress values) still stays in `useState`/`useReducer`, not Zustand. |
| Styling | Tailwind CSS v4 | Utility-first, themeable via CSS variables, no hand-written random CSS. |
| Component layer | shadcn/ui pattern (Radix primitives + `class-variance-authority` + the `cn` utility), copied into `apps/client/src/components/ui` | We **own** these components (they're not a black-box npm dependency) so they can be themed and extended consistently. All new UI must reuse these primitives instead of one-off styled elements. |
| Monorepo tooling | npm workspaces + Turborepo | Single install, shared scripts, cached/parallel builds across `apps/*` and `packages/*`. |
| Shared code | `packages/shared` | TypeScript types/DTOs shared between server and client (e.g. `Quote`, `AuthUser`) so the two apps can't silently drift out of sync. |
| Backend testing | Japa (`@japa/runner`, `@japa/api-client`, `@japa/plugin-adonisjs`) | The official AdonisJS test runner, already wired by the starter kit (`apps/server/tests/bootstrap.ts`). `@japa/plugin-adonisjs` boots the real app (DB, container bindings) inside tests and `@japa/api-client` issues real HTTP requests against real routes — not something we chose generically, it's what AdonisJS's own tooling (`testUtils.db().migrate()/truncate()`) is built around. |
| Containerization | Docker + docker-compose | One-command spin-up (Postgres + server + client) on any machine. |

## 4. Repository layout

```
new strike/
├── apps/
│   ├── server/           AdonisJS backend (API only)
│   └── client/           React + Vite frontend
├── packages/
│   └── shared/           Shared TypeScript types/DTOs, built to dist/ and consumed by both apps
├── docker/                Dockerfiles (added when Docker setup is built — see FEATURES.md #2)
├── docs/                  Longer-form docs (deployment notes, ADRs) that don't belong in the four root .md files
├── CLAUDE.md              This file
├── DEV.md                 Developer setup guide
├── FEATURES.md            Feature backlog + mandatory build process
└── README.md              Project overview
```

Inside `apps/server`, follow AdonisJS conventions (`app/controllers`, `app/models`, `app/validators`, `app/services`, `database/migrations`, `start/routes.ts`). Inside `apps/client`, feature code lives under `src/features/<feature-name>/` (components, hooks, api calls specific to that feature); anything reusable across features lives in `src/components/ui` (primitives) or `src/lib`.

## 5. Domain glossary (redesigned, cleaned up from the old project)

The old project used the word **"tier"** for two unrelated concepts, which was confusing. In this rebuild:

- **Corridor** — a single priced payment lane on a quote: origin country → destination country, in a given payout currency.
- **Volume tier** (renamed from the old project's ambiguous "tier") — a volume-based pricing breakpoint on a corridor (e.g. "0–10k transactions/year: fixed fee $X"; "10k+: fixed fee $Y"). Only relevant once pricing model = `volume_tiered`. Not part of the MVP (see FEATURES.md item #6).
- **Corridor risk classification** (the old project's *other*, unrelated use of "tier" — e.g. G10/G20/Exotic) is a separate concept from volume tiers and, if we need it later, must get its own distinct name (e.g. `riskClass`) — never call it "tier" alongside volume tiers.
- **Quote aggregates** — computed rollups (total yearly revenue/margin, take rate) derived from a quote's corridors. In this rebuild these are **computed on read** (or cached explicitly with a documented invalidation rule), never silently duplicated across multiple columns the way the old schema did.

When adding new domain terms, define them here so both AI assistants and developers use the same vocabulary.

## 6. Authentication model

We use AdonisJS's built-in **access_tokens** auth guard: a user logs in with email/password, the server issues an opaque API token tied to the user record, and the client sends it as a bearer token. This intentionally avoids the old project's approach (a hand-rolled JWT that was *also* checked against a separate `sessions` table on every request — two sources of truth doing the same job). Roles/permissions (item #5 in FEATURES.md) will be added as a simple `role` enum on the user first; do not build a generic permissions-matrix system until there's a real requirement for it.

## 7. Coding conventions

- **No dead code, no commented-out code, no "just in case" abstractions.** If it's not used, delete it.
- **No random/ad-hoc comments.** Comments explain *why*, not *what* — only add one when the reasoning genuinely isn't obvious from the code.
- **One implementation per feature.** The old project had two parallel, half-finished implementations of quoting; that must never happen here. If you're rebuilding something, delete the old attempt in the same change.
- **Naming is consistent and spelled correctly.** No near-duplicate fields like the old project's `standard_fixed_fee_usd` vs `std_fixed_fee_usd`, no typos like `fiex_fee_usd`.
- **All UI is built from the shared component library** (`src/components/ui`) and the Tailwind theme tokens defined in `src/index.css` — no inline one-off styling that bypasses the theme.
- **Validate at the boundary.** AdonisJS validators on every controller input; don't re-validate deep inside services.
- Formatting/linting: use the config already set up per app (`eslint.config.js` in server, ESLint/oxlint in client) — don't introduce a second formatter.

## 8. Current status

See [FEATURES.md](./FEATURES.md) for the authoritative, up-to-date status. As of this writing: project docs, monorepo setup, and Docker (items #0–#2) are done and committed. Authentication (#3) is next.
