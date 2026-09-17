# CLAUDE.md — Project Context for AI Assistants

This file exists so that **any AI assistant** (Claude, or another model/tool) can pick up this project cold and understand what it is, how it's built, and how to work on it correctly. Read this fully before writing any code. If something here conflicts with what you observe in the actual codebase, the codebase wins — but flag the mismatch to the developer instead of silently guessing.

Companion files:
- [DEV.md](./DEV.md) — human developer setup guide, folder structure, commands.
- [FEATURES.md](./FEATURES.md) — the living backlog/tracker and the mandatory workflow for building each feature.
- [README.md](./README.md) — quick project overview for anyone landing on the repo.

## 1. What this project is

**STRIKE** is a cross-border payment pricing/quoting engine. A sales user builds a **quote** for a client, adds one or more **corridors** (a priced payment lane, e.g. "US → Mexico, payout in MXN"), the system computes revenue/margin/take-rate for each corridor and for the quote as a whole, and the quote can go through an approval workflow before being turned into client-facing documents.

This is a **from-scratch rebuild** of an earlier codebase (referred to below as "the old project", located at `D:\buy-frame\STRIKE`). The old project works, but has structural problems: duplicated implementations of the same feature, inconsistent naming, ad-hoc folder structure, and comments/patterns that don't follow a single convention. **Do not copy code from the old project.** Its database schema and business rules are a reference for *what the system needs to do*, not for *how to build it*. When in doubt, prefer the industry-standard AdonisJS/React pattern over whatever the old project did.

## 2. Non-negotiable working process

**This is the most important section for an AI assistant to internalize.** The developer has explicitly asked for step-by-step, reviewable progress — not large unattended batches of work.

- **Plan before coding.** Before writing any implementation for a step, state the approach (what will be built, which endpoints/files, what will be tested) and get a go-ahead — even when the next step is obvious from FEATURES.md.
- **Research the old app's real code before writing any plan that touches functionality it also has.** A plan is never based on memory, screenshots, general impressions, or guessing at what the old app "probably" does — read its actual source (`D:\buy-frame\STRIKE`) for the relevant feature first, cite specific files/behavior, and build the plan on that evidence. This has already caught real cases where the old app's UI text lies about its own behavior (e.g. a false "skip corridors without data" claim, a dead "below minimum spread" check) — a plan built without this grounding risks porting a bug or missing one.
- **Confirm before deciding on any implementation detail with more than one reasonable approach** — not just big architecture calls (framework, database, state library), but smaller in-the-weeds ones too (e.g. whether components call the API directly or through a shared hook, how a token gets stored). Surface the choice and ask instead of silently picking one.
- **One step at a time.** Do not scaffold, implement, or wire up multiple unrelated pieces in a single pass. Finish and get confirmation on one thing before starting the next.
- **Follow [FEATURES.md](./FEATURES.md).** It lists every feature, its status, and the current priority order. Do not start work that isn't tracked there — add an entry first.
- **Backend before frontend, every time.** For any feature: build the backend (migrations, models, controllers, validation) and write test cases for every endpoint it adds. Get those tests passing before writing a single line of frontend code for that feature.
- **Update the Postman collection with the backend, not after.** Any time an endpoint is added or its request/response shape changes, add or update its request in `postman/STRIKE.postman_collection.json` (see DEV.md §7) in that same step — it's part of "the backend is done," not a separate cleanup task.
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
| HTTP client | axios, wrapped in one configured instance (`src/lib/api-client.ts`) | A single place to set the base URL and attach the auth token to every request (via an interceptor), instead of each call site repeating that setup. |
| API access pattern | Custom hooks per resource (e.g. `useLogin`, `useLogout`, `useMe`), built on TanStack Query + the shared axios instance | Components never call `axios`/the API client directly — they call a hook. This keeps API logic (URLs, error shaping, cache invalidation) in one place per resource instead of scattered across components, and makes it possible to change how a resource is fetched without touching every component that uses it. |
| Token storage | A small dedicated module (`src/lib/token-storage.ts`) wrapping `localStorage`, not calls scattered across components | Same reasoning as the API pattern above — one place owns "how is the token persisted," so components and the axios interceptor both go through it instead of calling `localStorage` directly. Components read "am I logged in / who am I" via the `useMe()` query, not by reading the token themselves. |
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
- **Volume tier** (renamed from the old project's ambiguous "tier") — a manually-allocated slice of a corridor's yearly volume, priced with its own fixed fee/variable fee %/FX spread. **Not a threshold/breakpoint system** (a prior version of this glossary entry described it as one, e.g. "0–10k transactions: fee $X" — that was never actually how this works, in the old app or the rebuild). A corridor can have up to 3 tiers (Tier 1 = smallest discount off standard, Tier 3 = biggest); whatever volume isn't assigned to a tier prices at the corridor's own standard fields. Set per-corridor (`quote_corridors.pricing_model`), not per-quote like the old app — a quote can freely mix tiered and standard corridors. See FEATURES.md Phase 1b for why this was redesigned rather than ported: the old app's tiered pricing was switched off in production (both options commented out of its only selector) and had several real bugs (an inverted, unintuitive tier-discount direction; per-tier fee columns labelled editable but actually locked; no real per-tier approval checks).
- **Corridor risk classification** (the old project's *other*, unrelated use of "tier" — e.g. G10/G20/Exotic) is a separate concept from volume tiers and, if we need it later, must get its own distinct name (e.g. `riskClass`) — never call it "tier" alongside volume tiers.
- **Quote aggregates** — computed rollups (total yearly revenue/margin, take rate) derived from a quote's corridors. In this rebuild these are **computed on read** (or cached explicitly with a documented invalidation rule), never silently duplicated across multiple columns the way the old schema did.

When adding new domain terms, define them here so both AI assistants and developers use the same vocabulary.

## 6. Authentication model

We use AdonisJS's built-in **access_tokens** auth guard: a user logs in with email/password, the server issues an opaque API token tied to the user record, and the client sends it as a bearer token. This intentionally avoids the old project's approach (a hand-rolled JWT that was *also* checked against a separate `sessions` table on every request — two sources of truth doing the same job). Roles/permissions (item #5 in FEATURES.md) will be added as a simple `role` enum on the user first; do not build a generic permissions-matrix system until there's a real requirement for it.

**There is no public self-registration**, confirmed against the old app's actual behavior: every account is created by an admin, who sets the initial password directly (not an invite-link flow) — the old app then emails the new user that temporary password and a login URL, and they change it later via a separate forgot-password flow. Building the admin-facing "create user" feature is tracked as FEATURES.md item #7. Until it exists, `node ace create:user` (see DEV.md) is the only way to create an account — do not re-add a public `/register` page or endpoint.

## 7. Coding conventions

- **No dead code, no commented-out code, no "just in case" abstractions.** If it's not used, delete it.
- **No random/ad-hoc comments.** Comments explain *why*, not *what* — only add one when the reasoning genuinely isn't obvious from the code. Keep it to one short line; never a paragraph. **Never reference the current phase, session, or task by name** (no "Phase A", "Phase B", "per the user's request", "found while testing X") — that's changelog content, not code documentation, and it rots the moment the phase name means nothing to a future reader. If the code needs that much explanation, the explanation belongs in FEATURES.md, not inline.
- **One implementation per feature.** The old project had two parallel, half-finished implementations of quoting; that must never happen here. If you're rebuilding something, delete the old attempt in the same change.
- **Naming is consistent and spelled correctly.** No near-duplicate fields like the old project's `standard_fixed_fee_usd` vs `std_fixed_fee_usd`, no typos like `fiex_fee_usd`.
- **All UI is built from the shared component library** (`src/components/ui`) and the Tailwind theme tokens defined in `src/index.css` — no inline one-off styling that bypasses the theme.
- **Validate at the boundary.** AdonisJS validators on every controller input; don't re-validate deep inside services.
- Formatting/linting: use the config already set up per app (`eslint.config.js` in server, ESLint/oxlint in client) — don't introduce a second formatter.

## 8. Current status

See [FEATURES.md](./FEATURES.md) for the authoritative, up-to-date status. As of this writing: project docs, monorepo setup, Docker, and Authentication (items #0–#3) are done and committed. Note there is **no public self-registration** — accounts are created by an admin; until the admin dashboard exists (item #7), use `node ace create:user` (see DEV.md). Admin user management (#7) or Quoting MVP (#4) is next.
