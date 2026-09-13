# Features

This file is the single source of truth for **what exists, what's in progress, and what's next**. Every piece of work — infrastructure or product feature — must have an entry here before it's started, and its status must be kept current.

Read this file together with [CLAUDE.md](./CLAUDE.md) (project context) and [DEV.md](./DEV.md) (how to work day-to-day).

## The rule: one step at a time

We do not build several things in parallel or in one long unattended stretch. For every feature in the backlog below, work happens in this exact order, and each stage gate must pass before the next one starts:

0. **Plan first.** Before writing any code for the step, state the approach (what will be built, which files/endpoints, what will be tested) and get a go-ahead. Don't skip straight to implementation just because the next item is obvious from the backlog. If there's more than one reasonable way to build a piece of it, ask which one instead of picking silently.
1. **Backend first.** Build the API for the feature (migrations, models, controllers/services, routes, validation).
2. **Backend tests.** Write test cases for every endpoint the feature adds (happy path + key failure paths). Run them. They must pass.
3. **Frontend.** Only after step 2 is green, build the UI for the feature against the real API.
4. **Test plan.** Write a short manual (or automated, where practical) test plan for the frontend flow, execute it, and confirm it passes.
5. **Explain it.** After finishing a step (or a meaningful chunk of one), give a complete, plain-language summary of what was actually built and how it works — enough for a non-implementer to fully understand what changed, not just "tests passed."
6. **The user tests it personally.** Automated tests passing is necessary but not sufficient. Wait for the user to try it themselves and confirm it's good.
7. **Commit.** Only once backend + tests + frontend + test plan all pass **and the user has personally confirmed it works**, create a git commit for that feature. **Do not start the next feature before this commit exists.**

If a stage fails, fix it and re-run that stage's tests — don't skip ahead.

## Status legend

- `☐` Not started
- `▶` In progress
- `✔` Done (backend tested, frontend tested, committed)

## Backlog

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 0 | Project docs (CLAUDE.md, DEV.md, FEATURES.md, README.md) | ✔ | Committed alongside item #1. |
| 1 | Monorepo setup (npm workspaces + Turborepo, `apps/server` AdonisJS, `apps/client` React/Vite, `packages/shared`, Tailwind v4 + shadcn/ui in client) | ✔ | Root `package.json`/`turbo.json` added; `turbo run build` and `turbo run typecheck` pass across all 3 workspaces; server boots and responds on :3333; client builds. Committed as `chore: monorepo setup`. |
| 2 | Docker setup (Postgres + server + client, `docker-compose.yml`, Dockerfiles) | ✔ | `docker compose up` builds and runs all 3 services; verified: Postgres healthy, server auto-runs migrations and responds on :3333, client (nginx) serves the app and proxies `/api/*` to the server on :5173. Committed as `chore: add Docker setup`. |
| 3 | Authentication (login, logout, "who am I") | ✔ | Priority feature — needed for the Monday client demo. There is **no public self-registration** — see item #7. Backend: login/logout/me endpoints + `create:user` ace command, 11 passing Japa tests (includes a deactivated-account check). Frontend: login page (Thunes branding, navy theme), session persistence, protected home route. `users` table aligned with the old schema's cheap/low-risk fields (see "Users table: schema alignment" below). Postman collection updated. Manually tested and confirmed by the user. |
| 7 | Admin: create & manage users (replaces the interim `create:user` command) | ☐ | High priority — start this before/alongside Quoting. There is no self-service registration in this product (confirmed against the old app): an admin creates every account. In the old app: admin picks email/full name/role/profile, **sets the initial password directly**, the system emails the new user a welcome message with the login URL and that temporary password, and the user changes it later via the normal forgot-password flow (a separate, already-scoped-out feature). Needs: a `user.create`-style permission check (ties into item #5), an admin-only `POST /users`-style endpoint, and an admin UI (a simple table + "Add user" form is enough for v1 — no need to replicate the old app's full profile/manager fields yet). Until this ships, `node ace create:user` (see DEV.md) is the only way to create an account. |
| 4 | Quoting / "New Pricing Request" — the main client-facing feature. Real data, not mock. 7 tabs: Summary, Setup Fee, Pricing, P&L, Quoting Summary, Legal, Approvals. Built in phases — see "Quoting: full scope and phases" below. | ▶ | **Phase 1 backend done and committed**, manually tested and confirmed by the user via Postman: reference data + corridor catalog + Quote/QuoteCorridor CRUD + backend pricing service, 38 passing tests, Postman collection, real reference data imported from the old project. Phases 2-5 (Setup Fee, P&L endpoint, Approvals, Legal doc generation) not started. Phase 1 frontend not started (UI comes from screenshots the user will provide). |
| 5 | Roles & permissions (admin / sales / viewer) | ☐ | Deferred until after the demo unless the client asks for it. |
| 6 | Corridor catalog & tiered/volume pricing | ☐ | Deferred — old project's "quote_aggregates" / "tiered fields" concepts, redesigned cleanly (see CLAUDE.md domain glossary for the naming fix). |
| 8 | Dashboard shell UI (mock data) | ✔ | Manually tested and confirmed by the user (`docs/test-plans/dashboard-shell.md`). UI-only pass, deliberately ahead of Quoting's backend — visual layout + polish for the Monday demo. Full authenticated app shell (header with logos/notifications/user menu, nav tabs) + a Dashboard page (Payment Metrics + Corridor Status panels), matching the old app's layout but rebuilt clean (the old version had 100% hardcoded data, dead duplicate components, and an unused `framer-motion` dependency — see below). All dashboard numbers/tables here are **mock data**, explicitly flagged as such in code, served through hooks shaped like the real ones will be (so swapping in real data from item #4/#6 later is a hook-body change, not a rewrite). Framer Motion is actually used this time: card entrance/hover animations, animated stat count-ups, animated nav-tab underline. "Pricing Requests" and "Approvals" nav tabs exist visually but route to a placeholder page — no backend for either exists yet. Notification bell is static (a badge, no real unread-count backend). |

### Definition of done, per feature (checklist to paste into a PR/commit description)

- [ ] Migrations written and run cleanly on a fresh database
- [ ] Models/relationships implemented
- [ ] Endpoints implemented with input validation
- [ ] Backend tests written for each endpoint (success + at least one failure case) and passing
- [ ] New endpoints added to the Postman collection (`postman/STRIKE.postman_collection.json`), with a test script for anything a later request depends on (e.g. a saved token or ID)
- [ ] Frontend UI implemented against the real API (no mocked data left behind)
- [ ] Frontend test plan written, executed, and passing
- [ ] FEATURES.md status updated to `✔`
- [ ] Committed to git with a message describing the feature

## Stage-1 gate for "Monorepo setup" (item #1)

Before this item can be marked `✔`, the following must all be true and verified:

- [x] Root `package.json` defines npm workspaces (`apps/*`, `packages/*`) and a `turbo.json` pipeline for `dev`/`build`/`lint`/`typecheck`/`test`
- [x] `apps/server` runs (`npm run dev`) and responds on its port (verified: `GET /` → `{"hello":"world"}` on :3333)
- [x] `apps/client` runs (`npm run dev`), builds (`npm run build`), and renders the shadcn-based placeholder page
- [x] `packages/shared` builds and typechecks cleanly, and is linked as a workspace dependency so both apps can import `@strike/shared` — now actually used by the client's auth hooks (`AuthUser`, `AuthSession`, `LoginPayload`, `RegisterPayload`)
- [x] Root `.gitignore`, `.editorconfig`, and shared lint/format config exist
- [x] Everything above is committed in one commit: `chore: monorepo setup` (`047e369`)

## Users table: schema alignment with the old system

To avoid a painful data migration later, the `users` table was checked column-by-column against the old app's actual schema (`priceframe_schema.sql` / `1746000000001_create_identity_system.ts`) and deliberately adopted the fields that are cheap now and costly to add later:

**Adopted now:**
- `first_name` + `last_name` (split, matching the old schema) instead of a single `full_name` — splitting a name after the fact is lossy; done via a proper migration with a backfill, not a data-dropping rewrite.
- `is_active` (boolean, default true) — and it's actually **enforced**: login rejects a deactivated account with 403. A schema column with no behavior behind it isn't worth adding.
- `phone` (nullable) and `timezone` (default `UTC`) — harmless, commonly needed regardless of the old system.

**Deliberately NOT adopted** (would reintroduce complexity CLAUDE.md already says to defer until there's a real need):
- Normalized `roles` and `profiles` **tables** with hierarchy (`parent_role_id`) — we use a simple `role` enum instead (see CLAUDE.md's auth model). If/when item #5 (roles & permissions) needs more than 3 fixed roles, revisit this as its own decision.
- `manager_id`, `created_by`/`modified_by` audit columns, `deleted_at` soft-delete — no feature needs these yet.
- Account lockout fields (`failed_attempts`, `is_locked`, `locked_at`) and MFA fields (`mfa_enabled`, `mfa_secret`, etc.) — real security features, but nothing has asked for them yet; add the columns *when* that feature is actually built, not speculatively.
- Firebase/SSO fields (`firebase_uid`, `auth_provider`, `firebase_email`) — no SSO requirement exists for this rebuild.

If a future data-import task needs any of the "not adopted" fields, that's the point to add them — as their own scoped feature with its own migration, not retrofitted quietly.

## Quoting: full scope and phases (item #4)

This is the main feature the client sees — a "New Pricing Request" with 7 tabs: **Summary, Setup Fee, Pricing, P&L, Quoting Summary, Legal, Approvals**. Investigated the old app's real implementation of all 7 tabs before designing this (see git history for the research); the old system had real weaknesses we're deliberately not repeating:

- **All P&L/revenue/margin numbers were computed in the browser** and stored as an opaque JSON blob — no backend source of truth. **We do it properly: the backend computes and owns every number** (`app/services/quote_pricing_service.ts`); the frontend only displays them.
- **Setup Fee and P&L had no real database tables** — JSON blobs on the quote. We use real, normalized columns/tables instead.
- Duplicate near-identical columns (`standard_fixed_fee_usd` vs `std_fixed_fee_usd`, parallel `_precise` copies of every numeric field) — not repeated here; one canonical numeric column per value.

**Database note:** the old project's binary dump (`priceframe-gm2.sql`) turned out to contain a cleaner, abandoned "v2" schema redesign with real (if small — dev/test-sized, not a full production catalog) reference data: regions, countries, currencies, use cases, ICP hierarchy, integration types, pegged rates, and a small corridor catalog. That data was recovered via `pg_restore` and is now seeded into our schema by `database/seeders/reference_data_seeder.ts` — real data, not invented placeholders, imported deliberately rather than blindly copying the old (messier) production schema.

### Phase 1 — Quote + Corridors + Pricing core — ✔ backend done, tested, committed

- Reference/lookup tables: `regions`, `countries`, `currencies`, `use_cases`, `integration_types`, `icp_nodes`, `pegged_rates` — seeded from real old-project data.
- `corridors` — the catalog a user picks from when adding a corridor to a quote.
- `quotes` — header: name, status (draft/submitted/approved/rejected/closed), owner, opportunity type, partner country, use case(s), integration type, 3 independent ICP levels, contract length, currencies, plus (added once real Summary-tab screenshots arrived) `show_fx_source_in_contract`/`show_fx_spread_in_contract`, `fx_model`, `selected_pricing_strategy`, `selected_fx_pricing`, `default_fee_currency_id`.
- **Multi-value fields, matching the old app exactly** (confirmed required, not simplified): a quote can have several funding currencies and several source currencies (`quote_funding_currencies`/`quote_source_currencies` join tables) and several use cases (`quote_use_cases`) — `funding_currency_id`/`source_currency_id` on the quote itself remain the "default" one shown first.
- `quote_corridors` — one row per corridor on a quote: inputs (volume, transactions, fixed fee, variable fee %, FX spread, discount %) and backend-computed outputs (revenue, FX margin, total revenue/margin, take rate, `needs_approval` + reasons).
- `app/services/quote_pricing_service.ts` — the single source of truth for all pricing math. **Formulas are a documented first pass** (see comments in that file), not yet confirmed against real finance/business rules — centralized in one file specifically so they're easy to audit/adjust without touching controllers, models, or the frontend.
- `app/services/corridor_facet_service.ts` + `GET /reference/corridors/facets` — per-dimension corridor counts (region/country/service/transaction-type/payout-currency/payer) given any combination of active filters, powering the "Corridors to Offer" picker. A dimension's own active filter doesn't narrow its own counts (so the UI can show what picking something else would do).
- Endpoints: `GET/POST /reference/*` (lookups + catalog + facets), `GET/POST/PATCH/DELETE /quotes`, `POST/PATCH/DELETE /quotes/:id/corridors/:id`. A quote is only editable (header or corridors) while `status = 'draft'`; an owner sees only their own quotes, an admin sees all.
- 44 passing tests (25 functional + 8 unit + 11 auth), Postman collection updated with Reference Data + Quotes folders including the new facets endpoint.
- Frontend not started — UI will be built from screenshots the user provides. Setup Fee tab (Phase 2) will show a placeholder until its backend exists.

### Phase 2 — Setup Fee (not started)

Real, normalized fields (not a JSON blob): fee type, amount, network joining fee, minimum commitment fee schedule, payment schedule. Scope intentionally smaller than the old app's ~10 "other fee" line items and tiered/principal MCF schedules — add those only if actually needed.

### Phase 3 — P&L endpoint (not started)

A `GET /quotes/:id/pnl`-style endpoint producing 3-year projections from the quote's corridors + setup fee, using growth-rate inputs — computed by the backend, not the client. Quoting Summary is just a read view over Phases 1-3, no new tables.

### Phase 4 — Approvals (not started)

Deliberately simple for v1: a quote has one approval record (approver, decision, comment, timestamp), no multi-step chain or auto-flagging engine yet — those depend on Roles & Permissions (item #5), which isn't built. `needs_approval`/`approval_reasons` per corridor already exist from Phase 1's pricing service.

### Phase 5 — Legal document generation (not started)

Generate a downloadable PDF/DOCX term sheet / fee annex from quote data using a template. Scoped to generation + download only — **not** the old system's in-browser collaborative document editing, comment threads, or Google Drive sync; those are separate, much larger subsystems.

## Template: adding a new feature

Copy this block into the Backlog table (as a new row) and, if it's non-trivial, expand it into its own subsection below the table like "Quoting MVP scope" above.

```
| # | <Feature name> | ☐ | <one-line description of scope and why it's needed> |
```

Subsection template for a non-trivial feature:

```markdown
## <Feature name> scope

- What it does, in plain language.
- What's explicitly OUT of scope for the first pass.
- Any domain terms that need defining (add them to CLAUDE.md's glossary too).

### Backend
- [ ] Migration(s):
- [ ] Model(s):
- [ ] Endpoint(s): `METHOD /path` — purpose
- [ ] Tests:

### Frontend
- [ ] Page(s)/component(s):
- [ ] API integration:
- [ ] Test plan:
```
